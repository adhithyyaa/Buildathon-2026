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
// Per-action recovery multiplier: how much an action lifts recovery over the reason's base rate.
// `no_action` is the natural self-recovery rate (customer pays anyway / bank auto-retries) — the
// Recovery Lab CONTROL baseline. Actions lift above it; the gap is the incremental effect.
const ACTION_LIFT: Record<string, number> = {
  smart_retry: 1.2,
  send_payment_link: 1.15,
  send_reminder: 1.0,
  offer_incentive: 1.25,
  escalate_to_human: 0.9,
  no_action: 0.28,
};

/** Ground-truth recovery probability for a (reason, action) — the independent world mechanism. */
export function recoveryProb(reasonTag: ReasonTag | null, action: string): number {
  const base = basePriorRecovery(reasonTag ?? ReasonTag.unknown);
  return Math.max(0.01, Math.min(0.95, base * (ACTION_LIFT[action] ?? 1.0)));
}

/** Deterministic Bernoulli outcome draw for (case, action) — reproducible in a replay. */
export function recovers(caseId: string, reasonTag: ReasonTag | null, action: string, salt = ''): boolean {
  return seeded(`${caseId}:${action}:${salt}`) < recoveryProb(reasonTag, action);
}

export function retrySucceeds(caseId: string, reasonTag: ReasonTag | null, attempts: number): boolean {
  const trueRate = recoveryProb(reasonTag, 'smart_retry') * Math.pow(0.8, Math.max(0, attempts - 1)); // retry fatigue
  return seeded(`${caseId}:${attempts}`) < trueRate;
}
