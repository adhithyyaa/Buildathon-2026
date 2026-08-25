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
  // We do NOT use a *session* advisory lock: Prisma runs each query on a pooled connection, so a
  // pg_advisory_lock and its pg_advisory_unlock can land on different connections, leaking the lock.
  // Instead: a DB lease (a Setting row with an expiry), and a *transaction-scoped* advisory lock that
  // only serializes the tiny read-modify-write and auto-releases on its own connection at COMMIT. The
  // lease has a TTL, so if a tick crashes mid-run the next tick reclaims it instead of stalling forever.
  const LEASE_KEY = 'tick_lease';
  const LEASE_MS = 120_000;
  const nowMs = now.getTime();
  const acquired = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(4271)`; // serialize the check; released at COMMIT
    const s = await tx.setting.findUnique({ where: { key: LEASE_KEY } });
    const until = s ? Number((JSON.parse(s.value) as { until?: number }).until ?? 0) : 0;
    if (until > nowMs) return false; // another tick holds a live lease
    const value = JSON.stringify({ until: nowMs + LEASE_MS });
    await tx.setting.upsert({ where: { key: LEASE_KEY }, create: { key: LEASE_KEY, value }, update: { value } });
    return true;
  });
  if (!acquired) {
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

  for (const c of due) {
   try {
    if (c.assignedAction === 'no_action') {
      await transition(c.id, 'at_risk', { step: 'revisit', actor: 'system', details: { from: 'no_action' } });
      await runCase(c.id, now);
      reQueued++;
      continue;
    }

    // smart_retry: the INDEPENDENT world (a fixed per-reason true rate, NOT the model's own
    // prediction) decides whether the retried payment succeeds — so recovered-₹ isn't the model
    // grading itself. Deterministic in (caseId, attempt) for reproducible replays.
    if (retrySucceeds(c.id, c.reasonTag, c.attempts)) {
      await markRecovered(c.id, { recoveredAmountPaise: c.amount, source: 'retry', paymentRef: 'auto_retry', now });
      recovered++;
    } else {
      await logAudit({ caseId: c.id, step: 'retry_failed', actor: 'system', details: { attempts: c.attempts } });
      await transition(c.id, 'at_risk', { step: 'retry_failed_requeue', actor: 'system', details: { attempts: c.attempts } });
      await runCase(c.id, now); // re-decide (will retry until cap, then escalate)
      reQueued++;
    }
   } catch (e) {
      logger.error('tick.case_failed', { caseId: c.id, error: toMessage(e) });
   }
  }

  const overdue = await prisma.case.findMany({
    where: { state: 'waiting_for_outcome', expiresAt: { lt: now } },
    select: { id: true },
  });
  for (const c of overdue) {
    await markExpired(c.id, now);
    expired++;
  }

  logger.info('worker.tick', { due: due.length, recovered, reQueued, expired, fastForward: ff });
  return { dueRetries: due.length, recovered, reQueued, expired };
  } finally {
    // Release the lease so the next tick can run immediately (rather than waiting out the TTL).
    await prisma.setting
      .upsert({ where: { key: LEASE_KEY }, create: { key: LEASE_KEY, value: '{"until":0}' }, update: { value: '{"until":0}' } })
      .catch((e) => logger.warn('tick.lease_release_failed', { error: toMessage(e) }));
  }
}
