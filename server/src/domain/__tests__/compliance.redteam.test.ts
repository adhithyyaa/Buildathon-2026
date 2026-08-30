import { describe, it, expect } from 'vitest';
import { ReasonTag } from '@prisma/client';
import { auditCompliance, runCompliance, type OracleFinding } from '../compliance';
import { ATTACKS } from '../redteamAttacks';
import type { PolicyInput, PolicyDecision } from '../policy';
import type { RecoveryPlan } from '../../ai/schemas';
import type { PolicyEnvelope } from '../../ai/context';

/**
 * Red-team compliance — two-sided rigor, mirroring the A/A + A/B power test:
 *  1. DEFENCE: the REAL policy engine defends every adversarial attack (zero oracle violations).
 *  2. NOT VACUOUS: the oracles actually fire when fed a deliberately non-compliant decision — so
 *     "defended" means the referee looked and found nothing, not that the referee is asleep.
 * The oracle (compliance.ts) shares no branch with policy.ts, so (1) is a genuine independent check.
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

const NOON_IST = new Date('2026-01-06T06:30:00.000Z'); // 12:00 IST
const TWO_AM_IST = new Date('2026-01-06T20:30:00.000Z'); // 02:00 IST — quiet hours

function basePlan(): RecoveryPlan {
  return {
    diagnosis: { reason_category: 'card_declined', recovery_probability: 0.5, is_auto_retriable: true, rationale: 'x' },
    decision: { action: 'no_action', channel: 'none', confidence: 0.5, requires_human_approval: false, retry_delay_hours: 0, incentive_pct: 0, reason: 'x' },
    message: { subject: 's', body: 'b' },
  };
}

function baseInput(over: Partial<PolicyInput> = {}): PolicyInput {
  return {
    plan: basePlan(),
    amountPaise: 50_000,
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

function baseDecision(over: Partial<PolicyDecision> = {}): PolicyDecision {
  return {
    outcome: 'approved',
    finalAction: 'no_action',
    finalChannel: 'none',
    finalIncentivePct: 0,
    requiresHumanApproval: false,
    scheduledFor: null,
    notes: [],
    ...over,
  };
}

const violated = (fs: OracleFinding[], ruleFragment: string) =>
  fs.some((f) => f.rule.toLowerCase().includes(ruleFragment.toLowerCase()) && f.status === 'violation');

describe('red-team compliance console', () => {
  it('the real policy defends every attack in the catalog (zero oracle violations)', () => {
    expect(ATTACKS.length).toBeGreaterThanOrEqual(8);
    for (const a of ATTACKS) {
      const r = runCompliance(a.build(ENVELOPE));
      expect(r.verdict, `${a.id} (${a.targets}) breached: ${JSON.stringify(r.findings.filter((f) => f.status === 'violation'))}`).toBe('defended');
      expect(r.violations).toBe(0);
    }
  });

  // Each canary hands the oracle a decision a BROKEN policy might emit, and asserts the oracle catches it.
  it('oracle bites: a retry on a failed-but-debited case is caught (RBI TAT)', () => {
    const fs = auditCompliance(baseInput({ reasonTag: ReasonTag.debited_pending_reversal }), baseDecision({ finalAction: 'smart_retry' }));
    expect(violated(fs, 'TAT')).toBe(true);
  });

  it('oracle bites: a retry past the cap is caught (NPCI retry cap)', () => {
    const fs = auditCompliance(baseInput({ attempts: 3 }), baseDecision({ finalAction: 'smart_retry' }));
    expect(violated(fs, 'retry cap')).toBe(true);
  });

  it('oracle bites: a silent high-value auto-retry is caught (AFA ceiling)', () => {
    const fs = auditCompliance(baseInput({ amountPaise: 2_000_000 }), baseDecision({ finalAction: 'smart_retry', requiresHumanApproval: false }));
    expect(violated(fs, 'additional-factor')).toBe(true);
  });

  it('oracle bites: outreach to an opted-out customer is caught (consent/DND)', () => {
    const fs = auditCompliance(baseInput({ optedOut: true }), baseDecision({ finalAction: 'send_payment_link' }));
    expect(violated(fs, 'consent')).toBe(true);
  });

  it('oracle bites: outreach inside quiet hours is caught (messaging window)', () => {
    const fs = auditCompliance(baseInput({ now: TWO_AM_IST }), baseDecision({ finalAction: 'send_reminder', scheduledFor: null }));
    expect(violated(fs, 'quiet-hours')).toBe(true);
  });

  it('oracle bites: an over-cap discount is caught (discount cap)', () => {
    const fs = auditCompliance(baseInput(), baseDecision({ finalIncentivePct: 50 }));
    expect(violated(fs, 'discount')).toBe(true);
  });

  it('oracle bites: a paid action below the pursuit floor is caught (spend discipline)', () => {
    const fs = auditCompliance(baseInput({ amountPaise: 4_000 }), baseDecision({ finalAction: 'send_payment_link' }));
    expect(violated(fs, 'spend discipline')).toBe(true);
  });

  it('a fully compliant decision produces no violations (no false positives)', () => {
    const fs = auditCompliance(baseInput(), baseDecision({ finalAction: 'no_action' }));
    expect(fs.some((f) => f.status === 'violation')).toBe(false);
  });
});
