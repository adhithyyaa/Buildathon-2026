import { ActionType, Channel } from '@prisma/client';
import { isQuietHours, nextAllowedTime } from '../lib/time';
import type { RecoveryPlan } from '../ai/schemas';
import type { PolicyEnvelope } from '../ai/context';

/**
 * The deterministic policy engine. It runs AFTER the AI and can override any
 * proposal. This is where "safe, compliant, bounded" lives — the AI never gets
 * the final say on anything that touches a customer or moves money.
 *
 * Outcomes:
 *   approved  -> the executor may dispatch finalAction now (or at scheduledFor).
 *   escalate  -> a human must approve first (high value / incentive / opt-out dead-end).
 *   blocked   -> the action is not permitted at all.
 */
export type PolicyOutcome = 'approved' | 'escalate' | 'blocked';

export interface PolicyInput {
  plan: RecoveryPlan;
  amountPaise: number;
  attempts: number;
  optedOut: boolean;
  isAutoRetriable: boolean;
  now: Date;
  policy: PolicyEnvelope;
  allowedActions: readonly string[];
}

export interface PolicyDecision {
  outcome: PolicyOutcome;
  finalAction: ActionType;
  finalChannel: Channel;
  finalIncentivePct: number;
  requiresHumanApproval: boolean;
  scheduledFor: Date | null;
  notes: string[];
}

const OUTREACH: ActionType[] = ['send_payment_link', 'send_reminder', 'offer_incentive'];

export function evaluatePolicy(input: PolicyInput): PolicyDecision {
  const notes: string[] = [];
  const p = input.policy;

  let action = input.plan.decision.action as ActionType;
  let channel = input.plan.decision.channel as Channel;
  let requiresHumanApproval = input.plan.decision.requires_human_approval;

  // Cap the incentive to the merchant's max discount.
  let incentivePct = Math.min(Math.max(0, input.plan.decision.incentive_pct), p.maxDiscountPct);
  if (incentivePct !== input.plan.decision.incentive_pct) {
    notes.push(`Incentive capped ${input.plan.decision.incentive_pct}% → ${incentivePct}% (max ${p.maxDiscountPct}%).`);
  }

  // 0. Allow-list guard (defense in depth; the AI layer already filters).
  if (!input.allowedActions.includes(action)) {
    notes.push(`Action "${action}" is not in the allow-list; blocked.`);
    return blocked(notes);
  }

  // 1. Opt-out blocks all outreach.
  if (input.optedOut && OUTREACH.includes(action)) {
    notes.push('Customer opted out of outreach; outreach blocked.');
    if (input.isAutoRetriable && input.attempts < p.maxRetries) {
      action = 'smart_retry';
      channel = 'none';
      incentivePct = 0;
      notes.push('Switched to smart_retry (failure is auto-retriable).');
    } else {
      notes.push('No non-outreach recovery path; escalating to a human.');
      return escalate('escalate_to_human', 'none', 0, notes);
    }
  }

  // 2. Retry cap.
  if (action === 'smart_retry' && input.attempts >= p.maxRetries) {
    notes.push(`Max retries (${p.maxRetries}) reached; not retrying again.`);
    return escalate('escalate_to_human', 'none', 0, notes);
  }

  // 3. Incentive requires human approval.
  if (action === 'offer_incentive' && incentivePct > 0) {
    requiresHumanApproval = true;
    notes.push('Incentive proposed → requires human approval.');
  }

  // 4. High-value requires human approval.
  if (input.amountPaise >= p.humanApprovalAmountPaise) {
    requiresHumanApproval = true;
    notes.push(`Amount ≥ human-approval threshold → requires human approval.`);
  }

  // 5. Schedule retries (retries ignore quiet hours; they don't message the customer).
  let scheduledFor: Date | null = null;
  if (action === 'smart_retry') {
    const delayMs = Math.max(0, input.plan.decision.retry_delay_hours) * 3_600_000;
    scheduledFor = new Date(input.now.getTime() + delayMs);
    notes.push(`Retry scheduled in ${input.plan.decision.retry_delay_hours}h.`);
  }

  // 6. Quiet hours defer OUTREACH only.
  if (OUTREACH.includes(action) && isQuietHours(input.now, p.quietHoursStart, p.quietHoursEnd)) {
    scheduledFor = nextAllowedTime(input.now, p.quietHoursStart, p.quietHoursEnd);
    notes.push(`Quiet hours (IST ${p.quietHoursStart}:00–${p.quietHoursEnd}:00); message deferred to ${scheduledFor.toISOString()}.`);
  }

  if (requiresHumanApproval) {
    return escalate(action, channel, incentivePct, notes, scheduledFor);
  }

  notes.push('Policy checks passed.');
  return {
    outcome: 'approved',
    finalAction: action,
    finalChannel: channel,
    finalIncentivePct: incentivePct,
    requiresHumanApproval: false,
    scheduledFor,
    notes,
  };
}

function blocked(notes: string[]): PolicyDecision {
  return { outcome: 'blocked', finalAction: 'no_action', finalChannel: 'none', finalIncentivePct: 0, requiresHumanApproval: false, scheduledFor: null, notes };
}

function escalate(
  finalAction: ActionType,
  finalChannel: Channel,
  finalIncentivePct: number,
  notes: string[],
  scheduledFor: Date | null = null,
): PolicyDecision {
  return { outcome: 'escalate', finalAction, finalChannel, finalIncentivePct, requiresHumanApproval: true, scheduledFor, notes };
}
