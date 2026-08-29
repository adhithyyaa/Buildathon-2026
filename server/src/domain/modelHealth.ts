import { prisma } from '../lib/prisma';

/**
 * Production model-health monitoring — the signal a technical panel probes when it asks "how do you
 * know the model still works on live traffic?". We report, from real data:
 *   - per-feature PSI (Population Stability Index) vs the TRAINING distribution, with the industry
 *     thresholds PSI < 0.1 stable · 0.1–0.25 watch · > 0.25 shift;
 *   - the live score (recovery-probability) distribution and its mean;
 *   - inference latency (avg / p50 / p95) from the stored predictions.
 * A failure-spike (Demo → Trigger failure spike) skews the reason mix and visibly moves the PSI —
 * so the monitor is a live instrument, not a static green light.
 */

// Training-set baselines mirror ml/src/worldmodel.py. These are stable model INPUTS at scoring time
// (unlike retry_count, which drifts simply because cases get retried) — so their PSI reflects a real
// change in the traffic the model sees. A failure-spike skews the reason mix and moves its PSI live.
const REASON_BASELINE: Record<string, number> = {
  insufficient_funds: 0.13,
  card_declined: 0.15,
  upi_collect_timeout: 0.2,
  bank_downtime: 0.12,
  authentication_failed: 0.11,
  expired_card: 0.06,
  abandoned: 0.18,
  unknown: 0.05,
};
const AMOUNT_BASELINE = [0.06, 0.66, 0.21, 0.07]; // <₹100 / <₹5k / <₹25k / ≥₹25k

const EPS = 1e-4;

export type DriftStatus = 'stable' | 'watch' | 'shift';

function statusOf(psi: number): DriftStatus {
  return psi < 0.1 ? 'stable' : psi < 0.25 ? 'watch' : 'shift';
}

/** Population Stability Index between an expected and an actual proportion vector. */
function psi(expected: number[], actual: number[]): number {
  let sum = 0;
  for (let i = 0; i < expected.length; i++) {
    const e = Math.max(expected[i] ?? 0, EPS);
    const a = Math.max(actual[i] ?? 0, EPS);
    sum += (a - e) * Math.log(a / e);
  }
  return sum;
}

const round = (x: number) => Number(x.toFixed(3));

function amountBucket(paise: number): number {
  const r = paise / 100;
  if (r < 100) return 0;
  if (r < 5000) return 1;
  if (r < 25000) return 2;
  return 3;
}

export interface FeatureDrift {
  feature: string;
  psi: number;
  status: DriftStatus;
}

export interface ModelHealth {
  cases: number;
  overallStatus: DriftStatus;
  features: FeatureDrift[];
  scoreDistribution: { bins: number[]; mean: number; count: number };
  latency: { count: number; avgMs: number; p50Ms: number; p95Ms: number; maxMs: number };
}

export async function computeModelHealth(): Promise<ModelHealth> {
  const cases = await prisma.case.findMany({ select: { reasonTag: true, attempts: true, amount: true } });
  const total = cases.length || 1;

  // failure_reason drift (unmatched reasons fold into unknown — a brand-new reason still shows as drift).
  const reasonKeys = Object.keys(REASON_BASELINE);
  const reasonCounts: Record<string, number> = Object.fromEntries(reasonKeys.map((k) => [k, 0]));
  for (const c of cases) {
    const r = c.reasonTag ?? 'unknown';
    const key = r in reasonCounts ? r : 'unknown';
    reasonCounts[key] = (reasonCounts[key] ?? 0) + 1;
  }
  const reasonPsi = psi(reasonKeys.map((k) => REASON_BASELINE[k]!), reasonKeys.map((k) => (reasonCounts[k] ?? 0) / total));

  // order_value drift
  const amtCounts = [0, 0, 0, 0];
  for (const c of cases) {
    const i = amountBucket(c.amount);
    amtCounts[i] = (amtCounts[i] ?? 0) + 1;
  }
  const amtPsi = psi(AMOUNT_BASELINE, amtCounts.map((n) => n / total));

  const features: FeatureDrift[] = [
    { feature: 'failure_reason', psi: round(reasonPsi), status: statusOf(reasonPsi) },
    { feature: 'order_value', psi: round(amtPsi), status: statusOf(amtPsi) },
  ];
  const worstPsi = Math.max(...features.map((f) => f.psi), 0);

  // Live score distribution + latency, from the model's own predictions.
  const preds = await prisma.prediction.findMany({ where: { source: 'ml' }, select: { recoveryProbability: true, latencyMs: true } });
  const bins = new Array(10).fill(0) as number[];
  let scoreSum = 0;
  for (const p of preds) {
    const i = Math.min(9, Math.max(0, Math.floor(p.recoveryProbability * 10)));
    bins[i] = (bins[i] ?? 0) + 1;
    scoreSum += p.recoveryProbability;
  }
  const lats = preds.map((p) => p.latencyMs ?? 0).filter((x) => x > 0).sort((a, b) => a - b);
  const at = (q: number) => (lats.length ? lats[Math.min(lats.length - 1, Math.floor(q * lats.length))]! : 0);

  return {
    cases: total,
    overallStatus: statusOf(worstPsi),
    features,
    scoreDistribution: { bins, mean: round(preds.length ? scoreSum / preds.length : 0), count: preds.length },
    latency: {
      count: lats.length,
      avgMs: lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : 0,
      p50Ms: at(0.5),
      p95Ms: at(0.95),
      maxMs: lats.length ? lats[lats.length - 1]! : 0,
    },
  };
}
