/**
 * Append genuinely-CAPTURED Razorpay payments to the evidence fixture — the honest way to widen the
 * real-capture proof across rails (UPI / netbanking / wallet / card).
 *
 * There is no shortcut: a genuine capture requires paying an order through Razorpay's real hosted
 * Checkout with a test instrument (the interactive contact + bank/OTP step cannot be automated, and we
 * refuse to fabricate a "real" capture — that would destroy the one asset the field can't fake). So:
 *   1. create an order (rzp.orders.create), 2. pay its checkout in a browser with a test instrument,
 *   3. run this with the order id(s). Only payments with status === "captured" are recorded; payment
 *   ids already in the fixture are skipped, so it is safe to re-run.
 *
 * Usage:  npx tsx src/scripts/appendProof.ts <orderId> [<orderId> ...]
 */
import fs from 'node:fs';
import path from 'node:path';
import Razorpay from 'razorpay';
import { env } from '../env';

const rzp = new Razorpay({ key_id: env.RAZORPAY_KEY_ID as string, key_secret: env.RAZORPAY_KEY_SECRET as string });
const FIXTURE = path.resolve(__dirname, '../../fixtures/razorpay/live-captures.json');
const pick = (o: Record<string, unknown>, ks: string[]) => Object.fromEntries(ks.filter((k) => k in o).map((k) => [k, o[k]]));

async function main() {
  const orderIds = process.argv.slice(2);
  if (!orderIds.length) {
    console.log('usage: npx tsx src/scripts/appendProof.ts <orderId> [<orderId> ...]');
    process.exit(1);
  }
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as { roundtrips: Record<string, unknown>[]; [k: string]: unknown };
  const have = new Set(fixture.roundtrips.map((r) => r.paymentId as string));
  let added = 0;

  for (const orderId of orderIds) {
    const order = (await rzp.orders.fetch(orderId)) as unknown as Record<string, unknown>;
    const pays = (await rzp.orders.fetchPayments(orderId)) as unknown as { items: Record<string, unknown>[] };
    const cap = pays.items.find((p) => p.status === 'captured' && p.captured === true);
    if (!cap) {
      console.log(`SKIP ${orderId} — no captured payment (statuses: ${pays.items.map((p) => p.status).join(',') || 'none'})`);
      continue;
    }
    if (have.has(cap.id as string)) {
      console.log(`SKIP ${orderId} — ${cap.id} already recorded`);
      continue;
    }
    fixture.roundtrips.push({
      orderId,
      paymentId: cap.id,
      order: pick(order, ['id', 'amount', 'amount_paid', 'currency', 'status', 'receipt', 'created_at']),
      payment: pick(cap, ['id', 'order_id', 'amount', 'currency', 'status', 'method', 'captured', 'bank', 'wallet', 'vpa', 'card_id', 'created_at']),
    });
    have.add(cap.id as string);
    added++;
    console.log(`ADD  ${orderId} -> ${cap.id} (${cap.method}, ${cap.status})`);
  }

  if (added) {
    fs.writeFileSync(FIXTURE, JSON.stringify(fixture, null, 2) + '\n');
    console.log(`WROTE ${added} new capture(s) to fixtures/razorpay/live-captures.json`);
  } else {
    console.log('no changes');
  }
}

main().catch((e) => console.log('ERR ' + (e?.error?.description || e?.message || String(e))));
