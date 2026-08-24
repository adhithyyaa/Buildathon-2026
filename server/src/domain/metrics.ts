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
  ai: {
    decisions: number;
    validCount: number;
    jsonValidityRatePct: number | null;
    fallbackCount: number;
    avgLatencyMs: number | null;
  };
  byState: Record<string, number>;
  byReason: Record<string, number>;
  byAction: Record<string, number>;
}

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

/** Compute batch-level recovery metrics. In-memory aggregation (demo scale). */
export async function computeMetrics(merchantId?: string): Promise<Metrics> {
  const caseWhere = merchantId ? { merchantId } : {};
  const [cases, decisions, actions] = await Promise.all([
    prisma.case.findMany({ where: caseWhere, include: { outcome: true } }),
    prisma.decision.findMany({
      where: merchantId ? { case: { merchantId } } : {},
      select: { valid: true, usedFallback: true, model: true, latencyMs: true },
    }),
    prisma.action.findMany({
      where: merchantId ? { case: { merchantId } } : {},
      select: { status: true },
    }),
  ]);

  const total = cases.length;
  const grossAtRiskPaise = cases.reduce((s, c) => s + c.amount, 0);

  const recovered = cases.filter((c) => c.state === 'recovered');
  const recoveredPaise = recovered.reduce((s, c) => s + (c.outcome?.recoveredAmount ?? 0), 0);

  const byState: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  const byAction: Record<string, number> = {};
  for (const c of cases) {
    byState[c.state] = (byState[c.state] ?? 0) + 1;
    const r = c.reasonTag ?? 'unknown';
    byReason[r] = (byReason[r] ?? 0) + 1;
    const a = c.assignedAction ?? 'none';
    byAction[a] = (byAction[a] ?? 0) + 1;
  }

  const recoveryMins = recovered
    .map((c) => c.outcome?.recoveryMinutes)
    .filter((m): m is number => typeof m === 'number');
  const avgTimeToRecoveryMin = recoveryMins.length
    ? Math.round(recoveryMins.reduce((s, m) => s + m, 0) / recoveryMins.length)
    : null;

  // AI reliability (only over decisions where the AI was actually attempted).
  const aiDecisions = decisions.filter((d) => d.model !== 'deterministic-fallback');
  const aiValid = aiDecisions.filter((d) => d.valid).length;
  const latencies = aiDecisions.map((d) => d.latencyMs).filter((n): n is number => typeof n === 'number' && n > 0);

  const blockedActionCount = actions.filter((a) => a.status === 'blocked').length;
  const terminalActions = actions.filter((a) => a.status === 'succeeded' || a.status === 'failed');
  const succeeded = actions.filter((a) => a.status === 'succeeded').length;

  return {
    totalCases: total,
    grossAtRiskPaise,
    recoveredCount: recovered.length,
    recoveredPaise,
    recoveryRatePct: pct(recovered.length, total),
    activeCount: cases.filter((c) => ACTIVE_STATES.includes(c.state)).length,
    escalatedCount: byState['manual_escalation'] ?? 0,
    expiredCount: byState['expired'] ?? 0,
    blockedActionCount,
    actionSuccessRatePct: terminalActions.length ? pct(succeeded, terminalActions.length) : null,
    avgTimeToRecoveryMin,
    impact: {
      recoveredPaise,
      inProgressPaise: cases
        .filter((c) => ACTIVE_STATES.includes(c.state) || c.state === 'manual_escalation')
        .reduce((s, c) => s + c.amount, 0),
      lostPaise: cases.filter((c) => c.state === 'expired').reduce((s, c) => s + c.amount, 0),
    },
    ai: {
      decisions: aiDecisions.length,
      validCount: aiValid,
      jsonValidityRatePct: aiDecisions.length ? pct(aiValid, aiDecisions.length) : null,
      fallbackCount: decisions.filter((d) => d.usedFallback).length,
      avgLatencyMs: latencies.length ? Math.round(latencies.reduce((s, n) => s + n, 0) / latencies.length) : null,
    },
    byState,
    byReason,
    byAction,
  };
}
