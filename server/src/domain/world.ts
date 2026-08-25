import { ReasonTag } from '@prisma/client';
import { basePriorRecovery } from './reasons';

/**
 * Deterministic PRNG from a string seed (mulberry32 over a cheap hash), so a demo run or a
 * replay is reproducible — the same case + attempt always yields the same simulated outcome.
 */
function seeded(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * The demo "world": does a fired smart_retry actually recover the payment?
 *
 * Deliberately INDEPENDENT of the model's own `recoveryProbability` — the world uses a fixed
 * per-reason true rate (with retry fatigue), NOT the model's per-case prediction. This is the
 * anti-circularity guard: the model only chooses the action; an independent world decides the
 * outcome, so the recovered-₹ counter can't be the model grading itself. Deterministic in
 * (caseId, attempt) so a replay reproduces the exact same demo.
 *
 * The honest, non-simulated measurement lives in ml/eval.py (counterfactual holdout) and in the
 * real signed-webhook path; this function only drives the local live demo.
 */
// A reason × action fit matrix (the same shape as the training world's), NOT a uniform lift with a
// hardcoded exception. `no_action` is the natural self-recovery rate — the Recovery Lab CONTROL
// baseline; the gap between an action's fit and no_action is the incremental effect. Some reasons
// have a genuinely low ceiling (an undiagnosable failure, or a failed-but-debited payment awaiting
// auto-reversal) where NO action meaningfully beats doing nothing — so the Lab's auto-suppression is
// a *discovered* property of this matrix, not a value engineered onto one reason.
const DEFAULT_FIT: Record<string, number> = { smart_retry: 0.9, send_payment_link: 1.0, send_reminder: 0.8, offer_incentive: 1.0, escalate_to_human: 0.7, no_action: 0.25 };
const REASON_ACTION_FIT: Partial<Record<ReasonTag, Record<string, number>>> = {
  [ReasonTag.bank_downtime]:        { smart_retry: 1.35, send_payment_link: 0.80, send_reminder: 0.60, offer_incentive: 0.85, escalate_to_human: 0.55, no_action: 0.25 },
  [ReasonTag.upi_collect_timeout]:  { smart_retry: 1.30, send_payment_link: 0.90, send_reminder: 0.70, offer_incentive: 0.90, escalate_to_human: 0.55, no_action: 0.20 },
  [ReasonTag.insufficient_funds]:   { smart_retry: 1.15, send_payment_link: 0.90, send_reminder: 0.75, offer_incentive: 1.00, escalate_to_human: 0.55, no_action: 0.20 },
  [ReasonTag.card_declined]:        { smart_retry: 0.55, send_payment_link: 1.30, send_reminder: 0.80, offer_incentive: 1.15, escalate_to_human: 0.60, no_action: 0.15 },
  [ReasonTag.expired_card]:         { smart_retry: 0.30, send_payment_link: 1.35, send_reminder: 0.70, offer_incentive: 1.00, escalate_to_human: 0.65, no_action: 0.15 },
  [ReasonTag.authentication_failed]:{ smart_retry: 0.70, send_payment_link: 1.25, send_reminder: 0.80, offer_incentive: 0.90, escalate_to_human: 0.55, no_action: 0.20 },
  [ReasonTag.abandoned]:            { smart_retry: 0.40, send_payment_link: 1.00, send_reminder: 1.25, offer_incentive: 1.30, escalate_to_human: 0.45, no_action: 0.25 },
  // Undiagnosable failure: acting actively backfires (nudging a customer who was going to pay, or a
  // risk pattern that contact confirms), so every automated action does WORSE than doing nothing —
  // a genuine negative-lift row. The Lab discovers this from data (given enough evidence); it is not
  // a special-cased clamp on the reason.
  [ReasonTag.unknown]:              { smart_retry: 0.16, send_payment_link: 0.18, send_reminder: 0.15, offer_incentive: 0.18, escalate_to_human: 0.40, no_action: 0.32 },
  [ReasonTag.debited_pending_reversal]: { smart_retry: 0.20, send_payment_link: 0.20, send_reminder: 0.20, offer_incentive: 0.20, escalate_to_human: 0.30, no_action: 0.25 },
};

/** Ground-truth recovery probability for a (reason, action) — the independent world mechanism. */
export function recoveryProb(reasonTag: ReasonTag | null, action: string): number {
  const reason = reasonTag ?? ReasonTag.unknown;
  const fit = REASON_ACTION_FIT[reason] ?? DEFAULT_FIT;
  return Math.max(0.01, Math.min(0.95, basePriorRecovery(reason) * (fit[action] ?? fit.no_action ?? 0.25)));
}

/** Deterministic Bernoulli outcome draw for (case, action) — reproducible in a replay. */
export function recovers(caseId: string, reasonTag: ReasonTag | null, action: string, salt = ''): boolean {
  return seeded(`${caseId}:${action}:${salt}`) < recoveryProb(reasonTag, action);
}

export function retrySucceeds(caseId: string, reasonTag: ReasonTag | null, attempts: number): boolean {
  const trueRate = recoveryProb(reasonTag, 'smart_retry') * Math.pow(0.8, Math.max(0, attempts - 1)); // retry fatigue
  return seeded(`${caseId}:${attempts}`) < trueRate;
}
