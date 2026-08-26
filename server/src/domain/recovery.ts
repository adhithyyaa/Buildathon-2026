import { prisma } from '../lib/prisma';
import { canTransition, transition, InvalidTransitionError } from './state';
import { minutesBetween } from '../lib/time';

/**
 * Per-case serialization of the recovery moment. Razorpay redelivers webhooks for
 * 24h with NO ordering guarantee and fresh event ids, so several deliveries for the
 * same case can be in flight together; they would all pass the check-then-act on
 * case.state and double-write the append-only audit trail. Chaining concurrent
 * callers per case makes the flip + audit write exactly-once within this process;
 * a racer from another process is still downgraded to the idempotent path by the
 * InvalidTransitionError fallback below.
 */
const recoveryChains = new Map<string, Promise<unknown>>();

function serializePerCase<T>(caseId: string, fn: () => Promise<T>): Promise<T> {
  const tail = recoveryChains.get(caseId) ?? Promise.resolve();
  const run = tail.then(fn, fn); // always run — a failed predecessor must not block a retry
  const chained = run.then(
    () => undefined,
    () => undefined,
  );
  recoveryChains.set(caseId, chained);
  void chained.then(() => {
    // Drop the chain once it drains so the map can't grow without bound.
    if (recoveryChains.get(caseId) === chained) recoveryChains.delete(caseId);
  });
  return run;
}

/**
 * Mark a case as recovered. Called by the Razorpay webhook (real payment) or the
 * demo pay endpoint (simulated link). Idempotent, and it repairs the state edge
 * if a case is caught mid-dispatch.
 */
export async function markRecovered(
  caseId: string,
  opts: { recoveredAmountPaise: number; source: 'webhook' | 'demo' | 'human' | 'retry'; paymentRef?: string; now?: Date },
) {
  return serializePerCase(caseId, () => markRecoveredSerialized(caseId, opts));
}

async function markRecoveredSerialized(
  caseId: string,
  opts: { recoveredAmountPaise: number; source: 'webhook' | 'demo' | 'human' | 'retry'; paymentRef?: string; now?: Date },
) {
  const actor: 'webhook' | 'human' | 'system' =
    opts.source === 'webhook' ? 'webhook' : opts.source === 'human' ? 'human' : 'system';
  const now = opts.now ?? new Date();
  const kase = await prisma.case.findUnique({ where: { id: caseId } });
  if (!kase) return null;
  if (kase.state === 'recovered') return kase; // idempotent

  // Repair the edge if needed (e.g. caught in action_dispatched).
  if (!canTransition(kase.state, 'recovered') && canTransition(kase.state, 'waiting_for_outcome')) {
    await transition(caseId, 'waiting_for_outcome', { step: 'awaiting_outcome', actor: 'system' });
  }

  const recoveryMinutes = minutesBetween(kase.createdAt, now);

  await prisma.outcome.upsert({
    where: { caseId },
    create: {
      caseId,
      status: 'recovered',
      recoveredAmount: opts.recoveredAmountPaise,
      recoveredAt: now,
      recoveryMinutes,
      notes: `Recovered via ${opts.source}${opts.paymentRef ? ` (${opts.paymentRef})` : ''}`,
    },
    update: {
      status: 'recovered',
      recoveredAmount: opts.recoveredAmountPaise,
      recoveredAt: now,
      recoveryMinutes,
      notes: `Recovered via ${opts.source}${opts.paymentRef ? ` (${opts.paymentRef})` : ''}`,
    },
  });

  await prisma.action.updateMany({
    where: { caseId, status: 'dispatched' },
    data: { status: 'succeeded', deliveryStatus: 'paid' },
  });

  try {
    return await transition(caseId, 'recovered', {
      step: 'recovered',
      actor,
      details: { recoveredAmountPaise: opts.recoveredAmountPaise, source: opts.source, paymentRef: opts.paymentRef, recoveryMinutes },
    });
  } catch (err) {
    // Concurrent redeliveries (Razorpay retries for 24h with no ordering guarantee)
    // can race past the state check above together; the losers then fail the
    // recovered transition once the winner lands. If the case IS recovered now, the
    // money is safe — take the same idempotent path as the early return instead of
    // surfacing a 500 (which would make Razorpay redeliver yet again).
    if (err instanceof InvalidTransitionError) {
      const current = await prisma.case.findUnique({ where: { id: caseId } });
      if (current?.state === 'recovered') return current;
    }
    throw err;
  }
}

/** Mark a case expired (TTL passed with no recovery). */
export async function markExpired(caseId: string, now: Date = new Date()) {
  const kase = await prisma.case.findUnique({ where: { id: caseId } });
  if (!kase) return null;
  if (kase.state === 'expired' || kase.state === 'recovered') return kase;
  if (!canTransition(kase.state, 'expired')) return kase;

  await prisma.outcome.upsert({
    where: { caseId },
    create: { caseId, status: 'expired', recoveredAmount: 0, notes: 'TTL passed with no recovery' },
    update: { status: 'expired', notes: 'TTL passed with no recovery' },
  });

  return transition(caseId, 'expired', { step: 'expired', actor: 'system', details: { at: now.toISOString() } });
}

/** Resolve our caseId from a Razorpay payload's reference_id / notes. */
export function extractCaseId(payload: any): string | null {
  const pl = payload?.payload ?? {};
  const link = pl?.payment_link?.entity;
  const payment = pl?.payment?.entity;
  const ref = link?.reference_id || payment?.notes?.caseId || link?.notes?.caseId;
  if (!ref) return null;
  return String(ref).startsWith('case_') ? String(ref).slice('case_'.length) : String(ref);
}
