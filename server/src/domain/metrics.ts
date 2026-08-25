import { prisma } from '../lib/prisma';

const ACTIVE_STATES = ['at_risk', 'analyzed', 'action_selected', 'action_dispatched', 'waiting_for_outcome'];

export interface Metrics {
  totalCases: number;
  grossAtRiskPaise: number;
  recoveredCount: number;
  recoveredPaise: number;
  recoveryRatePct: number;
  activeCount: number;
  escalatedCount: number;
  expiredCount: number;
  blockedActionCount: number;
  actionSuccessRatePct: number | null;
  avgTimeToRecoveryMin: number | null;
  // Before/after impact of the SAME at-risk batch (all in paise; sum ≈ grossAtRisk).
  impact: {
    recoveredPaise: number;
    inProgressPaise: number;
    lostPaise: number;
  };
  // Decision source: how often the ML model served the decision vs. the deterministic fallback.
  ml: {
    decisions: number;            // total decisions recorded
    mlServed: number;             // decided by the ML model
    fallbackCount: number;        // deterministic fallback (ML service unreachable)
    mlServedRatePct: number | null;
    avgLatencyMs: number | null;
  };
  byState: Record<string, number>;
  byReason: Record<string, number>;
  byAction: Record<string, number>;
}

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

/** Compute batch-level recovery metrics with SQL-side aggregation (no whole-table loads). */
export async function computeMetrics(merchantId?: string): Promise<Metrics> {
  const caseWhere = merchantId ? { merchantId } : {};
  const scoped = merchantId ? { case: { merchantId } } : {};

  const [byStateRows, byReasonRows, byActionRows, recoveredAgg, decByFallback, decLatency, actByStatus] =
    await Promise.all([
      prisma.case.groupBy({ by: ['state'], where: caseWhere, _count: { _all: true }, _sum: { amount: true } }),
      prisma.case.groupBy({ by: ['reasonTag'], where: caseWhere, _count: { _all: true } }),
      prisma.case.groupBy({ by: ['assignedAction'], where: caseWhere, _count: { _all: true } }),
      prisma.outcome.aggregate({ where: { status: 'recovered', ...scoped }, _count: { _all: true }, _sum: { recoveredAmount: true }, _avg: { recoveryMinutes: true } }),
      prisma.decision.groupBy({ by: ['usedFallback'], where: scoped, _count: { _all: true } }),
      prisma.decision.aggregate({ where: { ...scoped, usedFallback: false, latencyMs: { gt: 0 } }, _avg: { latencyMs: true }, _count: { _all: true } }),
      prisma.action.groupBy({ by: ['status'], where: scoped, _count: { _all: true } }),
    ]);

  const IN_PROGRESS = new Set<string>([...ACTIVE_STATES, 'manual_escalation']);
  const byState: Record<string, number> = {};
  let total = 0;
  let grossAtRiskPaise = 0;
  let inProgressPaise = 0;
  let lostPaise = 0;
  for (const r of byStateRows) {
    byState[r.state] = r._count._all;
    total += r._count._all;
    const amt = r._sum.amount ?? 0;
    grossAtRiskPaise += amt;
    if (IN_PROGRESS.has(r.state)) inProgressPaise += amt;
    if (r.state === 'expired') lostPaise += amt;
  }
  const byReason: Record<string, number> = {};
  for (const r of byReasonRows) byReason[r.reasonTag ?? 'unknown'] = r._count._all;
  const byAction: Record<string, number> = {};
  for (const r of byActionRows) byAction[r.assignedAction ?? 'none'] = r._count._all;

  const recoveredCount = recoveredAgg._count._all;
  const recoveredPaise = recoveredAgg._sum.recoveredAmount ?? 0;
  const avgTimeToRecoveryMin = recoveredAgg._avg.recoveryMinutes != null ? Math.round(recoveredAgg._avg.recoveryMinutes) : null;

  const activeCount = ACTIVE_STATES.reduce((s, st) => s + (byState[st] ?? 0), 0);

  const mlServed = decByFallback.find((d) => d.usedFallback === false)?._count._all ?? 0;
  const fallbackCount = decByFallback.find((d) => d.usedFallback === true)?._count._all ?? 0;
  const decisionsTotal = mlServed + fallbackCount;
  const avgLatencyMs = decLatency._count._all ? Math.round(decLatency._avg.latencyMs ?? 0) : null;

  const statusCount = (s: string) => actByStatus.find((a) => a.status === s)?._count._all ?? 0;
  const succeeded = statusCount('succeeded');
  const terminal = succeeded + statusCount('failed');

  return {
    totalCases: total,
    grossAtRiskPaise,
    recoveredCount,
    recoveredPaise,
    recoveryRatePct: pct(recoveredCount, total),
    activeCount,
    escalatedCount: byState['manual_escalation'] ?? 0,
    expiredCount: byState['expired'] ?? 0,
    blockedActionCount: statusCount('blocked'),
    actionSuccessRatePct: terminal ? pct(succeeded, terminal) : null,
    avgTimeToRecoveryMin,
    impact: { recoveredPaise, inProgressPaise, lostPaise },
    ml: {
      decisions: decisionsTotal,
      mlServed,
      fallbackCount,
      mlServedRatePct: decisionsTotal ? pct(mlServed, decisionsTotal) : null,
      avgLatencyMs,
    },
    byState,
    byReason,
    byAction,
  };
}
