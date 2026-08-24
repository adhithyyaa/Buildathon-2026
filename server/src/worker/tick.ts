import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { transition } from '../domain/state';
import { logAudit } from '../domain/audit';
import { markRecovered, markExpired } from '../domain/recovery';
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

  const dueWhere: Record<string, unknown> = {
    state: 'waiting_for_outcome',
    assignedAction: { in: ['smart_retry', 'no_action'] },
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

    // smart_retry: simulate whether the retried payment succeeds.
    const p = c.recoveryProbability ?? 0.4;
    if (Math.random() < p) {
      await markRecovered(c.id, { recoveredAmountPaise: c.amount, source: 'retry', paymentRef: 'auto_retry', now });
      recovered++;
    } else {
      await logAudit({ caseId: c.id, step: 'retry_failed', actor: 'system', details: { probability: p } });
      await transition(c.id, 'at_risk', { step: 'retry_failed_requeue', actor: 'system', details: { probability: p } });
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
}
