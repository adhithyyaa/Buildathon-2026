import { prisma } from '../lib/prisma';
import { markRecovered, markExpired } from './recovery';
import { recovers } from './world';
import { mapLimit } from '../lib/concurrency';

// Per-case outcome draws are independent, so resolve them with bounded concurrency (kept under the
// Prisma pool — see lib/prisma.ts) to overlap the cross-region writes.
const RESOLVE_CONCURRENCY = 10;

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
export async function resolveOutcomes(now: Date = new Date()): Promise<{ resolved: number; recovered: number; expired: number; suppressed: string[] }> {
  const pending = await prisma.case.findMany({
    where: { state: { in: ['waiting_for_outcome', 'manual_escalation'] }, outcome: { is: null } },
    select: { id: true, reasonTag: true, assignedAction: true, arm: true, amount: true },
  });
  const results = await mapLimit(pending, RESOLVE_CONCURRENCY, async (c) => {
    // Control → natural (no-action) rate. Treatment → its dispatched action's rate; a treatment
    // case that was escalated/blocked took no automated action, so it also gets the no-action
    // rate (intent-to-treat, which keeps the comparison honest).
    const action = c.arm === 'control' || !c.assignedAction || c.assignedAction === 'no_action' ? 'no_action' : c.assignedAction;
    if (recovers(c.id, c.reasonTag, action, 'lab')) {
      await markRecovered(c.id, { recoveredAmountPaise: c.amount, source: 'demo', paymentRef: 'lab_outcome', now });
      return 'recovered' as const;
    }
    await markExpired(c.id, now);
    return 'expired' as const;
  });
  const recovered = results.filter((r) => r === 'recovered').length;
  const expired = results.filter((r) => r === 'expired').length;
  // Learn: recompute the incremental lift and persist which reasons to auto-suppress next cycle.
  const suppressed = await refreshSuppression();
  return { resolved: pending.length, recovered, expired, suppressed };
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
export interface LiftEstimate {
  treatment: ArmStat;
  control: ArmStat;
  liftPct: number;
  incrementalPaise: number;
  liftCi95Pct: [number, number];
  significant: boolean;
}

/**
 * Pure incremental-lift estimator: the treatment−control recovery-rate difference with a 95%
 * bootstrap CI, applied to the treatment arm's at-risk ₹. Exported so the A/A null test can prove
 * it is unbiased — it must read ~0 lift (CI spanning 0, `significant: false`) when the two arms are
 * drawn from the same distribution. If that test fails, no lift number this project reports is safe.
 */
export function estimateLift(subset: { arm: string; amount: number; recovered: boolean }[]): LiftEstimate {
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

export async function computeLift() {
  const rows = await prisma.case.findMany({
    where: { outcome: { is: { status: { in: ['recovered', 'expired'] } } } },
    select: { arm: true, amount: true, reasonTag: true, outcome: { select: { status: true } } },
  });
  const norm = rows.map((r) => ({ arm: r.arm, amount: r.amount, reason: r.reasonTag ?? 'unknown', recovered: r.outcome?.status === 'recovered' }));

  const reasons = Array.from(new Set(norm.map((r) => r.reason)));
  const byReason = reasons
    .map((reason) => ({ reason, ...estimateLift(norm.filter((r) => r.reason === reason)) }))
    .filter((r) => r.treatment.cases + r.control.cases >= 5)
    .sort((a, b) => b.incrementalPaise - a.incrementalPaise);

  // The efficiency loop: a reason with a decent sample whose lift is NOT significantly positive
  // (95% CI lower bound ≤ 0) is wasted effort — we could not prove the actions beat control, so
  // stop spending there ("prove the lift or don't pay for it"). These are the reasons the policy
  // auto-suppresses. Reasons with too few cases stay in "gathering evidence", not suppressed.
  // Suppress a reason only with enough evidence AND essentially no lift (≤ 2pp) — a robust point
  // test that won't wrongly prune a genuinely-helping reason just because a tiny per-reason control
  // arm made its CI wide. (A lost cause like undiagnosable "unknown" sits at ~0pp; real reasons are
  // tens of pp above control.)
  const suppressionCandidates = byReason
    .filter((r) => r.treatment.cases >= 15 && r.control.cases >= 4 && r.liftPct <= 2)
    .map((r) => r.reason);

  return { overall: estimateLift(norm), byReason, suppressionCandidates, totalResolved: norm.length };
}

export interface ImpactPoint {
  t: string; // bucket end (ISO)
  actualPaise: number; // cumulative ₹ actually recovered (treatment arm)
  baselinePaise: number; // cumulative ₹ the measured control rate says would have come back anyway
}

export interface ImpactEvent {
  t: string;
  type: 'incident' | 'model';
  label: string;
}

/**
 * The counterfactual impact series behind the Overview's flagship chart: cumulative recovered-₹
 * over the failure-cohort timeline (cases ordered by when they failed), with a dotted baseline =
 * the CONTROL arm's measured ₹-weighted recovery rate applied to the same treatment failures.
 * Stripe/Checkout.com estimate this line; ours is measured from the live randomized holdout.
 */
export async function computeImpactSeries(buckets = 36) {
  const rows = await prisma.case.findMany({
    where: { outcome: { is: { status: { in: ['recovered', 'expired'] } } } },
    select: { arm: true, amount: true, createdAt: true, outcome: { select: { status: true, recoveredAmount: true } } },
    orderBy: { createdAt: 'asc' },
  });

  // COUNT-based control rate — the same statistic the Lab's headline lift uses, so the chart's
  // endpoint gap and the official incremental-₹ figure share one methodology. (A ₹-weighted rate
  // is unstable at holdout size: one large natural recovery in ~24 control cases swings it wildly.)
  const control = rows.filter((r) => r.arm === 'control');
  const controlRecoveredCount = control.filter((r) => r.outcome?.status === 'recovered').length;
  const controlRate = control.length > 0 ? controlRecoveredCount / control.length : 0;

  const treatment = rows.filter((r) => r.arm === 'treatment');
  if (treatment.length === 0) {
    return { series: [] as ImpactPoint[], events: [] as ImpactEvent[], controlRatePct: control.length > 0 ? Number((controlRate * 100).toFixed(1)) : null, incrementalPaise: 0, resolvedCases: rows.length };
  }

  const start = treatment[0]!.createdAt.getTime();
  const end = Math.max(treatment[treatment.length - 1]!.createdAt.getTime(), start + 1);
  const width = (end - start) / buckets;

  const series: ImpactPoint[] = [];
  let actual = 0;
  let baseline = 0;
  let i = 0;
  for (let b = 1; b <= buckets; b++) {
    const edge = start + width * b;
    while (i < treatment.length && treatment[i]!.createdAt.getTime() <= edge) {
      const r = treatment[i]!;
      if (r.outcome?.status === 'recovered') actual += r.outcome.recoveredAmount || r.amount;
      baseline += r.amount * controlRate;
      i++;
    }
    series.push({ t: new Date(edge).toISOString(), actualPaise: Math.round(actual), baselinePaise: Math.round(baseline) });
  }

  // Annotations: detected failure-spike incidents + model loads that fall inside the timeline.
  const [flags, models] = await Promise.all([
    prisma.anomalyFlag.findMany({ orderBy: { createdAt: 'desc' }, take: 40, select: { windowKey: true, reason: true, createdAt: true } }),
    prisma.modelRun.findMany({ orderBy: { loadedAt: 'desc' }, take: 3, select: { version: true, loadedAt: true } }),
  ]);
  const seen = new Set<string>();
  const events: ImpactEvent[] = [];
  for (const f of flags) {
    const key = `${f.windowKey}:${f.reason ?? ''}`;
    if (seen.has(key)) continue; // one marker per window+reason, not one per flag row
    seen.add(key);
    if (f.createdAt.getTime() >= start) {
      events.push({ t: f.createdAt.toISOString(), type: 'incident', label: `Failure spike: ${(f.reason ?? 'unknown').replace(/_/g, ' ')}` });
    }
  }
  for (const m of models) {
    if (m.loadedAt.getTime() >= start) events.push({ t: m.loadedAt.toISOString(), type: 'model', label: `Model ${m.version} loaded` });
  }
  events.sort((a, b) => a.t.localeCompare(b.t));

  return {
    series,
    events: events.slice(0, 12),
    controlRatePct: control.length > 0 ? Number((controlRate * 100).toFixed(1)) : null,
    incrementalPaise: Math.round(actual - baseline),
    resolvedCases: rows.length,
  };
}

const SUPPRESS_KEY = 'lab_suppressed_reasons';

/** Recompute the Lab report and persist the auto-suppressed reason set (the "learn" step). */
export async function refreshSuppression(): Promise<string[]> {
  const report = await computeLift();
  const value = JSON.stringify(report.suppressionCandidates);
  await prisma.setting.upsert({ where: { key: SUPPRESS_KEY }, create: { key: SUPPRESS_KEY, value }, update: { value } });
  return report.suppressionCandidates;
}

/** Reasons the Recovery Lab has auto-suppressed — the policy engine skips recovery actions on these. */
export async function getSuppressedReasons(): Promise<Set<string>> {
  const s = await prisma.setting.findUnique({ where: { key: SUPPRESS_KEY } });
  if (!s?.value) return new Set();
  try {
    return new Set(JSON.parse(s.value) as string[]);
  } catch {
    return new Set();
  }
}
