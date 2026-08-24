import { ActionType, Channel, ReasonTag } from '@prisma/client';
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
import { proposeRecoveryPlan } from '../ai/decide';
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
  };
}

export interface RunResult {
  caseId: string;
  ranPipeline: boolean;
  action?: ActionType;
  outcome?: string;
  finalState?: string;
  source?: 'ai' | 'fallback';
}

/**
 * Run the full recovery pipeline for one case that is currently `at_risk`:
 *   score (deterministic) -> analyze -> AI diagnosis+decision -> policy -> execute.
 * Persists a Decision row and drives all state transitions + audit logs.
 */
export async function runCase(caseId: string, now: Date = new Date()): Promise<RunResult> {
  const kase = await prisma.case.findUniqueOrThrow({
    where: { id: caseId },
    include: { event: true, customer: true, merchant: true },
  });

  if (kase.state !== 'at_risk') {
    return { caseId, ranPipeline: false };
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

  // 2. AI diagnosis + decision (or deterministic fallback).
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

  const result = await proposeRecoveryPlan(ctx);
  const plan = result.plan;

  const suggestedRetryAt =
    plan.decision.action === 'smart_retry'
      ? new Date(now.getTime() + Math.max(0, plan.decision.retry_delay_hours) * 3_600_000)
      : null;

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
      valid: result.valid,
      usedFallback: result.usedFallback,
      latencyMs: result.latencyMs,
    },
  });

  // The AI's diagnosis refines the baseline reason + recovery probability.
  await prisma.case.update({
    where: { id: caseId },
    data: {
      reasonTag: plan.diagnosis.reason_category as ReasonTag,
      recoveryProbability: plan.diagnosis.recovery_probability,
      assignedAction: plan.decision.action as ActionType,
    },
  });

  await transition(caseId, 'action_selected', {
    step: 'ai_decision',
    actor: result.source === 'ai' ? 'ai' : 'system',
    details: {
      source: result.source,
      action: plan.decision.action,
      confidence: plan.decision.confidence,
      valid: result.valid,
      fallbackReason: result.fallbackReason,
      latencyMs: result.latencyMs,
    },
  });

  // 3. Deterministic policy engine (can override the AI).
  const policy = evaluatePolicy({
    plan,
    amountPaise: kase.amount,
    attempts: kase.attempts,
    optedOut: kase.customer?.optedOut ?? false,
    isAutoRetriable: isAutoRetriable(reasonTag),
    now,
    policy: policyEnvelope(),
    allowedActions: ALLOWED_ACTIONS,
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
