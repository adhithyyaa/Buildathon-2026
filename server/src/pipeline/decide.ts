import { ActionType, Channel, ReasonTag } from '@prisma/client';
import { mlPredict } from '../ml/client';
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
  calibratedConfidence: number | null;
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

export async function decideCase(ctx: DecisionContext, fargs: FeatureArgs): Promise<DecideResult> {
  const started = Date.now();
  const ml = await mlPredict(buildFeatures(fargs));

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
        confidence: ml.calibrated_confidence,
        requires_human_approval: ml.escalation_probability > 0.6,
        retry_delay_hours: action === 'smart_retry' ? retryDelayHours(reasonTag) : 0,
        incentive_pct: action === 'offer_incentive' ? ctx.policy.maxDiscountPct : 0,
        reason: `ML chose ${action} (confidence ${(ml.calibrated_confidence * 100).toFixed(0)}%, escalation risk ${(ml.escalation_probability * 100).toFixed(0)}%).`,
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
      calibratedConfidence: ml.calibrated_confidence,
      escalationProbability: ml.escalation_probability,
      anomalyScore: ml.anomaly_score,
      reasonTag,
      perAction: ml.per_action_recovery,
      latencyMs: Date.now() - started,
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
    calibratedConfidence: null,
    escalationProbability: null,
    anomalyScore: null,
    reasonTag: fb.diagnosis.reason_category as ReasonTag,
    perAction: null,
    latencyMs: Date.now() - started,
  };
}
