import { ActionType, Channel, Prisma, ReasonTag } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { env } from '../env';
import { logger } from '../lib/logger';
import { minutesBetween } from '../lib/time';
import { computeScores } from '../domain/scoring';
import { isAutoRetriable } from '../domain/reasons';
import { transition } from '../domain/state';
import { logAudit } from '../domain/audit';
import { evaluatePolicy } from '../domain/policy';
import { execute } from '../domain/executor';
import { activeIncidentReasons } from '../domain/incidents';
import { getSuppressedReasons } from '../domain/lab';
import { decideCase } from './decide';
import { mlPredict, type MlPrediction } from '../ml/client';
import { buildFeatures, type FeatureArgs } from '../ml/features';
import type { DecisionContext, PolicyEnvelope } from '../ai/context';

export const ALLOWED_ACTIONS = [
  'smart_retry',
  'send_payment_link',
  'send_reminder',
  'offer_incentive',
  'escalate_to_human',
  'no_action',
] as const;

export function policyEnvelope(): PolicyEnvelope {
  return {
    maxRetries: env.POLICY_MAX_RETRIES,
    maxDiscountPct: env.POLICY_MAX_DISCOUNT_PCT,
    humanApprovalAmountPaise: env.POLICY_HUMAN_APPROVAL_AMOUNT_PAISE,
    quietHoursStart: env.POLICY_QUIET_HOURS_START,
    quietHoursEnd: env.POLICY_QUIET_HOURS_END,
    minPursuitPaise: env.POLICY_MIN_PURSUIT_PAISE,
    afaThresholdPaise: env.POLICY_AFA_THRESHOLD_PAISE,
  };
}

export interface RunResult {
  caseId: string;
  ranPipeline: boolean;
  action?: ActionType;
  outcome?: string;
  finalState?: string;
  source?: 'ml' | 'fallback';
}

/** A case scored and moved to `analyzed`, carrying everything the ML/decision step needs — the
 *  boundary between the two pipeline phases so `/process` can batch the ML call across many cases. */
export interface PreparedCase {
  caseId: string;
  kase: Awaited<ReturnType<typeof loadCase>>;
  ctx: DecisionContext;
  fargs: FeatureArgs;
  features: Record<string, unknown>;
}

function loadCase(caseId: string) {
  return prisma.case.findUniqueOrThrow({ where: { id: caseId }, include: { event: true, customer: true, merchant: true } });
}

/**
 * Phase 1 of the pipeline: load, deterministically score, persist scores, move `at_risk → analyzed`,
 * and — for a held-out control case — run the whole no-action control path and finish here. For a
 * treatment case it builds the decision context + ML features and returns them, WITHOUT calling ML,
 * so a batch caller can score many cases in one round-trip. Returns `{done}` when the case is finished
 * (not-at-risk or control) or `{ready}` when it awaits an ML decision.
 */
export async function prepareCase(caseId: string, now: Date = new Date()): Promise<{ done: RunResult } | { ready: PreparedCase }> {
  const kase = await loadCase(caseId);

  if (kase.state !== 'at_risk') {
    return { done: { caseId, ranPipeline: false } };
  }

  const reasonTag: ReasonTag = kase.reasonTag ?? 'unknown';
  const ageMinutes = minutesBetween(kase.event.createdAt, now);

  // 1. Deterministic scoring.
  const scores = computeScores({
    amountPaise: kase.amount,
    reasonTag,
    retryCount: kase.attempts,
    ageMinutes,
    customer: kase.customer
      ? { priorPayments: kase.customer.priorPayments, priorConversions: kase.customer.priorConversions, optedOut: kase.customer.optedOut }
      : null,
  });

  await prisma.case.update({
    where: { id: caseId },
    data: {
      riskScore: scores.riskScore,
      urgencyScore: scores.urgencyScore,
      recoveryProbability: scores.recoveryPrior,
      recommendedLane: scores.recommendedLane,
    },
  });

  await transition(caseId, 'analyzed', {
    step: 'scored',
    actor: 'system',
    details: { riskScore: scores.riskScore, urgencyScore: scores.urgencyScore, recoveryPrior: scores.recoveryPrior, lane: scores.recommendedLane },
  });

  // Recovery Lab CONTROL arm: this case is a held-out control — the ML takes NO recovery
  // action, so we can later measure how much the treatment arm recovers OVER this baseline
  // (incremental lift, not gross). Score it, hold it, and observe its natural outcome.
  if (kase.arm === 'control') {
    await prisma.case.update({ where: { id: caseId }, data: { assignedAction: 'no_action' } });
    await transition(caseId, 'action_selected', { step: 'control_holdout', actor: 'system', details: { arm: 'control', note: 'held-out control — no recovery action taken' } });
    await transition(caseId, 'action_dispatched', { step: 'control_holdout', actor: 'system', details: { arm: 'control' } });
    await transition(caseId, 'waiting_for_outcome', { step: 'awaiting_outcome', actor: 'system' });
    logger.info('pipeline.control', { caseId });
    return { done: { caseId, ranPipeline: true, action: 'no_action', outcome: 'control', finalState: 'waiting_for_outcome', source: 'fallback' } };
  }

  // 2. Build the decision context + ML features (no ML call yet — the caller decides how to fetch it).
  const ctx: DecisionContext = {
    merchantName: kase.merchant.name,
    amountPaise: kase.amount,
    currency: kase.currency,
    reasonTag,
    method: kase.event.method,
    channel: kase.event.channel,
    retryCount: kase.attempts,
    ageMinutes,
    recoveryPrior: scores.recoveryPrior,
    recommendedLane: scores.recommendedLane,
    customer: kase.customer
      ? { name: kase.customer.name, priorPayments: kase.customer.priorPayments, priorConversions: kase.customer.priorConversions, optedOut: kase.customer.optedOut }
      : null,
    allowedActions: ALLOWED_ACTIONS,
    policy: policyEnvelope(),
  };

  const priorActions = await prisma.action.findMany({ where: { caseId }, orderBy: { createdAt: 'desc' }, take: 5 });
  const lastAction = priorActions[0];

  const fargs: FeatureArgs = {
    amountPaise: kase.amount,
    currency: kase.currency,
    reasonTag,
    method: kase.event.method,
    channel: kase.event.channel,
    attempts: kase.attempts,
    ageMinutes,
    now,
    merchantName: kase.merchant.name,
    customer: kase.customer
      ? { priorPayments: kase.customer.priorPayments, priorConversions: kase.customer.priorConversions, optedOut: kase.customer.optedOut }
      : null,
    urgencyScore: scores.urgencyScore,
    previousContactAttempts: priorActions.filter((a) => a.channel !== 'none').length,
    lastActionType: lastAction ? lastAction.actionType : 'none',
    lastActionOutcome: lastAction ? (lastAction.deliveryStatus ?? lastAction.status) : 'none',
    allowedActions: ALLOWED_ACTIONS,
  };

  return { ready: { caseId, kase, ctx, fargs, features: buildFeatures(fargs) } };
}

/**
 * Phase 2 of the pipeline: given a prepared case and its ML prediction (or `null` if ML was
 * unreachable → deterministic fallback), run the deterministic policy, persist Prediction + Decision,
 * drive the remaining transitions + audit, and execute. Split from Phase 1 so the ML call in between
 * can be batched.
 */
export async function finishCase(prep: PreparedCase, ml: MlPrediction | null, now: Date = new Date()): Promise<RunResult> {
  const { caseId, kase, ctx, fargs } = prep;
  const result = await decideCase(ctx, fargs, ml);
  const plan = result.plan;

  const suggestedRetryAt =
    plan.decision.action === 'smart_retry'
      ? new Date(now.getTime() + Math.max(0, plan.decision.retry_delay_hours) * 3_600_000)
      : null;

  // Persist the ML prediction (the six required outputs + per-action detail).
  await prisma.prediction.create({
    data: {
      caseId,
      source: result.source,
      model: result.model,
      modelVersion: result.modelVersion,
      recoveryProbability: result.recoveryProbability,
      actionClass: result.actionClass,
      actionConfidence: result.actionConfidence,
      escalationProbability: result.escalationProbability,
      anomalyScore: result.anomalyScore,
      reasonTag: result.reasonTag,
      perAction: result.perAction ? (result.perAction as unknown as Prisma.InputJsonValue) : undefined,
      latencyMs: result.latencyMs,
    },
  });

  // Keep the Decision row for the audit/dashboard timeline.
  await prisma.decision.create({
    data: {
      caseId,
      model: result.model,
      kind: 'decision',
      rawOutput: plan as unknown as object,
      action: plan.decision.action as ActionType,
      confidence: plan.decision.confidence,
      channel: plan.decision.channel as Channel,
      reason: plan.decision.reason,
      requiresHumanApproval: plan.decision.requires_human_approval,
      suggestedRetryAt,
      incentivePct: Math.round(plan.decision.incentive_pct),
      valid: result.source === 'ml',
      usedFallback: result.source === 'fallback',
      latencyMs: result.latencyMs,
    },
  });

  // ML refines the reason + recovery probability on the case.
  await prisma.case.update({
    where: { id: caseId },
    data: {
      reasonTag: result.reasonTag,
      recoveryProbability: result.recoveryProbability,
      assignedAction: result.actionClass,
    },
  });

  await transition(caseId, 'action_selected', {
    step: 'ml_decision',
    actor: 'system',
    details: {
      source: result.source,
      model: result.model,
      action: result.actionClass,
      recoveryProbability: result.recoveryProbability,
      confidence: result.actionConfidence,
      escalationProbability: result.escalationProbability,
      anomalyScore: result.anomalyScore,
      latencyMs: result.latencyMs,
    },
  });

  // 3. Deterministic policy engine (can override the ML).
  const policy = evaluatePolicy({
    plan,
    amountPaise: kase.amount,
    attempts: kase.attempts,
    optedOut: kase.customer?.optedOut ?? false,
    isAutoRetriable: isAutoRetriable(result.reasonTag),
    reasonTag: result.reasonTag,
    now,
    policy: policyEnvelope(),
    allowedActions: ALLOWED_ACTIONS,
    incidentReasons: await activeIncidentReasons(now),
    suppressedReasons: await getSuppressedReasons(),
  });

  await logAudit({
    caseId,
    step: 'policy_eval',
    actor: 'policy',
    details: { outcome: policy.outcome, finalAction: policy.finalAction, incentivePct: policy.finalIncentivePct, notes: policy.notes },
  });

  // 4. Execute (or escalate / block).
  const exec = await execute({
    caseId,
    amountPaise: kase.amount,
    currency: kase.currency,
    merchantName: kase.merchant.name,
    customer: kase.customer ? { name: kase.customer.name, email: kase.customer.email, phone: kase.customer.phone } : null,
    plan,
    policy,
    now,
  });

  logger.info('pipeline.ran', { caseId, action: policy.finalAction, outcome: policy.outcome, source: result.source, state: exec.finalState });

  return {
    caseId,
    ranPipeline: true,
    action: policy.finalAction,
    outcome: policy.outcome,
    finalState: exec.finalState,
    source: result.source,
  };
}

/**
 * Run the full recovery pipeline for one `at_risk` case: score → ML decision → deterministic policy →
 * execute. This is the single-case entry point (worker / tick / one-off); `/process` instead calls
 * prepareCase + a batched predict + finishCase across the whole at-risk set. Behaviour is identical.
 */
export async function runCase(caseId: string, now: Date = new Date()): Promise<RunResult> {
  const prepared = await prepareCase(caseId, now);
  if ('done' in prepared) return prepared.done;
  const ml = await mlPredict(prepared.ready.features);
  return finishCase(prepared.ready, ml, now);
}
