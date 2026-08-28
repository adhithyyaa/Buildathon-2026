import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/asyncHandler';
import { ACTIVE_WINDOW_MIN } from '../domain/incidents';

/**
 * Live incident status — the read side of the IsolationForest failure-spike loop.
 * A reason listed as active means the policy engine is CURRENTLY deferring its retries
 * (see policy.ts / incidents.ts) instead of retrying into the outage.
 */
export const incidentsRouter = Router();

/** GET /api/incidents — active spikes (retries deferred) + a short recent-flag history. */
incidentsRouter.get('/', ah(async (_req, res) => {
  const now = Date.now();
  const since = new Date(now - ACTIVE_WINDOW_MIN * 60_000);
  const flags = await prisma.anomalyFlag.findMany({
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { reason: true, score: true, createdAt: true },
  });

  const activeByReason = new Map<string, { reason: string; lastAt: string; score: number; count: number }>();
  for (const f of flags) {
    if (!f.reason || f.createdAt < since) continue;
    const cur = activeByReason.get(f.reason);
    if (cur) {
      cur.count += 1;
      if (f.createdAt.toISOString() > cur.lastAt) {
        cur.lastAt = f.createdAt.toISOString();
        cur.score = f.score;
      }
    } else {
      activeByReason.set(f.reason, { reason: f.reason, lastAt: f.createdAt.toISOString(), score: f.score, count: 1 });
    }
  }

  res.json({
    active: [...activeByReason.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
    windowMinutes: ACTIVE_WINDOW_MIN,
    recent: flags.slice(0, 10).map((f) => ({ reason: f.reason, score: f.score, at: f.createdAt.toISOString() })),
  });
}));
