import { prisma } from '../lib/prisma';
import { canTransition, transition } from './state';
import { minutesBetween } from '../lib/time';

/**
 * Mark a case as recovered. Called by the Razorpay webhook (real payment) or the
 * demo pay endpoint (simulated link). Idempotent, and it repairs the state edge
 * if a case is caught mid-dispatch.
 */
export async function markRecovered(
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

  return transition(caseId, 'recovered', {
    step: 'recovered',
    actor,
    details: { recoveredAmountPaise: opts.recoveredAmountPaise, source: opts.source, paymentRef: opts.paymentRef, recoveryMinutes },
  });
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
