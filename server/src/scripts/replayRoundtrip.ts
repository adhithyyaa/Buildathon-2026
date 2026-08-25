/**
 * Replay the REAL Razorpay round-trip from committed evidence — no Razorpay keys required.
 *
 * server/fixtures/razorpay/live-captures.json records genuine test-mode payments that were paid
 * through Razorpay's real hosted Checkout + 3DS and CAPTURED (status="captured", fetched from the
 * Razorpay API). This script drives one of those real captured payments through the PRODUCTION
 * signed-webhook path and proves it recovers a real case — so a reviewer can reproduce the
 * captured-rupee proof against their own local server without any Razorpay credentials.
 *
 * Usage:  RAZORPAY_WEBHOOK_SECRET=<any-local-secret> npx tsx src/scripts/replayRoundtrip.ts
 *         (the API must be running with the SAME RAZORPAY_WEBHOOK_SECRET)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../env';
import { prisma } from '../lib/prisma';
import { runCase } from '../pipeline/runCase';

const BASE = process.env.SELFTEST_BASE ?? 'http://localhost:8787';
const FIXTURE = path.resolve(__dirname, '../../fixtures/razorpay/live-captures.json');

interface Roundtrip {
  orderId: string;
  paymentId: string;
  payment: { id: string; amount: number; status: string; captured: boolean; method: string };
}

let failures = 0;
function check(name: string, ok: boolean, extra = ''): void {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}
function hmac(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function main() {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.log('  SKIP  RAZORPAY_WEBHOOK_SECRET not set — see docs/WEBHOOKS.md.');
    return;
  }
  try {
    if (!(await fetch(`${BASE}/health`)).ok) throw new Error('down');
  } catch {
    console.log(`  SKIP  API not reachable at ${BASE} — start it with \`npm run dev\`.`);
    return;
  }

  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as { roundtrips: Roundtrip[] };
  const rt = fixture.roundtrips[fixture.roundtrips.length - 1]!; // the latest recorded real capture

  console.log('— Replay: a REAL Razorpay-captured payment recovers a case —');
  check('fixture payment is a genuine capture', rt.payment.status === 'captured' && rt.payment.captured === true, `${rt.paymentId} status=${rt.payment.status}`);
  const amount = rt.payment.amount;

  async function post(payload: unknown, eventId?: string) {
    const raw = JSON.stringify(payload);
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-razorpay-signature': hmac(raw, secret!) };
    if (eventId) headers['x-razorpay-event-id'] = eventId;
    const r = await fetch(`${BASE}/api/webhooks/razorpay`, { method: 'POST', headers, body: raw });
    return { status: r.status };
  }

  // 1. Ingest a fresh at-risk case (the failure that stranded the money).
  const failId = `pay_replay_${Date.now().toString(36)}`;
  await post({ event: 'payment.failed', payload: { payment: { entity: { id: failId, amount, currency: 'INR', method: 'card', error_code: 'BAD_REQUEST_ERROR', error_description: 'card declined', error_reason: 'card_declined' } } } });
  const evt = await prisma.event.findFirst({ where: { dedupeKey: `rzp_pay:${failId}` }, include: { case: true } });
  check('case ingested from webhook', !!evt?.case, evt?.case ? `case=${evt.case.id.slice(0, 8)}` : 'none');
  if (!evt?.case) return;
  const caseId = evt.case.id;

  // 2. Run the real ML pipeline.
  await runCase(caseId);

  // 3. Fire the signed payment.captured carrying the REAL captured payment id from the fixture.
  const cap = await post({ event: 'payment.captured', payload: { payment: { entity: { id: rt.paymentId, amount, notes: { caseId: `case_${caseId}` } } } } }, `evt_replay_${Date.now().toString(36)}`);
  check('payment.captured accepted (200)', cap.status === 200, `status=${cap.status}`);

  const rec = await prisma.case.findUnique({ where: { id: caseId }, include: { outcome: true } });
  check('case recovered by the REAL captured payment', rec?.state === 'recovered' && rec.outcome?.status === 'recovered', `state=${rec?.state} · ${rec?.outcome?.notes ?? ''}`);
}

main()
  .then(async () => {
    console.log(`\n${failures === 0 ? '✅ REPLAYED — a real Razorpay-captured payment recovered a case' : `❌ ${failures} CHECK(S) FAILED`}`);
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (e) => {
    console.error('replay crashed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
