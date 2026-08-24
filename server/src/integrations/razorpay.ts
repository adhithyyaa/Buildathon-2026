import Razorpay from 'razorpay';
import crypto from 'node:crypto';
import { env, hasRazorpay } from '../env';

/**
 * Thin wrapper around the Razorpay TEST-MODE SDK.
 *
 * We only use real Razorpay for the two things that must be real to be credible:
 *   1. creating recovery Payment Links (the money-movement surface), and
 *   2. verifying inbound webhook signatures (the recovered-money proof).
 *
 * Everything else (messaging) is simulated + logged. The client is created lazily
 * so the server can boot without keys; callers guard on `hasRazorpay`.
 */

let client: Razorpay | null = null;

function getClient(): Razorpay {
  if (!hasRazorpay) {
    throw new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }
  if (!client) {
    client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID as string, key_secret: env.RAZORPAY_KEY_SECRET as string });
  }
  return client;
}

export interface CreatePaymentLinkParams {
  amountPaise: number;
  description: string;
  customer?: { name?: string; email?: string; contact?: string };
  referenceId?: string;
  callbackUrl?: string;
  notes?: Record<string, string>;
  expireBySeconds?: number; // optional TTL
}

export interface PaymentLinkResult {
  id: string;
  shortUrl: string;
  status: string;
  raw: unknown;
}

export async function createPaymentLink(p: CreatePaymentLinkParams): Promise<PaymentLinkResult> {
  const rzp = getClient();
  const payload: Record<string, unknown> = {
    amount: p.amountPaise,
    currency: 'INR',
    description: p.description,
    reference_id: p.referenceId,
    notify: { sms: false, email: false }, // Recoup drafts + "sends" its own messages
    reminder_enable: false,
    notes: p.notes,
  };
  if (p.customer) payload.customer = p.customer;
  if (p.callbackUrl) {
    payload.callback_url = p.callbackUrl;
    payload.callback_method = 'get';
  }
  if (p.expireBySeconds) {
    payload.expire_by = Math.floor(Date.now() / 1000) + p.expireBySeconds;
  }

  // The SDK's param types are looser than our typed inputs; cast at the boundary.
  const link = (await rzp.paymentLink.create(payload as never)) as {
    id: string;
    short_url: string;
    status: string;
  };
  return { id: link.id, shortUrl: link.short_url, status: link.status, raw: link };
}

export interface CreateOrderParams {
  amountPaise: number;
  receipt?: string;
  notes?: Record<string, string>;
}

export async function createOrder(p: CreateOrderParams) {
  const rzp = getClient();
  const order = (await rzp.orders.create({
    amount: p.amountPaise,
    currency: 'INR',
    receipt: p.receipt,
    notes: p.notes,
  } as never)) as { id: string; status: string };
  return { id: order.id, status: order.status, raw: order };
}

/**
 * Verify a Razorpay webhook signature: HMAC-SHA256 of the raw request body,
 * keyed by the webhook secret, compared in constant time to the header value.
 */
export function verifyWebhookSignature(rawBody: Buffer | string, signature: string | undefined): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !signature) return false;
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
