import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { transition } from '../domain/state';
import { logAudit } from '../domain/audit';
import { markRecovered, markExpired } from '../domain/recovery';
import { retrySucceeds } from '../domain/world';
import { detectFailureSpikes } from '../domain/incidents';
import { isPaused } from '../domain/killswitch';
import { runCase } from '../pipeline/runCase';
import { toMessage } from '../lib/errors';
import { mapLimit } from '../lib/concurrency';

// Per-case retry/expiry work is independent across cases, so run it with bounded concurrency to overlap
// cross-region round-trips (kept at/under the Prisma pool size — see lib/prisma.ts).
const TICK_CONCURRENCY = 10;

export interface TickResult {
  dueRetries: number;
  recovered: number;
  reQueued: number;
  expired: number;
}

/**
 * One scheduler tick:
 *   - fire due `smart_retry` cases (simulate the retry outcome by recovery
 *     probability) — success -> recovered, failure -> back to at_risk to re-decide;
 *   - revisit due `no_action` cases;
 *   - expire waiting cases past their TTL.
 *
 * `fastForward` ignores scheduled times so a live demo can advance retries instantly.
 */
export async function tick(opts: { now?: Date; fastForward?: boolean } = {}): Promise<TickResult> {
  const now = opts.now ?? new Date();
  const ff = opts.fastForward ?? false;
  let recovered = 0;
  let reQueued = 0;
  let expired = 0;

  // Single-flight guard so only ONE tick runs at a time across ALL processes (the worker, the demo
  // /tick endpoint, replicas) — otherwise overlapping ticks double-fire retries.
  //
  // We do NOT use a session advisory lock (Prisma pools connections, so lock+unlock can land on
  // different connections and leak). Instead: a DB LEASE claimed by a single ATOMIC conditional
  // UPDATE — Postgres row-locks the lease row, so of two concurrent ticks exactly one flips it. The
  // lease carries a TTL expiry, so a tick that crashes mid-run doesn't wedge the scheduler forever.
  const LEASE_MS = 120_000;
  const nowMs = now.getTime();
  await prisma.$executeRaw`INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES ('tick_lease', '{"until":0}', now()) ON CONFLICT ("key") DO NOTHING`;
  const claimed = await prisma.$executeRaw`UPDATE "Setting" SET "value" = ${JSON.stringify({ until: nowMs + LEASE_MS })}, "updatedAt" = now() WHERE "key" = 'tick_lease' AND (("value"::jsonb ->> 'until')::bigint) <= ${nowMs}`;
  if (claimed === 0) {
    logger.warn('worker.tick.skipped_locked', {});
    return { dueRetries: 0, recovered: 0, reQueued: 0, expired: 0 };
  }
  try {

  // Refresh live failure-spike awareness so retries can be deferred during an incident.
  await detectFailureSpikes(now).catch((e) => logger.warn('tick.spike_detect_failed', { error: toMessage(e) }));

  // Kill switch: stop firing retries entirely while a human has paused the system.
  if (await isPaused()) {
    logger.warn('worker.tick.paused', { reason: 'kill switch engaged' });
    return { dueRetries: 0, recovered: 0, reQueued: 0, expired: 0 };
  }

  const dueWhere: Record<string, unknown> = {
    state: 'waiting_for_outcome',
    assignedAction: { in: ['smart_retry', 'no_action'] },
    arm: 'treatment', // control cases are held out — the Recovery Lab resolves them, not the scheduler
  };
  if (!ff) dueWhere.nextRetryAt = { lte: now };

  const due = await prisma.case.findMany({ where: dueWhere });

  // Each case is independent (distinct id; per-case audit chains) so fire them with bounded concurrency.
  const outcomes = await mapLimit(due, TICK_CONCURRENCY, async (c) => {
    try {
      if (c.assignedAction === 'no_action') {
        await transition(c.id, 'at_risk', { step: 'revisit', actor: 'system', details: { from: 'no_action' } });
        await runCase(c.id, now);
        return 'requeued' as const;
      }

      // smart_retry: the INDEPENDENT world (a fixed per-reason true rate, NOT the model's own
      // prediction) decides whether the retried payment succeeds — so recovered-₹ isn't the model
      // grading itself. Deterministic in (caseId, attempt) for reproducible replays.
      if (retrySucceeds(c.id, c.reasonTag, c.attempts)) {
        await markRecovered(c.id, { recoveredAmountPaise: c.amount, source: 'retry', paymentRef: 'auto_retry', now });
        return 'recovered' as const;
      }
      await logAudit({ caseId: c.id, step: 'retry_failed', actor: 'system', details: { attempts: c.attempts } });
      await transition(c.id, 'at_risk', { step: 'retry_failed_requeue', actor: 'system', details: { attempts: c.attempts } });
      await runCase(c.id, now); // re-decide (will retry until cap, then escalate)
      return 'requeued' as const;
    } catch (e) {
      logger.error('tick.case_failed', { caseId: c.id, error: toMessage(e) });
      return 'failed' as const;
    }
  });
  recovered = outcomes.filter((o) => o === 'recovered').length;
  reQueued = outcomes.filter((o) => o === 'requeued').length;

  const overdue = await prisma.case.findMany({
    where: { state: 'waiting_for_outcome', expiresAt: { lt: now } },
    select: { id: true },
  });
  await mapLimit(overdue, TICK_CONCURRENCY, (c) => markExpired(c.id, now));
  expired = overdue.length;

  logger.info('worker.tick', { due: due.length, recovered, reQueued, expired, fastForward: ff });
  return { dueRetries: due.length, recovered, reQueued, expired };
  } finally {
    // Release the lease so the next tick can run immediately (rather than waiting out the TTL).
    await prisma
      .$executeRaw`UPDATE "Setting" SET "value" = '{"until":0}', "updatedAt" = now() WHERE "key" = 'tick_lease'`
      .catch((e) => logger.warn('tick.lease_release_failed', { error: toMessage(e) }));
  }
}
