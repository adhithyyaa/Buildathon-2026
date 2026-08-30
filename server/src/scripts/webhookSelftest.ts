/**
 * Real-webhook self-test — proves the PRODUCTION HMAC signature path, not the demo path.
 *
 * Part A (always runs; no server needed): the exact verifyWebhookSignature() the
 *   /api/webhooks/razorpay route runs accepts a correctly HMAC-SHA256-signed body and
 *   rejects a tampered body, a tampered signature, a wrong secret, and a missing header.
 *
 * Part B (runs only if RAZORPAY_WEBHOOK_SECRET is set AND the API is reachable): drives a
 *   full *signed* round-trip through the live server —
 *     payment.failed  -> a new at-risk case is ingested
 *     runCase()       -> the ML pipeline attaches a real recovery decision
 *     payment.captured (notes.caseId = case_<id>, signed) -> the case is marked recovered
 *   and confirms a tampered signature is rejected with HTTP 400.
 *
 * The signing secret is read from RAZORPAY_WEBHOOK_SECRET so the signer and the server's
 * verifier share one key. For local runs pass a throwaway value on the command line (it is
 * never a Razorpay-issued secret); for production, use the secret the Razorpay dashboard
 * generates when you register the webhook. See docs/WEBHOOKS.md.
 *
 * Usage:  npx tsx src/scripts/webhookSelftest.ts        (API running via `npm run dev`)
 */
import crypto from 'node:crypto';
import { verifyWebhookSignature } from '../integrations/razorpay';
import { env } from '../env';
import { prisma } from '../lib/prisma';
import { runCase } from '../pipeline/runCase';

const BASE = process.env.SELFTEST_BASE ?? 'http://localhost:8787';
let failures = 0;

function check(name: string, ok: boolean, extra = ''): void {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

function hmac(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function flipLast(hex: string): string {
  return hex.slice(0, -1) + (hex.endsWith('a') ? 'b' : 'a');
}

function partA(): void {
  console.log('\n— Part A: HMAC-SHA256 signature verification (pure function) —');
  const secret = 'whsec_selftest_local_only';
  const body = JSON.stringify({ event: 'payment.failed', payload: { id: 'pay_x', amount: 100 } });
  const good = hmac(body, secret);
  check('valid signature accepted', verifyWebhookSignature(body, good, secret) === true);
  check('tampered body rejected', verifyWebhookSignature(body.replace('100', '999'), good, secret) === false);
  check('tampered signature rejected', verifyWebhookSignature(body, flipLast(good), secret) === false);
  check('wrong secret rejected', verifyWebhookSignature(body, good, secret + 'z') === false);
  check('missing signature rejected', verifyWebhookSignature(body, undefined, secret) === false);
}

async function serverUp(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/health`);
    return r.ok;
  } catch {
    return false;
  }
}

async function partB(): Promise<void> {
  console.log('\n— Part B: live signed round-trip through the API —');
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.log('  SKIP  RAZORPAY_WEBHOOK_SECRET not set — see docs/WEBHOOKS.md to enable the live loop.');
    return;
  }
  if (!(await serverUp())) {
    console.log(`  SKIP  API not reachable at ${BASE} — start it with \`npm run dev\`.`);
    return;
  }

  async function post(payload: unknown, opts: { tamper?: boolean; eventId?: string } = {}) {
    const raw = JSON.stringify(payload);
    let sig = hmac(raw, secret!);
    if (opts.tamper) sig = flipLast(sig);
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-razorpay-signature': sig };
    if (opts.eventId) headers['x-razorpay-event-id'] = opts.eventId;
    const r = await fetch(`${BASE}/api/webhooks/razorpay`, { method: 'POST', headers, body: raw });
    return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  }

  const payId = `pay_selftest_${Date.now().toString(36)}`;
  const amount = 459_900; // ₹4,599.00 in paise

  // 1. Signed payment.failed -> ingest a new at-risk case.
  const r1 = await post({
    event: 'payment.failed',
    payload: {
      payment: {
        entity: {
          id: payId,
          amount,
          currency: 'INR',
          method: 'card',
          email: 'selftest@example.com',
          contact: '+919000000001',
          order_id: `order_${payId}`,
          error_code: 'BAD_REQUEST_ERROR',
          error_description: 'card declined by issuing bank',
          error_reason: 'card_declined',
        },
      },
    },
  });
  check('payment.failed accepted (200)', r1.status === 200, `status=${r1.status}`);

  const evt = await prisma.event.findFirst({ where: { dedupeKey: `rzp_pay:${payId}` }, include: { case: true } });
  check('case ingested from webhook', !!evt?.case, evt?.case ? `case=${evt.case.id.slice(0, 8)} state=${evt.case.state}` : 'no case row');
  if (!evt?.case) return;
  const caseId = evt.case.id;

  // 2. Run the real ML pipeline on the ingested case.
  await runCase(caseId);
  const afterRun = await prisma.case.findUnique({ where: { id: caseId }, include: { predictions: { orderBy: { createdAt: 'desc' }, take: 1 } } });
  const pred = afterRun?.predictions[0];
  check('ML pipeline attached a prediction', !!pred && pred.source === 'ml', pred ? `${pred.model} -> ${pred.actionClass}` : 'no prediction');
  check('case reached a recoverable state', ['waiting_for_outcome', 'manual_escalation'].includes(afterRun?.state ?? ''), `state=${afterRun?.state}`);

  // 3. Signed payment.captured referencing the case -> mark recovered (the hero moment).
  const r2 = await post({
    event: 'payment.captured',
    payload: { payment: { entity: { id: `pay_ok_${payId}`, amount, notes: { caseId: `case_${caseId}` } } } },
  });
  check('payment.captured accepted (200)', r2.status === 200, `status=${r2.status}`);

  const recovered = await prisma.case.findUnique({ where: { id: caseId }, include: { outcome: true } });
  check(
    'case marked recovered via webhook',
    recovered?.state === 'recovered' && recovered.outcome?.status === 'recovered',
    `state=${recovered?.state} recoveredAmount=${recovered?.outcome?.recoveredAmount}`,
  );

  // 4. Idempotency regression — the "what broke": Razorpay redelivers webhooks for 24h with no
  // ordering guarantee, so a duplicate/out-of-order capture must NOT double-count recovery.
  const evId = `evt_selftest_${Date.now().toString(36)}`;
  const capturePayload = {
    event: 'payment.captured',
    payload: { payment: { entity: { id: `pay_ok2_${payId}`, amount, notes: { caseId: `case_${caseId}` } } } },
  };
  const before = await prisma.outcome.findUnique({ where: { caseId } });
  const d1 = await post(capturePayload, { eventId: evId });
  const d2 = await post(capturePayload, { eventId: evId }); // exact redelivery, same event id
  const after = await prisma.outcome.findUnique({ where: { caseId } });
  check('duplicate delivery de-duped on x-razorpay-event-id', d1.status === 200 && d2.json.deduped === true, `d1=${d1.status} d2.deduped=${d2.json.deduped}`);
  check('recovered amount not double-counted by redelivery', after?.recoveredAmount === before?.recoveredAmount, `before=${before?.recoveredAmount} after=${after?.recoveredAmount}`);

  // 5. Negative path: a tampered signature must be rejected.
  const r3 = await post(
    { event: 'payment.failed', payload: { payment: { entity: { id: `${payId}_t`, amount, currency: 'INR', method: 'card' } } } },
    { tamper: true },
  );
  check('tampered signature rejected (400)', r3.status === 400, `status=${r3.status}`);
}

(async () => {
  console.log('Sentinel webhook self-test');
  partA();
  await partB();
  console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error('self-test crashed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
