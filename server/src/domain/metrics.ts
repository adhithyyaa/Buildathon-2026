import { ReasonTag } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isAutoRetriable } from './reasons';

const ACTIVE_STATES = ['at_risk', 'analyzed', 'action_selected', 'action_dispatched', 'waiting_for_outcome'];

export interface FunnelStage {
  count: number;
  paise: number;
}

/** Cumulative recovery funnel — each stage counts cases that EVER reached it. */
export interface Funnel {
  detected: FunnelStage; // every at-risk case ingested
  decided: FunnelStage; // an action was assigned (control-held cases stop before this — by design)
  attempted: FunnelStage; // the executor actually dispatched something
  inRecovery: FunnelStage; // currently mid-flight (dispatched / waiting on outcome)
  recovered: FunnelStage;
  lost: FunnelStage; // expired with no recovery
  controlHeld: FunnelStage; // Recovery Lab holdout — scored, then deliberately left alone
}

export type FaultOwner = 'customer' | 'bank' | 'business' | 'other';
export type RecoveryPath = 'auto_retry' | 'fresh_link' | 'do_not_touch';

export interface ReasonBreakdownRow {
  reason: string;
  cases: number;
  atRiskPaise: number;
  recoveredCases: number;
  recoveredPaise: number;
  faultOwner: FaultOwner;
  path: RecoveryPath;
}

// Fault-owner taxonomy mirrors Razorpay's SR-analytics buckets (Customer / Banking / Business /
// Others); the recovery path is what OUR policy engine allows for that reason — the difference
// between diagnosing a failure and acting on it.
function reasonMeta(reason: string): { faultOwner: FaultOwner; path: RecoveryPath } {
  const customer = new Set<string>([ReasonTag.insufficient_funds, ReasonTag.expired_card, ReasonTag.authentication_failed]);
  const bank = new Set<string>([ReasonTag.bank_downtime, ReasonTag.upi_collect_timeout, ReasonTag.card_declined, ReasonTag.debited_pending_reversal]);
  const faultOwner: FaultOwner = customer.has(reason) ? 'customer' : bank.has(reason) ? 'bank' : reason === ReasonTag.abandoned ? 'business' : 'other';
  const path: RecoveryPath =
    reason === ReasonTag.debited_pending_reversal
      ? 'do_not_touch' // RBI TAT auto-reversal — re-charging would double-debit
      : isAutoRetriable(reason as ReasonTag)
        ? 'auto_retry'
        : 'fresh_link';
  return { faultOwner, path };
}

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
  funnel: Funnel;
  reasons: ReasonBreakdownRow[];
}

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

/** Compute batch-level recovery metrics with SQL-side aggregation (no whole-table loads). */
export async function computeMetrics(merchantId?: string): Promise<Metrics> {
  const caseWhere = merchantId ? { merchantId } : {};
  const scoped = merchantId ? { case: { merchantId } } : {};

  const [byStateRows, byReasonRows, byActionRows, recoveredAgg, decByFallback, decLatency, actByStatus, decidedAgg, attemptedAgg, controlAgg, inRecoveryAgg, treatRecoveredAgg, treatLostAgg, recoveredByReason] =
    await Promise.all([
      prisma.case.groupBy({ by: ['state'], where: caseWhere, _count: { _all: true }, _sum: { amount: true } }),
      prisma.case.groupBy({ by: ['reasonTag'], where: caseWhere, _count: { _all: true }, _sum: { amount: true } }),
      prisma.case.groupBy({ by: ['assignedAction'], where: caseWhere, _count: { _all: true } }),
      prisma.outcome.aggregate({ where: { status: 'recovered', ...scoped }, _count: { _all: true }, _sum: { recoveredAmount: true }, _avg: { recoveryMinutes: true } }),
      prisma.decision.groupBy({ by: ['usedFallback'], where: scoped, _count: { _all: true } }),
      prisma.decision.aggregate({ where: { ...scoped, usedFallback: false, latencyMs: { gt: 0 } }, _avg: { latencyMs: true }, _count: { _all: true } }),
      prisma.action.groupBy({ by: ['status'], where: scoped, _count: { _all: true } }),
      // Funnel stages (cumulative "ever reached"). Decided excludes the control arm: those cases
      // are deliberately held (assignedAction is set to no_action as bookkeeping, not a decision).
      prisma.case.aggregate({ where: { ...caseWhere, arm: 'treatment', assignedAction: { not: null } }, _count: { _all: true }, _sum: { amount: true } }),
      prisma.case.aggregate({ where: { ...caseWhere, actions: { some: { status: { in: ['dispatched', 'succeeded', 'failed'] } } } }, _count: { _all: true }, _sum: { amount: true } }),
      prisma.case.aggregate({ where: { ...caseWhere, arm: 'control' }, _count: { _all: true }, _sum: { amount: true } }),
      // Mid-flight recovery work — treatment only (control cases also wait, but are being observed, not recovered).
      prisma.case.aggregate({ where: { ...caseWhere, arm: 'treatment', state: { in: ['action_dispatched', 'waiting_for_outcome'] } }, _count: { _all: true }, _sum: { amount: true } }),
      prisma.outcome.aggregate({ where: { status: 'recovered', case: { ...caseWhere, arm: 'treatment' } }, _count: { _all: true }, _sum: { recoveredAmount: true } }),
      prisma.case.aggregate({ where: { ...caseWhere, arm: 'treatment', state: 'expired' }, _count: { _all: true }, _sum: { amount: true } }),
      prisma.case.groupBy({ by: ['reasonTag'], where: { ...caseWhere, outcome: { is: { status: 'recovered' } } }, _count: { _all: true }, _sum: { amount: true } }),
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

  // The funnel tracks the recovery MACHINE's work, so every stage after Detected is
  // treatment-arm only — control cases exit at the first drop (that's the experiment), and
  // their natural outcomes are measured by the Recovery Lab, not counted as machine work.
  const funnel: Funnel = {
    detected: { count: total, paise: grossAtRiskPaise },
    decided: { count: decidedAgg._count._all, paise: decidedAgg._sum.amount ?? 0 },
    attempted: { count: attemptedAgg._count._all, paise: attemptedAgg._sum.amount ?? 0 },
    inRecovery: { count: inRecoveryAgg._count._all, paise: inRecoveryAgg._sum.amount ?? 0 },
    recovered: { count: treatRecoveredAgg._count._all, paise: treatRecoveredAgg._sum.recoveredAmount ?? 0 },
    lost: { count: treatLostAgg._count._all, paise: treatLostAgg._sum.amount ?? 0 },
    controlHeld: { count: controlAgg._count._all, paise: controlAgg._sum.amount ?? 0 },
  };

  const recByReason = new Map(recoveredByReason.map((r) => [r.reasonTag ?? 'unknown', r]));
  const reasons: ReasonBreakdownRow[] = byReasonRows
    .map((r) => {
      const reason = r.reasonTag ?? 'unknown';
      const rec = recByReason.get(reason);
      return {
        reason,
        cases: r._count._all,
        atRiskPaise: r._sum.amount ?? 0,
        recoveredCases: rec?._count._all ?? 0,
        recoveredPaise: rec?._sum.amount ?? 0,
        ...reasonMeta(reason),
      };
    })
    .sort((a, b) => b.atRiskPaise - a.atRiskPaise);

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
    funnel,
    reasons,
  };
}
