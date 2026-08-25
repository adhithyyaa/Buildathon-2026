/** One-off: fetch the REAL captured payments from Razorpay and write them as an evidence fixture. */
import fs from 'node:fs';
import Razorpay from 'razorpay';
import { env } from '../env';
const rzp = new Razorpay({ key_id: env.RAZORPAY_KEY_ID as string, key_secret: env.RAZORPAY_KEY_SECRET as string });
const RT = [
  { orderId: 'order_TTxoVnj9XbGeWl', paymentId: 'pay_TTxufNdQ8rLAvB' },
  { orderId: 'order_TTyAIJ8ouaVN1v', paymentId: 'pay_TTyBx4OQoIQFkj' },
];
function pick(o: Record<string, unknown>, ks: string[]) { return Object.fromEntries(ks.filter((k) => k in o).map((k) => [k, o[k]])); }
async function main() {
  const roundtrips = [];
  for (const rt of RT) {
    const order = (await rzp.orders.fetch(rt.orderId)) as unknown as Record<string, unknown>;
    const pay = (await rzp.payments.fetch(rt.paymentId)) as unknown as Record<string, unknown>;
    roundtrips.push({
      orderId: rt.orderId,
      paymentId: rt.paymentId,
      order: pick(order, ['id', 'amount', 'amount_paid', 'currency', 'status', 'receipt', 'created_at']),
      payment: pick(pay, ['id', 'order_id', 'amount', 'currency', 'status', 'method', 'captured', 'card_id', 'created_at']),
    });
  }
  const out = {
    note: 'Real Razorpay TEST-MODE captures. Orders were created via the Razorpay API and paid through Razorpay\'s real hosted Checkout + 3DS with a domestic test card; the payments below are genuinely CAPTURED (fetched from the Razorpay API, not simulated). Use replayRoundtrip.ts to re-prove that a captured payment recovers a case through the production signed-webhook path — no Razorpay keys required.',
    recorded_via: 'GET /v1/orders/{id} and GET /v1/payments/{id}',
    roundtrips,
  };
  fs.writeFileSync('fixtures/razorpay/live-captures.json', JSON.stringify(out, null, 2) + '\n');
  console.log('WROTE ' + JSON.stringify(roundtrips.map((r) => ({ pay: r.paymentId, status: (r.payment as Record<string, unknown>).status, captured: (r.payment as Record<string, unknown>).captured }))));
}
main().catch((e) => console.log('ERR ' + (e?.error?.description || e?.message || String(e))));
