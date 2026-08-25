import { ActionType, Channel, ReasonTag } from '@prisma/client';
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
  reasonTag: ReasonTag;
  now: Date;
  policy: PolicyEnvelope;
  allowedActions: readonly string[];
  /** Reasons with an active failure spike right now (from windowed anomaly detection). */
  incidentReasons?: ReadonlySet<string>;
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

  // 0b. Economic floor: not worth spending gateway/outreach cost below this amount.
  if (action !== 'no_action' && input.amountPaise < p.minPursuitPaise) {
    notes.push(`Amount below the ₹${Math.round(p.minPursuitPaise / 100)} pursuit floor; recovery not economical — blocked.`);
    return blocked(notes);
  }

  // 0c. RBI TAT compliance hold: the payment failed but the customer WAS debited. It
  // auto-reverses by T+1 (RBI harmonised TAT, ₹100/day compensation), so ANY retry or
  // outreach now risks a double-debit complaint. Take no action until the reversal settles.
  if (input.reasonTag === 'debited_pending_reversal') {
    notes.push('Failed-but-debited: awaiting RBI TAT T+1 auto-reversal. No retry or outreach (double-debit risk) — hold.');
    return blocked(notes);
  }

  // 0d. Deterministic hard-decline triage: a smart_retry only makes sense for auto-retriable
  // failures (bank downtime, UPI timeout, momentary NSF). On a hard decline a retry just burns
  // a gateway hit — override to a fresh payment link (card-update path). The model never gets
  // to retry a non-retriable failure.
  if (action === 'smart_retry' && !input.isAutoRetriable) {
    notes.push(`"${input.reasonTag}" is not auto-retriable; overriding smart_retry → send_payment_link.`);
    action = 'send_payment_link';
    channel = 'whatsapp';
  }

  // 0e. Live failure-spike defer: if a windowed anomaly says this reason is spiking right now
  // (e.g. a bank/UPI outage), a retry will just fail again and add to the storm — defer it.
  if (action === 'smart_retry' && input.incidentReasons?.has(input.reasonTag)) {
    notes.push(`Active failure spike for "${input.reasonTag}"; deferring retry this cycle (no_action) until it clears.`);
    action = 'no_action';
    channel = 'none';
    incentivePct = 0;
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

  // 2. Retry cap (NPCI e-mandate rule: 1 original attempt + at most `maxRetries` retries).
  if (action === 'smart_retry' && input.attempts >= p.maxRetries) {
    notes.push(`NPCI retry cap reached (1 original + ${p.maxRetries} retries); not retrying again.`);
    return escalate('escalate_to_human', 'none', 0, notes);
  }

  // 2b. AFA ceiling: a high-value auto-debit retry needs an additional-factor-auth / human
  // step (NPCI/RBI e-mandate framework), not a silent retry.
  if (action === 'smart_retry' && input.amountPaise >= p.afaThresholdPaise) {
    requiresHumanApproval = true;
    notes.push(`Retry amount ≥ AFA threshold (₹${Math.round(p.afaThresholdPaise / 100)}); requires an additional-factor-auth / human step.`);
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
