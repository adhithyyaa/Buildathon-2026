import { describe, it, expect } from 'vitest';
import { ReasonTag } from '@prisma/client';
import { evaluatePolicy, type PolicyInput } from '../policy';
import type { RecoveryPlan } from '../../ai/schemas';
import type { PolicyEnvelope } from '../../ai/context';

// A mid-afternoon IST instant, safely outside quiet hours (21:00–08:00).
const NOON_IST = new Date('2026-01-06T06:30:00.000Z'); // 12:00 IST

const ENVELOPE: PolicyEnvelope = {
  maxRetries: 3,
  maxDiscountPct: 10,
  humanApprovalAmountPaise: 2_500_000,
  quietHoursStart: 21,
  quietHoursEnd: 8,
  minPursuitPaise: 10_000,
  afaThresholdPaise: 1_500_000,
};

function plan(over: Partial<RecoveryPlan['decision']> = {}): RecoveryPlan {
  return {
    diagnosis: { reason_category: 'card_declined', recovery_probability: 0.4, is_auto_retriable: false, rationale: 'x' },
    decision: {
      action: 'send_payment_link',
      channel: 'whatsapp',
      confidence: 0.7,
      requires_human_approval: false,
      retry_delay_hours: 4,
      incentive_pct: 0,
      reason: 'x',
      ...over,
    },
    message: { subject: 's', body: 'b' },
  };
}

function input(over: Partial<PolicyInput> = {}): PolicyInput {
  return {
    plan: over.plan ?? plan(),
    amountPaise: 50_000, // ₹500 — above the pursuit floor, below approval/AFA thresholds
    attempts: 0,
    optedOut: false,
    isAutoRetriable: false,
    reasonTag: ReasonTag.card_declined,
    now: NOON_IST,
    policy: ENVELOPE,
    allowedActions: ['smart_retry', 'send_payment_link', 'send_reminder', 'offer_incentive', 'escalate_to_human', 'no_action'],
    ...over,
  };
}

describe('policy engine — the deterministic guardrails', () => {
  it('RBI TAT: a failed-but-debited case is held (no action) awaiting auto-reversal', () => {
    const d = evaluatePolicy(input({ reasonTag: ReasonTag.debited_pending_reversal, plan: plan({ action: 'smart_retry' }) }));
    expect(d.outcome).toBe('blocked');
    expect(d.finalAction).toBe('no_action');
    expect(d.notes.join(' ')).toMatch(/reversal/i);
  });

  it('hard-decline triage: a smart_retry on a non-auto-retriable failure is overridden to a fresh link', () => {
    const d = evaluatePolicy(input({ plan: plan({ action: 'smart_retry' }), isAutoRetriable: false, reasonTag: ReasonTag.card_declined }));
    expect(d.finalAction).toBe('send_payment_link');
  });

  it('auto-retriable failures may retry (not overridden)', () => {
    const d = evaluatePolicy(input({ plan: plan({ action: 'smart_retry', retry_delay_hours: 2 }), isAutoRetriable: true, reasonTag: ReasonTag.bank_downtime }));
    expect(d.finalAction).toBe('smart_retry');
    expect(d.outcome).toBe('approved');
  });

  it('opted-out customers never receive outreach', () => {
    for (const action of ['send_payment_link', 'send_reminder', 'offer_incentive'] as const) {
      const d = evaluatePolicy(input({ optedOut: true, plan: plan({ action }), isAutoRetriable: false }));
      const outreach = ['send_payment_link', 'send_reminder', 'offer_incentive'];
      expect(outreach.includes(d.finalAction)).toBe(false);
    }
  });

  it('incentive is capped to the merchant max discount', () => {
    const d = evaluatePolicy(input({ plan: plan({ action: 'offer_incentive', incentive_pct: 40 }) }));
    expect(d.finalIncentivePct).toBeLessThanOrEqual(ENVELOPE.maxDiscountPct);
  });

  it('any incentive forces human approval', () => {
    const d = evaluatePolicy(input({ plan: plan({ action: 'offer_incentive', incentive_pct: 10 }) }));
    expect(d.requiresHumanApproval).toBe(true);
    expect(d.outcome).toBe('escalate');
  });

  it('high-value cases require human approval', () => {
    const d = evaluatePolicy(input({ amountPaise: 3_000_000, plan: plan({ action: 'send_payment_link' }) }));
    expect(d.requiresHumanApproval).toBe(true);
  });

  it('NPCI retry cap: at the cap, retries escalate instead of retrying again', () => {
    const d = evaluatePolicy(input({ attempts: 3, isAutoRetriable: true, reasonTag: ReasonTag.bank_downtime, plan: plan({ action: 'smart_retry' }) }));
    expect(d.outcome).toBe('escalate');
    expect(d.finalAction).toBe('escalate_to_human');
  });

  it('AFA ceiling: a high-value auto-retry requires an additional-factor / human step', () => {
    const d = evaluatePolicy(input({ amountPaise: 1_600_000, isAutoRetriable: true, reasonTag: ReasonTag.insufficient_funds, plan: plan({ action: 'smart_retry' }) }));
    expect(d.requiresHumanApproval).toBe(true);
  });

  it('below the pursuit floor, nothing is pursued', () => {
    const d = evaluatePolicy(input({ amountPaise: 5_000, plan: plan({ action: 'send_payment_link' }) }));
    expect(d.outcome).toBe('blocked');
  });

  it('an action outside the allow-list is blocked (defense in depth)', () => {
    const d = evaluatePolicy(input({ allowedActions: ['no_action'], plan: plan({ action: 'send_payment_link' }) }));
    expect(d.outcome).toBe('blocked');
  });

  it('a live failure spike defers the retry for that reason', () => {
    const d = evaluatePolicy(input({
      isAutoRetriable: true,
      reasonTag: ReasonTag.bank_downtime,
      plan: plan({ action: 'smart_retry' }),
      incidentReasons: new Set(['bank_downtime']),
    }));
    expect(d.finalAction).toBe('no_action');
    expect(d.notes.join(' ')).toMatch(/spike/i);
  });

  it('Recovery Lab auto-suppression: a reason with no proven lift takes no action', () => {
    const d = evaluatePolicy(input({
      reasonTag: ReasonTag.unknown,
      plan: plan({ action: 'send_payment_link' }),
      suppressedReasons: new Set(['unknown']),
    }));
    expect(d.finalAction).toBe('no_action');
    expect(d.notes.join(' ')).toMatch(/suppress/i);
  });
});
