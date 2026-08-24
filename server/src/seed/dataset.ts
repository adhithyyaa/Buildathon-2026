import type { AtRiskInput } from '../ingestion/normalize';

/** Deterministic RNG so the demo dataset is reproducible (replay-safe). */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MERCHANTS = ['UrbanKart', 'Chai Point', 'FitClub', 'BookNook', 'MedPlus Express'];
const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Diya', 'Ananya', 'Ishaan', 'Kabir', 'Meera', 'Rohan', 'Sara', 'Neha', 'Arjun', 'Priya', 'Kiran', 'Zoya', 'Dev', 'Tara', 'Nikhil'];
const LAST = ['Sharma', 'Verma', 'Iyer', 'Nair', 'Gupta', 'Reddy', 'Khan', 'Bose', 'Patel', 'Rao'];

interface ReasonSpec {
  eventType: 'payment_failed' | 'checkout_abandoned';
  method: string;
  failureReason?: string;
  failureCode?: string;
  channel: string;
  weight: number;
}

const REASONS: ReasonSpec[] = [
  { eventType: 'payment_failed', method: 'upi', failureReason: 'UPI collect request timed out', failureCode: 'BAD_REQUEST_ERROR', channel: 'checkout', weight: 22 },
  { eventType: 'payment_failed', method: 'upi', failureReason: 'Bank is experiencing downtime', failureCode: 'GATEWAY_ERROR', channel: 'checkout', weight: 14 },
  { eventType: 'payment_failed', method: 'card', failureReason: 'Insufficient funds in account', failureCode: 'GATEWAY_ERROR', channel: 'checkout', weight: 14 },
  { eventType: 'payment_failed', method: 'card', failureReason: 'Card declined by issuing bank', failureCode: 'BAD_REQUEST_ERROR', channel: 'checkout', weight: 14 },
  { eventType: 'payment_failed', method: 'card', failureReason: 'Card has expired', failureCode: 'BAD_REQUEST_ERROR', channel: 'checkout', weight: 6 },
  { eventType: 'payment_failed', method: 'card', failureReason: '3DS authentication failed, OTP not entered', failureCode: 'BAD_REQUEST_ERROR', channel: 'checkout', weight: 10 },
  { eventType: 'checkout_abandoned', method: 'upi', channel: 'checkout', weight: 16 },
  { eventType: 'payment_failed', method: 'wallet', failureReason: 'Payment failed', failureCode: 'SERVER_ERROR', channel: 'checkout', weight: 4 },
];

function weightedPick(rng: () => number, specs: ReasonSpec[]): ReasonSpec {
  const total = specs.reduce((s, r) => s + r.weight, 0);
  let x = rng() * total;
  for (const r of specs) {
    x -= r.weight;
    if (x <= 0) return r;
  }
  return specs[specs.length - 1]!;
}

/** Minutes since the failure, weighted toward recent (drives urgency + time-to-recover). */
function pickAgeMinutes(rng: () => number): number {
  const r = rng();
  if (r < 0.4) return 5 + Math.floor(rng() * 355); // < 6h
  if (r < 0.8) return 360 + Math.floor(rng() * (24 * 60 - 360)); // 6–24h
  return 24 * 60 + Math.floor(rng() * 24 * 60); // 24–48h
}

/** Amount in paise: a few sub-floor tiny orders, mostly small, with a high-value tail. */
function pickAmountPaise(rng: () => number): number {
  const r = rng();
  if (r < 0.06) return (15 + Math.floor(rng() * 80)) * 100; // ₹15–₹95 (below pursuit floor → blocked)
  if (r < 0.72) return (200 + Math.floor(rng() * 4800)) * 100; // ₹200–5,000
  if (r < 0.93) return (5000 + Math.floor(rng() * 20000)) * 100; // ₹5,000–25,000
  return (25000 + Math.floor(rng() * 50000)) * 100; // ₹25,000–75,000 (triggers approval)
}

/**
 * Build a reproducible batch of synthetic at-risk cases with a realistic mix of
 * reasons, amounts, customer histories, opt-outs, and abandoned checkouts — so the
 * demo shows the system handling reality, not just the happy path.
 */
export function generateSyntheticCases(count = 120, seed = 42): AtRiskInput[] {
  const rng = mulberry32(seed);
  const out: AtRiskInput[] = [];

  for (let i = 0; i < count; i++) {
    const merchant = MERCHANTS[Math.floor(rng() * MERCHANTS.length)]!;
    const first = FIRST[Math.floor(rng() * FIRST.length)]!;
    const last = LAST[Math.floor(rng() * LAST.length)]!;
    const spec = weightedPick(rng, REASONS);
    const priorPayments = Math.floor(rng() * 20);
    const priorConversions = Math.floor(rng() * (priorPayments + 1));
    const optedOut = rng() < 0.08;

    out.push({
      eventType: spec.eventType,
      merchantName: merchant,
      customerExternalId: `cust_${i}`,
      customerName: `${first} ${last}`,
      customerEmail: `${first}.${last}${i}@example.com`.toLowerCase(),
      customerPhone: `+9198${String(10000000 + Math.floor(rng() * 89999999))}`,
      optedOut,
      priorPayments,
      priorConversions,
      orderId: `order_seed_${i}`,
      paymentId: spec.eventType === 'payment_failed' ? `pay_seed_${i}` : undefined,
      amountPaise: pickAmountPaise(rng),
      currency: 'INR',
      method: spec.method,
      failureReason: spec.failureReason,
      failureCode: spec.failureCode,
      channel: spec.channel,
      retryCount: 0,
      dedupeKey: `seed:${i}`,
      ageMinutes: pickAgeMinutes(rng),
    });
  }

  return out;
}
