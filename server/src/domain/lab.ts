import { prisma } from '../lib/prisma';
import { markRecovered, markExpired } from './recovery';
import { recovers } from './world';

/**
 * Recovery Lab — a live counterfactual holdout that measures INCREMENTAL recovered-₹.
 *
 * Every case is randomly assigned (at ingest) to a treatment arm (ML+policy acts) or a small
 * CONTROL arm (no recovery action). This is the one number that actually matters and that
 * neither Razorpay nor the vendors publish: not "we recovered ₹X" but "we recovered ₹X MORE
 * than would have happened anyway", with a confidence interval. The control also doubles as a
 * live A/B / shadow-eval signal for the model.
 *
 * `resolveOutcomes` simulates each pending case's outcome from the independent world (treatment
 * by its dispatched action, control by the natural no-action rate) so the experiment can be
 * measured in the demo. In production these outcomes arrive as real signed webhooks instead.
 */
export async function resolveOutcomes(now: Date = new Date()): Promise<{ resolved: number; recovered: number; expired: number }> {
  const pending = await prisma.case.findMany({
    where: { state: { in: ['waiting_for_outcome', 'manual_escalation'] }, outcome: { is: null } },
    select: { id: true, reasonTag: true, assignedAction: true, arm: true, amount: true },
  });
  let recovered = 0;
  let expired = 0;
  for (const c of pending) {
    // Control → natural (no-action) rate. Treatment → its dispatched action's rate; a treatment
    // case that was escalated/blocked took no automated action, so it also gets the no-action
    // rate (intent-to-treat, which keeps the comparison honest).
    const action = c.arm === 'control' || !c.assignedAction || c.assignedAction === 'no_action' ? 'no_action' : c.assignedAction;
    if (recovers(c.id, c.reasonTag, action, 'lab')) {
      await markRecovered(c.id, { recoveredAmountPaise: c.amount, source: 'demo', paymentRef: 'lab_outcome', now });
      recovered++;
    } else {
      await markExpired(c.id, now);
      expired++;
    }
  }
  return { resolved: pending.length, recovered, expired };
}

interface ArmStat {
  cases: number;
  recovered: number;
  atRiskPaise: number;
  recoveredPaise: number;
  recoveryRatePct: number | null;
}

function armStat(rows: { amount: number; recovered: boolean }[]): ArmStat {
  const cases = rows.length;
  const recovered = rows.filter((r) => r.recovered).length;
  const atRiskPaise = rows.reduce((s, r) => s + r.amount, 0);
  const recoveredPaise = rows.filter((r) => r.recovered).reduce((s, r) => s + r.amount, 0);
  return { cases, recovered, atRiskPaise, recoveredPaise, recoveryRatePct: cases ? Number(((recovered / cases) * 100).toFixed(1)) : null };
}

// 95% bootstrap CI for (treatment_rate − control_rate), resampling cases within each arm.
function bootstrapDiffCI(t: number[], c: number[], B = 600, seed = 7): { lo: number; hi: number } {
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const resampleMean = (arr: number[]) => {
    if (!arr.length) return 0;
    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += arr[(rnd() * arr.length) | 0] ?? 0;
    return sum / arr.length;
  };
  const diffs: number[] = [];
  for (let b = 0; b < B; b++) diffs.push(resampleMean(t) - resampleMean(c));
  diffs.sort((a, b) => a - b);
  const q = (p: number) => diffs[Math.min(diffs.length - 1, Math.max(0, Math.round(p * (diffs.length - 1))))] ?? 0;
  return { lo: q(0.025), hi: q(0.975) };
}

/** Compute the incremental-lift report over all resolved cases — overall and per reason. */
export async function computeLift() {
  const rows = await prisma.case.findMany({
    where: { outcome: { is: { status: { in: ['recovered', 'expired'] } } } },
    select: { arm: true, amount: true, reasonTag: true, outcome: { select: { status: true } } },
  });
  const norm = rows.map((r) => ({ arm: r.arm, amount: r.amount, reason: r.reasonTag ?? 'unknown', recovered: r.outcome?.status === 'recovered' }));

  function block(subset: typeof norm) {
    const t = subset.filter((r) => r.arm === 'treatment');
    const c = subset.filter((r) => r.arm === 'control');
    const ts = armStat(t);
    const cs = armStat(c);
    const rateT = ts.recoveryRatePct ?? 0;
    const rateC = cs.recoveryRatePct ?? 0;
    const liftPct = Number((rateT - rateC).toFixed(1));
    // ₹ incremental lift = (rate_t − rate_c) applied to the treatment arm's at-risk ₹.
    const incrementalPaise = Math.round(((rateT - rateC) / 100) * ts.atRiskPaise);
    const tb = t.map((r) => (r.recovered ? 1 : 0));
    const cb = c.map((r) => (r.recovered ? 1 : 0));
    const ci = bootstrapDiffCI(tb, cb);
    return {
      treatment: ts,
      control: cs,
      liftPct,
      incrementalPaise,
      liftCi95Pct: [Number((ci.lo * 100).toFixed(1)), Number((ci.hi * 100).toFixed(1))] as [number, number],
      significant: ci.lo > 0 || ci.hi < 0,
    };
  }

  const reasons = Array.from(new Set(norm.map((r) => r.reason)));
  const byReason = reasons
    .map((reason) => ({ reason, ...block(norm.filter((r) => r.reason === reason)) }))
    .filter((r) => r.treatment.cases + r.control.cases >= 5)
    .sort((a, b) => b.incrementalPaise - a.incrementalPaise);

  // Efficiency loop: reasons where treatment does NOT beat control are wasted effort — flag them
  // so the policy can stop pursuing them (surface the recommendation; the operator/policy acts).
  const suppressionCandidates = byReason.filter((r) => r.liftPct <= 0).map((r) => r.reason);

  return { overall: block(norm), byReason, suppressionCandidates, totalResolved: norm.length };
}
