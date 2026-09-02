import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logAudit } from '../domain/audit';
import { transition } from '../domain/state';
import { classifyReason } from '../domain/reasons';
import type { NormalizedEvent } from './normalize';

async function findOrCreateMerchant(name?: string) {
  const merchantName = name?.trim() || 'Demo Merchant';
  // Read first: under parallel ingest many rows share a merchant, and a plain read avoids row-lock
  // contention on that one row. Fall back to an atomic upsert (unique name) so concurrent creates of a
  // not-yet-existing merchant still can't duplicate.
  const existing = await prisma.merchant.findUnique({ where: { name: merchantName } });
  if (existing) return existing;
  return prisma.merchant.upsert({ where: { name: merchantName }, create: { name: merchantName }, update: {} });
}

async function findOrCreateCustomer(merchantId: string, c: NormalizedEvent['customer']) {
  if (!c) return null;
  const hasIdentity = Boolean(c.externalId || c.email || c.phone || c.name);
  if (!hasIdentity) return null;

  let found: Awaited<ReturnType<typeof prisma.customer.findFirst>> = null;
  if (c.externalId) {
    found = await prisma.customer.findFirst({ where: { merchantId, externalId: c.externalId } });
  }
  if (!found && c.email) {
    found = await prisma.customer.findFirst({ where: { merchantId, email: c.email } });
  }

  if (found) {
    // Refresh soft priors / opt-out when the source provides them.
    return prisma.customer.update({
      where: { id: found.id },
      data: {
        name: c.name ?? found.name,
        phone: c.phone ?? found.phone,
        optedOut: c.optedOut ?? found.optedOut,
        priorPayments: c.priorPayments ?? found.priorPayments,
        priorConversions: c.priorConversions ?? found.priorConversions,
      },
    });
  }

  return prisma.customer.create({
    data: {
      merchantId,
      externalId: c.externalId,
      name: c.name,
      email: c.email,
      phone: c.phone,
      optedOut: c.optedOut ?? false,
      priorPayments: c.priorPayments ?? 0,
      priorConversions: c.priorConversions ?? 0,
    },
  });
}

export interface IngestResult {
  deduped: boolean;
  eventId: string;
  caseId: string;
}

/** Fraction of at-risk cases held out as a no-action CONTROL arm for the Recovery Lab. */
const CONTROL_FRACTION = 0.2;

/**
 * Deterministic arm assignment (a hash of the dedupe key → [0,1)) so a replay reproduces the same
 * split. Uses cyrb53 (a well-distributed 53-bit string hash): the earlier FNV-1a under-mixed on the
 * structured demo dedupe keys, so the realized control share drifted to ≈9% instead of the intended
 * CONTROL_FRACTION, starving the Recovery Lab's control arm and widening its CI. cyrb53 avalanches
 * cleanly, so the split lands on CONTROL_FRACTION.
 */
function cyrb53(str: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0); // 53-bit unsigned
}

export function assignArm(seed: string): 'treatment' | 'control' {
  return cyrb53(seed) / 9007199254740992 < CONTROL_FRACTION ? 'control' : 'treatment';
}

/**
 * Idempotent ingestion of one normalized event:
 *   - dedupe on `dedupeKey` (safe to replay the same batch),
 *   - upsert merchant + customer,
 *   - create the Event and its Case (baseline reason classification),
 *   - move the case new -> at_risk, logging both steps.
 */
export async function ingestEvent(n: NormalizedEvent): Promise<IngestResult> {
  const dupe = await prisma.event.findUnique({
    where: { dedupeKey: n.dedupeKey },
    include: { case: true },
  });
  if (dupe?.case) {
    return { deduped: true, eventId: dupe.id, caseId: dupe.case.id };
  }

  const merchant = await findOrCreateMerchant(n.merchantName);
  const customer = await findOrCreateCustomer(merchant.id, n.customer);

  const reasonTag = classifyReason({
    failureReason: n.failureReason,
    failureCode: n.failureCode,
    method: n.method,
    eventType: n.eventType,
  });

  const event = await prisma.event.create({
    data: {
      merchantId: merchant.id,
      customerId: customer?.id ?? null,
      eventType: n.eventType,
      externalOrderId: n.externalOrderId,
      externalPaymentId: n.externalPaymentId,
      amount: n.amountPaise,
      currency: n.currency,
      method: n.method,
      failureReason: n.failureReason,
      failureCode: n.failureCode,
      channel: n.channel,
      retryCount: n.retryCount,
      dedupeKey: n.dedupeKey,
      raw: n.raw as unknown as Prisma.InputJsonValue,
      ...(n.occurredAt ? { createdAt: n.occurredAt } : {}),
    },
  });

  const kase = await prisma.case.create({
    data: {
      eventId: event.id,
      merchantId: merchant.id,
      customerId: customer?.id ?? null,
      amount: n.amountPaise,
      currency: n.currency,
      reasonTag,
      arm: assignArm(n.dedupeKey),
      state: 'new',
      ...(n.occurredAt ? { createdAt: n.occurredAt } : {}),
    },
  });

  await logAudit({
    caseId: kase.id,
    step: 'ingested',
    actor: 'system',
    afterState: 'new',
    details: { source: n.source, dedupeKey: n.dedupeKey, reasonTag },
  });

  await transition(kase.id, 'at_risk', {
    step: 'normalized',
    actor: 'system',
    details: { reasonTag, amount: n.amountPaise },
  });

  return { deduped: false, eventId: event.id, caseId: kase.id };
}

/** Ingest a batch, returning per-item results (used by CSV upload / seed / demo). */
export async function ingestBatch(events: NormalizedEvent[]): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const n of events) {
    results.push(await ingestEvent(n));
  }
  return results;
}
