import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ReasonTag, type ActionType, type Channel } from '@prisma/client';
import { evaluatePolicy, type PolicyInput } from '../policy';
import type { RecoveryPlan } from '../../ai/schemas';
import type { PolicyEnvelope } from '../../ai/context';

/**
 * Chaos / invariant suite for the policy engine. policy.test.ts checks specific guardrails by
 * example; this hammers the engine with thousands of RANDOMISED adversarial inputs and asserts the
 * safety invariants ALWAYS hold — the properties that must be true no matter what the ML proposes.
 * Invariant-first (a passing example is not a proof; a surviving property over 1000 random cases is
 * much closer). If any property fails, fast-check shrinks to the minimal breaking input.
 */

const ENVELOPE: PolicyEnvelope = {
  maxRetries: 3,
  maxDiscountPct: 10,
  humanApprovalAmountPaise: 2_500_000,
  quietHoursStart: 21,
  quietHoursEnd: 8,
  minPursuitPaise: 10_000,
  afaThresholdPaise: 1_500_000,
};

const ACTIONS: ActionType[] = ['smart_retry', 'send_payment_link', 'send_reminder', 'offer_incentive', 'escalate_to_human', 'no_action'];
const CHANNELS: Channel[] = ['whatsapp', 'sms', 'email', 'none'];
const OUTREACH = new Set<ActionType>(['send_payment_link', 'send_reminder', 'offer_incentive']);
const REASONS = Object.values(ReasonTag);

function buildInput(r: {
  action: ActionType;
  channel: Channel;
  incentivePct: number;
  retryDelay: number;
  requiresHumanApproval: boolean;
  amountPaise: number;
  attempts: number;
  optedOut: boolean;
  isAutoRetriable: boolean;
  reasonTag: ReasonTag;
  hour: number;
}): PolicyInput {
  const plan: RecoveryPlan = {
    diagnosis: { reason_category: r.reasonTag, recovery_probability: 0.4, is_auto_retriable: r.isAutoRetriable, rationale: 'x' },
    decision: {
      action: r.action,
      channel: r.channel,
      confidence: 0.7,
      requires_human_approval: r.requiresHumanApproval,
      retry_delay_hours: r.retryDelay,
      incentive_pct: r.incentivePct,
      reason: 'x',
    },
    message: { subject: 's', body: 'b' },
  };
  return {
    plan,
    amountPaise: r.amountPaise,
    attempts: r.attempts,
    optedOut: r.optedOut,
    isAutoRetriable: r.isAutoRetriable,
    reasonTag: r.reasonTag,
    now: new Date(Date.UTC(2026, 0, 6, r.hour % 24, 0, 0)),
    policy: ENVELOPE,
    allowedActions: ACTIONS,
  };
}

const arbInput = fc
  .record({
    action: fc.constantFrom(...ACTIONS),
    channel: fc.constantFrom(...CHANNELS),
    incentivePct: fc.integer({ min: -5, max: 60 }),
    retryDelay: fc.integer({ min: 0, max: 72 }),
    requiresHumanApproval: fc.boolean(),
    amountPaise: fc.integer({ min: 0, max: 10_000_000 }),
    attempts: fc.integer({ min: 0, max: 6 }),
    optedOut: fc.boolean(),
    isAutoRetriable: fc.boolean(),
    reasonTag: fc.constantFrom(...REASONS),
    hour: fc.integer({ min: 0, max: 23 }),
  })
  .map(buildInput);

describe('policy engine — chaos / invariants (property-based)', () => {
  it('INVARIANT: an opted-out customer is never sent outreach', () => {
    fc.assert(
      fc.property(arbInput, (inp) => !OUTREACH.has(evaluatePolicy({ ...inp, optedOut: true }).finalAction)),
      { numRuns: 1000 },
    );
  });

  it('INVARIANT: a failed-but-debited case (RBI TAT) is always held — blocked, no action', () => {
    fc.assert(
      fc.property(arbInput, (inp) => {
        const d = evaluatePolicy({ ...inp, reasonTag: ReasonTag.debited_pending_reversal });
        return d.outcome === 'blocked' && d.finalAction === 'no_action';
      }),
      { numRuns: 500 },
    );
  });

  it('INVARIANT: nothing below the pursuit floor is ever actioned', () => {
    fc.assert(
      fc.property(arbInput, fc.integer({ min: 0, max: 9_999 }), (inp, amt) => evaluatePolicy({ ...inp, amountPaise: amt }).finalAction === 'no_action'),
      { numRuns: 500 },
    );
  });

  it('INVARIANT: the incentive never exceeds the merchant max discount', () => {
    fc.assert(
      fc.property(arbInput, (inp) => {
        const pct = evaluatePolicy(inp).finalIncentivePct;
        return pct >= 0 && pct <= ENVELOPE.maxDiscountPct;
      }),
      { numRuns: 1000 },
    );
  });

  it('INVARIANT: never retry at or beyond the NPCI retry cap', () => {
    fc.assert(
      fc.property(arbInput, (inp) => evaluatePolicy({ ...inp, attempts: Math.max(inp.attempts, ENVELOPE.maxRetries) }).finalAction !== 'smart_retry'),
      { numRuns: 1000 },
    );
  });

  it('INVARIANT: high-value cases never auto-approve — a human is always in the loop', () => {
    fc.assert(
      fc.property(arbInput, fc.integer({ min: ENVELOPE.humanApprovalAmountPaise, max: 10_000_000 }), (inp, amt) => evaluatePolicy({ ...inp, amountPaise: amt }).outcome !== 'approved'),
      { numRuns: 500 },
    );
  });

  it('INVARIANT: the decision is deterministic — same input, same output', () => {
    fc.assert(
      fc.property(arbInput, (inp) => JSON.stringify(evaluatePolicy(inp)) === JSON.stringify(evaluatePolicy(inp))),
      { numRuns: 500 },
    );
  });

  it('INVARIANT: finalAction is always a valid action type (never garbage)', () => {
    fc.assert(
      fc.property(arbInput, (inp) => ACTIONS.includes(evaluatePolicy(inp).finalAction)),
      { numRuns: 1000 },
    );
  });

  it('INVARIANT: an approved decision only ever dispatches an allow-listed action', () => {
    fc.assert(
      fc.property(arbInput, (inp) => {
        const d = evaluatePolicy(inp);
        return d.outcome !== 'approved' || inp.allowedActions.includes(d.finalAction);
      }),
      { numRuns: 1000 },
    );
  });
});
