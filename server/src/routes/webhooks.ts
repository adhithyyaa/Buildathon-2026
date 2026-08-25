import express, { Router } from 'express';
import { ah } from '../lib/asyncHandler';
import { prisma } from '../lib/prisma';
import { verifyWebhookSignature } from '../integrations/razorpay';
import { normalizeRazorpayPaymentFailed } from '../ingestion/normalize';
import { ingestEvent } from '../ingestion/ingest';
import { markRecovered, extractCaseId } from '../domain/recovery';
import { logger } from '../lib/logger';

export const webhookRouter = Router();

/**
 * POST /api/webhooks/razorpay
 * Uses the RAW body (mounted before the JSON parser) so we can verify the HMAC.
 * - payment.failed        -> ingest a new at-risk case
 * - payment_link.paid /   -> mark the referenced case recovered (the hero moment)
 *   payment.captured / order.paid
 */
webhookRouter.post(
  '/razorpay',
  express.raw({ type: '*/*' }),
  ah(async (req, res) => {
    const signature = req.header('x-razorpay-signature');
    const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ''), 'utf8');

    if (!verifyWebhookSignature(rawBody, signature)) {
      res.status(400).json({ error: 'invalid_signature' });
      return;
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      res.status(400).json({ error: 'invalid_json' });
      return;
    }

    const event = String(payload.event ?? '');

    // Idempotency: Razorpay retries webhooks for 24h with NO ordering guarantee, so the same
    // delivery can arrive many times and out of order. De-duplicate on x-razorpay-event-id —
    // insert-then-catch on the unique PK means a re-delivery is an ack-only no-op.
    const eventId = req.header('x-razorpay-event-id');
    if (eventId) {
      try {
        await prisma.processedWebhook.create({ data: { eventId, eventType: event } });
      } catch {
        logger.info('webhook.duplicate', { eventId, event });
        res.json({ ok: true, deduped: true });
        return;
      }
    }

    if (event === 'payment.failed') {
      const normalized = normalizeRazorpayPaymentFailed(payload);
      if (normalized) await ingestEvent(normalized);
    } else if (['payment_link.paid', 'payment.captured', 'order.paid'].includes(event)) {
      const caseId = extractCaseId(payload);
      const amount =
        payload?.payload?.payment?.entity?.amount ??
        payload?.payload?.payment_link?.entity?.amount_paid ??
        0;
      if (caseId) {
        await markRecovered(caseId, {
          recoveredAmountPaise: Number(amount) || 0,
          source: 'webhook',
          paymentRef: payload?.payload?.payment?.entity?.id,
        });
      }
    }

    logger.info('webhook.received', { event });
    res.json({ ok: true });
  }),
);
