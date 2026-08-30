import { ActionType, ReasonTag } from '@prisma/client';
import { isQuietHours } from '../lib/time';
import { evaluatePolicy, type PolicyInput, type PolicyDecision } from './policy';

/**
 * Independent regulatory oracles — the compliance cross-check no competitor ships.
 *
 * The policy engine (policy.ts) DECIDES; these oracles JUDGE. Each oracle re-derives, from the case
 * facts and one regulation alone, what any compliant decision is REQUIRED to look like, then checks
 * the policy engine's actual decision against it. Crucially the oracle shares no branch with policy.ts:
 * if the policy silently regressed (a guardrail deleted, a threshold flipped), it would still "pass
 * itself" — but the oracle, judging from the regulation's side, would fire. That independence is the
 * whole point: it turns "trust our policy" into "here is an adversarial referee that would catch us".
 *
 * status: 'n/a' — the regulation doesn't apply to this case · 'ok' — applies and is satisfied ·
 *         'violation' — applies and the decision breaks it.
 */
export type ComplianceStatus = 'ok' | 'violation' | 'n/a';

export interface OracleFinding {
  rule: string;
  citation: string;
  requirement: string;
  status: ComplianceStatus;
  detail: string;
}

// Re-declared here (not imported from policy.ts) to keep the oracle independent of policy internals.
const OUTREACH_ACTIONS: ActionType[] = ['send_payment_link', 'send_reminder', 'offer_incentive'];

export function auditCompliance(input: PolicyInput, decision: PolicyDecision): OracleFinding[] {
  const p = input.policy;
  const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
  const F: OracleFinding[] = [];

  // 1. RBI harmonised TAT — a failed-but-debited payment auto-reverses by T+1; any re-debit or
  //    re-nudge risks a double-debit complaint, so the only compliant action is to hold.
  {
    const applies = input.reasonTag === ReasonTag.debited_pending_reversal;
    const ok = decision.finalAction === 'no_action';
    F.push({
      rule: 'RBI harmonised TAT (double-debit protection)',
      citation: 'RBI DPSS.CO.PD (harmonised TAT)',
      requirement: 'A failed-but-debited payment must await the T+1 auto-reversal — no retry, no outreach.',
      status: !applies ? 'n/a' : ok ? 'ok' : 'violation',
      detail: !applies
        ? 'Case is not failed-but-debited.'
        : ok
          ? 'Held (no_action) pending the auto-reversal.'
          : `Decision dispatches "${decision.finalAction}" on a debited-pending-reversal case — double-debit risk.`,
    });
  }

  // 2. NPCI e-mandate retry cap — at most 1 original attempt + maxRetries auto-debit retries.
  {
    const isRetry = decision.finalAction === 'smart_retry';
    const overCap = input.attempts >= p.maxRetries;
    F.push({
      rule: 'NPCI e-mandate retry cap',
      citation: 'NPCI / RBI e-mandate framework',
      requirement: `An auto-debit may be retried only while prior retries < ${p.maxRetries}.`,
      status: !isRetry ? 'n/a' : overCap ? 'violation' : 'ok',
      detail: !isRetry
        ? 'Decision is not an auto-debit retry.'
        : overCap
          ? `Retry dispatched with ${input.attempts} prior retries (cap ${p.maxRetries}).`
          : `Retry with ${input.attempts} prior retries is within the cap (${p.maxRetries}).`,
    });
  }

  // 3. NPCI/RBI additional-factor-auth ceiling — a high-value auto-debit retry needs an AFA / human
  //    step, never a silent retry.
  {
    const applies = decision.finalAction === 'smart_retry' && input.amountPaise >= p.afaThresholdPaise;
    const ok = decision.requiresHumanApproval === true;
    F.push({
      rule: 'NPCI/RBI additional-factor-auth ceiling',
      citation: 'RBI e-mandate AFA ceiling',
      requirement: `An auto-debit retry ≥ ${rupees(p.afaThresholdPaise)} must carry an AFA / human step, not a silent retry.`,
      status: !applies ? 'n/a' : ok ? 'ok' : 'violation',
      detail: !applies
        ? 'Not a high-value auto-debit retry.'
        : ok
          ? 'Retry flagged for an additional-factor / human step.'
          : `Silent retry of ${rupees(input.amountPaise)} ≥ AFA ceiling without a human/AFA step.`,
    });
  }

  // 4. Consent / DND — an opted-out customer may not be messaged on any channel.
  {
    const applies = input.optedOut;
    const isOutreach = OUTREACH_ACTIONS.includes(decision.finalAction);
    F.push({
      rule: 'Consent / DND (customer opt-out)',
      citation: 'TRAI TCCCPR 2018 / consent',
      requirement: 'A customer who opted out of outreach must not be messaged.',
      status: !applies ? 'n/a' : isOutreach ? 'violation' : 'ok',
      detail: !applies
        ? 'Customer has not opted out.'
        : isOutreach
          ? `Decision dispatches outreach "${decision.finalAction}" to an opted-out customer.`
          : 'No outreach dispatched to the opted-out customer.',
    });
  }

  // 5. Quiet-hours messaging window — customer outreach must land outside the quiet window.
  {
    const isOutreach = OUTREACH_ACTIONS.includes(decision.finalAction);
    const sendAt = decision.scheduledFor ?? input.now;
    const inQuiet = isQuietHours(sendAt, p.quietHoursStart, p.quietHoursEnd);
    F.push({
      rule: 'Quiet-hours messaging window',
      citation: `IST ${p.quietHoursStart}:00–${p.quietHoursEnd}:00 (TRAI/DND)`,
      requirement: 'Customer outreach must be delivered outside the quiet-hours window.',
      status: !isOutreach ? 'n/a' : inQuiet ? 'violation' : 'ok',
      detail: !isOutreach
        ? 'Decision sends no outreach.'
        : inQuiet
          ? `Outreach send time ${sendAt.toISOString()} falls inside quiet hours.`
          : `Outreach send time ${sendAt.toISOString()} is outside quiet hours.`,
    });
  }

  // 6. Discount cap — an incentive may not exceed the merchant's configured maximum.
  {
    const applies = decision.finalIncentivePct > 0;
    const over = decision.finalIncentivePct > p.maxDiscountPct;
    F.push({
      rule: 'Discount cap',
      citation: 'merchant guardrail',
      requirement: `An incentive may not exceed ${p.maxDiscountPct}%.`,
      status: !applies ? 'n/a' : over ? 'violation' : 'ok',
      detail: !applies
        ? 'No incentive offered.'
        : over
          ? `Incentive ${decision.finalIncentivePct}% exceeds the ${p.maxDiscountPct}% cap.`
          : `Incentive ${decision.finalIncentivePct}% is within the ${p.maxDiscountPct}% cap.`,
    });
  }

  // 7. Spend discipline — below the pursuit floor, no paid recovery action should dispatch.
  {
    const belowFloor = input.amountPaise < p.minPursuitPaise;
    const acted = decision.finalAction !== 'no_action' && decision.outcome !== 'blocked';
    F.push({
      rule: 'Spend discipline (pursuit floor)',
      citation: `≥ ${rupees(p.minPursuitPaise)} to pursue`,
      requirement: `Below ${rupees(p.minPursuitPaise)}, recovery is uneconomical — take no paid action.`,
      status: !belowFloor ? 'n/a' : acted ? 'violation' : 'ok',
      detail: !belowFloor
        ? 'Amount is above the pursuit floor.'
        : acted
          ? `${rupees(input.amountPaise)} case dispatched "${decision.finalAction}".`
          : `${rupees(input.amountPaise)} case correctly took no paid action.`,
    });
  }

  return F;
}

export interface RedTeamResult {
  decision: PolicyDecision;
  findings: OracleFinding[];
  verdict: 'defended' | 'breached';
  violations: number;
}

/** Run the REAL policy engine on an adversarial case, then judge it with the independent oracles. */
export function runCompliance(input: PolicyInput): RedTeamResult {
  const decision = evaluatePolicy(input);
  const findings = auditCompliance(input, decision);
  const violations = findings.filter((f) => f.status === 'violation').length;
  return { decision, findings, violations, verdict: violations === 0 ? 'defended' : 'breached' };
}
