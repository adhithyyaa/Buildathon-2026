import { ActionType, Channel, ReasonTag } from '@prisma/client';
import { mlPredict, type MlPrediction } from '../ml/client';
import { buildFeatures, type FeatureArgs } from '../ml/features';
import { fallbackPlan } from '../ai/fallback';
import { templateMessage } from '../ai/messages';
import { isAutoRetriable } from '../domain/reasons';
import type { RecoveryPlan } from '../ai/schemas';
import type { DecisionContext } from '../ai/context';

/**
 * ML-first decisioning. The tabular models (CatBoost primary) decide the action
 * and produce calibrated probabilities; the LLM is NOT in this path. If the ML
 * service is unreachable, we fall back to the deterministic rule-based plan so the
 * pipeline never stalls. Either way, deterministic policy + executor run next.
 */
export interface DecideResult {
  plan: RecoveryPlan;
  source: 'ml' | 'fallback';
  model: string;
  modelVersion: string | null;
  recoveryProbability: number;
  actionClass: ActionType;
  actionConfidence: number | null;
  escalationProbability: number | null;
  anomalyScore: number | null;
  reasonTag: ReasonTag;
  perAction: Record<string, number> | null;
  latencyMs: number;
}

const OUTREACH = new Set(['send_payment_link', 'send_reminder', 'offer_incentive']);

function retryDelayHours(reason: string): number {
  if (reason === 'bank_downtime') return 2;
  if (reason === 'upi_collect_timeout') return 3;
  if (reason === 'insufficient_funds') return 6;
  return 4;
}

/** Smallest useful discount, scaled by how unlikely the case is to recover on its own, capped by policy. */
function incentiveFor(recoveryProbability: number, maxPct: number): number {
  if (maxPct <= 0) return 0;
  const scaled = Math.round((1 - Math.max(0, Math.min(1, recoveryProbability))) * maxPct);
  return Math.max(1, Math.min(maxPct, scaled));
}

/**
 * `precomputedMl` lets a batch caller (e.g. /process) score every case's features in ONE round-trip and
 * inject the result here, instead of each case paying a serial ML call. Semantics: `undefined` → fetch
 * per-case (the single-case path); an object → use it; `null` → treat ML as unreachable → deterministic
 * fallback. Behaviour is otherwise identical to fetching inline.
 */
export async function decideCase(
  ctx: DecisionContext,
  fargs: FeatureArgs,
  precomputedMl?: MlPrediction | null,
  /** The ML round-trip cost for this case when the prediction was precomputed (a batch caller passes its
   *  per-case share of the batch call). Without it, `latencyMs` would time only the injection (~0ms)
   *  and misreport inference latency on the model-health panel. */
  mlLatencyMs?: number,
): Promise<DecideResult> {
  const started = Date.now();
  const ml = precomputedMl !== undefined ? precomputedMl : await mlPredict(buildFeatures(fargs));

  if (ml) {
    const action = ml.action_class as ActionType;
    const reasonTag = ml.reason_tag as ReasonTag;
    const channel: Channel = OUTREACH.has(action) ? 'whatsapp' : 'none';

    const plan: RecoveryPlan = {
      diagnosis: {
        reason_category: reasonTag,
        recovery_probability: ml.recovery_probability,
        is_auto_retriable: isAutoRetriable(reasonTag),
        rationale: `CatBoost: ${reasonTag}; best action ${action} at calibrated p=${ml.recovery_probability.toFixed(2)}.`,
      },
      decision: {
        action,
        channel,
        confidence: ml.action_confidence,
        requires_human_approval: ml.escalation_probability > 0.6,
        retry_delay_hours: action === 'smart_retry' ? retryDelayHours(reasonTag) : 0,
        // Size the incentive to how much nudging the case actually needs, rather than always
        // spending the full cap: a customer already likely to recover gets a smaller discount
        // (less cannibalisation), a marginal one gets more — bounded by the policy cap, which is
        // now a real ceiling rather than the default. (A discount-elasticity model is the upgrade.)
        incentive_pct: action === 'offer_incentive' ? incentiveFor(ml.recovery_probability, ctx.policy.maxDiscountPct) : 0,
        reason: `ML chose ${action} (confidence ${(ml.action_confidence * 100).toFixed(0)}%, escalation risk ${(ml.escalation_probability * 100).toFixed(0)}%).`,
      },
      message: templateMessage({ merchantName: ctx.merchantName, amountPaise: ctx.amountPaise, customerName: ctx.customer?.name }, action),
    };

    return {
      plan,
      source: 'ml',
      model: `catboost (v${ml.model.version})`,
      modelVersion: ml.model.version,
      recoveryProbability: ml.recovery_probability,
      actionClass: action,
      actionConfidence: ml.action_confidence,
      escalationProbability: ml.escalation_probability,
      anomalyScore: ml.anomaly_score,
      reasonTag,
      perAction: ml.per_action_recovery,
      latencyMs: mlLatencyMs ?? Date.now() - started,
    };
  }

  // Deterministic fallback (ML service down).
  const fb = fallbackPlan(ctx);
  return {
    plan: fb,
    source: 'fallback',
    model: 'deterministic-fallback',
    modelVersion: null,
    recoveryProbability: fb.diagnosis.recovery_probability,
    actionClass: fb.decision.action as ActionType,
    actionConfidence: null,
    escalationProbability: null,
    anomalyScore: null,
    reasonTag: fb.diagnosis.reason_category as ReasonTag,
    perAction: null,
    latencyMs: mlLatencyMs ?? Date.now() - started,
  };
}
