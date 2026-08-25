import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { mlAnomalyWindow } from '../ml/client';

/**
 * Live failure-spike ("incident") awareness — this is what turns the windowed IsolationForest
 * anomaly detector from a train-time metric into a running signal the policy engine acts on.
 *
 *   detectFailureSpikes()   counts recent failures per reason, asks the ML service whether the
 *                           mix is anomalous, and records an AnomalyFlag per spiking reason.
 *   activeIncidentReasons() reads the recent flags so the policy engine can DEFER retries for a
 *                           reason that is spiking right now (a bank/UPI outage) instead of
 *                           adding to the storm.
 */
const DETECT_WINDOW_MIN = 60; // count failures over the last hour
const ACTIVE_WINDOW_MIN = 30; // a flag counts as an active incident for this long

export async function detectFailureSpikes(now: Date = new Date()): Promise<{ anomaly: boolean; reasons: string[] }> {
  const since = new Date(now.getTime() - DETECT_WINDOW_MIN * 60_000);
  const rows = await prisma.case.groupBy({
    by: ['reasonTag'],
    where: { createdAt: { gte: since }, reasonTag: { not: null } },
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const r of rows) if (r.reasonTag) counts[r.reasonTag] = r._count._all;
  if (Object.keys(counts).length === 0) return { anomaly: false, reasons: [] };

  const result = await mlAnomalyWindow(counts);
  if (!result || !result.anomaly) return { anomaly: false, reasons: [] };

  const windowKey = `${new Date(Math.floor(now.getTime() / (DETECT_WINDOW_MIN * 60_000)) * DETECT_WINDOW_MIN * 60_000).toISOString()}`;
  const spiking = result.contributors.filter((c) => c.z >= 2.5);
  const reasons: string[] = [];
  for (const c of spiking) {
    reasons.push(c.reason);
    await prisma.anomalyFlag.create({
      data: { windowKey, score: result.score, reason: c.reason, contributors: c as unknown as object },
    });
  }
  if (reasons.length) logger.warn('incident.detected', { windowKey, score: result.score, reasons });
  return { anomaly: reasons.length > 0, reasons };
}

/** Reasons flagged as an active spike within the last ACTIVE_WINDOW_MIN — the policy engine defers retries for these. */
export async function activeIncidentReasons(now: Date = new Date()): Promise<Set<string>> {
  const since = new Date(now.getTime() - ACTIVE_WINDOW_MIN * 60_000);
  const flags = await prisma.anomalyFlag.findMany({
    where: { createdAt: { gte: since }, reason: { not: null } },
    select: { reason: true },
  });
  return new Set(flags.map((f) => f.reason).filter((r): r is string => Boolean(r)));
}
