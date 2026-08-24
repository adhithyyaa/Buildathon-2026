import crypto from 'node:crypto';
import { z } from 'zod';
import { EventType } from '@prisma/client';

/**
 * Canonical, source-agnostic shape for an at-risk signal. Everything downstream
 * (scoring, AI, policy, executor) only ever sees this — so adding a new source
 * means writing one normalizer, not touching the pipeline.
 */
export interface NormalizedEvent {
  source: 'razorpay_webhook' | 'csv' | 'demo';
  eventType: EventType;
  merchantName?: string;
  customer?: {
    externalId?: string;
    name?: string;
    email?: string;
    phone?: string;
    optedOut?: boolean;
    priorPayments?: number;
    priorConversions?: number;
  };
  externalOrderId?: string;
  externalPaymentId?: string;
  amountPaise: number;
  currency: string;
  method?: string;
  failureReason?: string;
  failureCode?: string;
  channel?: string;
  retryCount: number;
  dedupeKey: string;
  raw: unknown;
}

/** Input accepted from the demo panel and CSV rows (human-friendly). */
export const AtRiskInputSchema = z.object({
  eventType: z.enum(['payment_failed', 'checkout_abandoned', 'subscription_failed']).default('payment_failed'),
  merchantName: z.string().optional(),
  customerExternalId: z.string().optional(),
  customerName: z.string().optional(),
  customerEmail: z.string().optional(),
  customerPhone: z.string().optional(),
  optedOut: z.coerce.boolean().optional(),
  priorPayments: z.coerce.number().int().nonnegative().optional(),
  priorConversions: z.coerce.number().int().nonnegative().optional(),
  orderId: z.string().optional(),
  paymentId: z.string().optional(),
  amountPaise: z.coerce.number().int().positive().optional(),
  amountRupees: z.coerce.number().positive().optional(),
  currency: z.string().default('INR'),
  method: z.string().optional(),
  failureReason: z.string().optional(),
  failureCode: z.string().optional(),
  channel: z.string().optional(),
  retryCount: z.coerce.number().int().nonnegative().default(0),
  dedupeKey: z.string().optional(),
  externalId: z.string().optional(),
});

export type AtRiskInput = z.infer<typeof AtRiskInputSchema>;

function shortHash(parts: Array<string | number | undefined>): string {
  return crypto.createHash('sha256').update(parts.map((p) => String(p ?? '')).join('|')).digest('hex').slice(0, 16);
}

/** Normalize a demo-panel / CSV row into a canonical event. */
export function normalizeAtRiskInput(input: AtRiskInput, source: 'csv' | 'demo'): NormalizedEvent {
  const amountPaise = input.amountPaise ?? (input.amountRupees ? Math.round(input.amountRupees * 100) : 0);
  if (amountPaise <= 0) throw new Error('normalizeAtRiskInput: amount is required (amountPaise or amountRupees)');

  const idPart = input.paymentId ?? input.orderId ?? input.externalId;
  const dedupeKey =
    input.dedupeKey ??
    (idPart ? `${source}:${idPart}` : `${source}:${shortHash([input.customerEmail, amountPaise, input.failureReason, input.eventType])}`);

  return {
    source,
    eventType: input.eventType as EventType,
    merchantName: input.merchantName,
    customer: {
      externalId: input.customerExternalId,
      name: input.customerName,
      email: input.customerEmail,
      phone: input.customerPhone,
      optedOut: input.optedOut,
      priorPayments: input.priorPayments,
      priorConversions: input.priorConversions,
    },
    externalOrderId: input.orderId,
    externalPaymentId: input.paymentId,
    amountPaise,
    currency: input.currency,
    method: input.method,
    failureReason: input.failureReason,
    failureCode: input.failureCode,
    channel: input.channel,
    retryCount: input.retryCount,
    dedupeKey,
    raw: input,
  };
}

/**
 * Normalize a Razorpay `payment.failed` webhook body into a canonical event.
 * Returns null for webhook events we don't ingest as at-risk here (e.g. captures,
 * which the outcome tracker handles).
 */
export function normalizeRazorpayPaymentFailed(body: any): NormalizedEvent | null {
  if (!body || body.event !== 'payment.failed') return null;
  const p = body?.payload?.payment?.entity;
  if (!p) return null;

  return {
    source: 'razorpay_webhook',
    eventType: EventType.payment_failed,
    customer: { email: p.email || undefined, phone: p.contact || undefined },
    externalOrderId: p.order_id || undefined,
    externalPaymentId: p.id,
    amountPaise: Number(p.amount) || 0,
    currency: p.currency || 'INR',
    method: p.method || undefined,
    failureReason: p.error_description || p.error_reason || undefined,
    failureCode: p.error_code || undefined,
    channel: 'checkout',
    retryCount: 0,
    dedupeKey: `rzp_pay:${p.id}`,
    raw: body,
  };
}
