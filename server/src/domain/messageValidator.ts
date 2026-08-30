import { applyDiscountPaise } from '../lib/money';

/**
 * Outbound-message factual-token validator — the LLM writes customer messages, but it never gets to
 * assert a FACT that reaches a customer unchecked. Before any message is dispatched, this deterministic
 * validator extracts every factual token it makes — money amounts, discount percentages, internal
 * reference ids — and checks each against the case's ground truth. A hallucinated ₹ figure, an
 * unapproved discount, or a fabricated payment id is caught and the send is blocked. The model drafts;
 * arithmetic and policy decide what is true.
 */
export interface MessageFacts {
  amountPaise: number;
  currency: string;
  merchantName: string;
  /** The policy-APPROVED final incentive (not what the model proposed). */
  incentivePct: number;
}

export type FactViolationKind = 'amount_mismatch' | 'discount_mismatch' | 'fabricated_reference';

export interface FactViolation {
  kind: FactViolationKind;
  claimed: string;
  expected: string;
  detail: string;
}

export interface MessageValidation {
  ok: boolean;
  checked: number;
  violations: FactViolation[];
}

const AMOUNT_RE = /(?:₹|rs\.?|inr)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi;
// A percentage in a discount context (so "100% secure" is never mistaken for an offer).
const DISCOUNT_RE = /(?:(\d{1,3})\s*%\s*(?:off|discount|cashback|back)|(?:discount|save|coupon|offer|cashback|off)\D{0,15}?(\d{1,3})\s*%)/gi;
const REFERENCE_RE = /\b(?:pay|order|plink|qr|txn)_[A-Za-z0-9]{4,}\b/gi;

const toPaise = (rupees: string): number => Math.round(parseFloat(rupees.replace(/,/g, '')) * 100);
const rupees = (paise: number): string => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Validate an LLM-authored message (subject + body, BEFORE any link is appended) against the facts. */
export function validateMessageFacts(text: string, facts: MessageFacts): MessageValidation {
  const violations: FactViolation[] = [];
  let checked = 0;

  // 1. Money amounts — every ₹ figure must be the outstanding amount or the correctly-discounted amount.
  const discounted = applyDiscountPaise(facts.amountPaise, facts.incentivePct);
  const allowed = [facts.amountPaise, discounted];
  for (const m of text.matchAll(AMOUNT_RE)) {
    checked++;
    const claimedPaise = toPaise(m[1]!);
    const matches = allowed.some((a) => Math.abs(claimedPaise - a) <= 100); // ±₹1 absorbs rounding
    if (!matches) {
      violations.push({
        kind: 'amount_mismatch',
        claimed: rupees(claimedPaise),
        expected: discounted === facts.amountPaise ? rupees(facts.amountPaise) : `${rupees(facts.amountPaise)} (or ${rupees(discounted)} after the approved discount)`,
        detail: `Message states ${rupees(claimedPaise)}, which is neither the outstanding amount nor the approved discounted amount.`,
      });
    }
  }

  // 2. Discount percentages — any discount claimed must equal the policy-APPROVED incentive.
  for (const m of text.matchAll(DISCOUNT_RE)) {
    checked++;
    const pct = Number(m[1] ?? m[2]);
    if (pct !== facts.incentivePct) {
      violations.push({
        kind: 'discount_mismatch',
        claimed: `${pct}%`,
        expected: `${facts.incentivePct}%`,
        detail: facts.incentivePct === 0
          ? `Message offers a ${pct}% discount, but no incentive was approved for this case.`
          : `Message offers a ${pct}% discount, but the approved incentive is ${facts.incentivePct}%.`,
      });
    }
  }

  // 3. Fabricated internal references — customer copy must never cite raw payment/order ids.
  for (const m of text.matchAll(REFERENCE_RE)) {
    checked++;
    violations.push({
      kind: 'fabricated_reference',
      claimed: m[0],
      expected: 'no raw payment/order id in customer copy',
      detail: `Message cites an internal reference "${m[0]}" — customer messages must not fabricate or leak raw ids.`,
    });
  }

  return { ok: violations.length === 0, checked, violations };
}

// ── Demonstration battery ──────────────────────────────────────────────────────────────────────────
// A judge-facing showcase: run the validator over a legitimate message and three hallucinations against
// fixed ground truth, so the fact-check gate is visible, not merely asserted.

export interface MessageSafetyCase {
  id: string;
  label: string;
  intent: 'legitimate' | 'hallucination';
  message: string;
  validation: MessageValidation;
  handled: boolean; // legitimate ⇒ passes; hallucination ⇒ blocked
}

export interface MessageSafetyReport {
  facts: { amount: string; merchant: string; approvedIncentivePct: number };
  cases: MessageSafetyCase[];
  allHandled: boolean;
}

export function messageSafetyDemo(): MessageSafetyReport {
  const facts: MessageFacts = { amountPaise: 250_000, currency: 'INR', merchantName: 'Northwind Books', incentivePct: 0 };
  const samples: Array<{ id: string; label: string; intent: 'legitimate' | 'hallucination'; text: string }> = [
    { id: 'clean', label: 'Legitimate message', intent: 'legitimate', text: 'Your payment didn\'t go through\nYour ₹2,500 payment to Northwind Books failed. Complete it in one tap.' },
    { id: 'wrong_amount', label: 'Hallucinated amount', intent: 'hallucination', text: 'Payment pending\nYou owe ₹8,400 to Northwind Books — pay now to avoid cancellation.' },
    { id: 'unapproved_discount', label: 'Unapproved discount', intent: 'hallucination', text: 'Special offer\nHere is 30% off — pay ₹2,500 now.' },
    { id: 'fabricated_ref', label: 'Fabricated reference', intent: 'hallucination', text: 'Order update\nRegarding payment pay_TT7yQ2kL9 — settle your ₹2,500 to Northwind Books.' },
  ];
  const cases: MessageSafetyCase[] = samples.map((s) => {
    const validation = validateMessageFacts(s.text, facts);
    const handled = s.intent === 'legitimate' ? validation.ok : !validation.ok;
    return { id: s.id, label: s.label, intent: s.intent, message: s.text, validation, handled };
  });
  return {
    facts: { amount: rupees(facts.amountPaise), merchant: facts.merchantName, approvedIncentivePct: facts.incentivePct },
    cases,
    allHandled: cases.every((c) => c.handled),
  };
}
