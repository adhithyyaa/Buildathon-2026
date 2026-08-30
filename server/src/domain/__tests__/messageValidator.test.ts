import { describe, it, expect } from 'vitest';
import { validateMessageFacts, type MessageFacts } from '../messageValidator';

/**
 * Outbound-message fact-check. The LLM drafts customer copy; this guard makes sure it can't state a
 * fact the arithmetic and policy didn't sanction. These assert it catches a hallucinated amount, an
 * unapproved discount, and a fabricated reference — while NOT firing on correct copy (no false
 * positives, so it never blocks a legitimate send).
 */
const FACTS = (over: Partial<MessageFacts> = {}): MessageFacts => ({
  amountPaise: 250_000, // ₹2,500
  currency: 'INR',
  merchantName: 'Acme',
  incentivePct: 0,
  ...over,
});

describe('outbound-message factual-token validator', () => {
  it('passes a correct message', () => {
    const v = validateMessageFacts('Payment issue\nYour payment of ₹2,500 to Acme did not go through. Complete it here.', FACTS());
    expect(v.ok).toBe(true);
    expect(v.checked).toBeGreaterThanOrEqual(1);
  });

  it('catches a hallucinated amount', () => {
    const v = validateMessageFacts('Reminder\nYou owe ₹9,999 to Acme — pay now.', FACTS());
    expect(v.ok).toBe(false);
    expect(v.violations.some((x) => x.kind === 'amount_mismatch')).toBe(true);
  });

  it('accepts the correctly-discounted amount and the approved discount %', () => {
    const v = validateMessageFacts('Offer\nComplete now and pay just ₹2,250 (10% off).', FACTS({ incentivePct: 10 }));
    expect(v.ok).toBe(true);
  });

  it('catches an unapproved discount', () => {
    const v = validateMessageFacts('Offer\nGet 25% off — pay ₹2,500 now.', FACTS({ incentivePct: 0 }));
    expect(v.ok).toBe(false);
    expect(v.violations.some((x) => x.kind === 'discount_mismatch')).toBe(true);
  });

  it('catches a fabricated payment reference', () => {
    const v = validateMessageFacts('Update\nRegarding pay_TT9fXkQ2 — your ₹2,500 payment to Acme.', FACTS());
    expect(v.ok).toBe(false);
    expect(v.violations.some((x) => x.kind === 'fabricated_reference')).toBe(true);
  });

  it('does not mistake a non-discount percentage for an offer', () => {
    const v = validateMessageFacts('Secure\n100% secure checkout — pay ₹2,500 to Acme.', FACTS());
    expect(v.ok).toBe(true);
  });

  it('flags every wrong fact when several are present', () => {
    const v = validateMessageFacts('Offer\nPay ₹9,999 with 50% off, ref order_XY12.', FACTS({ incentivePct: 10 }));
    const kinds = new Set(v.violations.map((x) => x.kind));
    expect(kinds.has('amount_mismatch')).toBe(true);
    expect(kinds.has('discount_mismatch')).toBe(true);
    expect(kinds.has('fabricated_reference')).toBe(true);
  });
});
