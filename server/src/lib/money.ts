/**
 * Money helpers. Every amount in the system is an integer number of PAISE.
 * ₹1,499.00 === 149900 paise. Never use floats for currency.
 */

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/** Human-friendly INR string, e.g. formatINR(149900) -> "₹1,499.00". */
export function formatINR(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

/** Amount after applying a discount percentage, as integer paise (never below 0). */
export function applyDiscountPaise(amountPaise: number, pct: number): number {
  const clamped = Math.max(0, Math.min(100, pct));
  return Math.max(0, Math.round(amountPaise * (1 - clamped / 100)));
}

/** The paise value of a discount percentage. */
export function discountValuePaise(amountPaise: number, pct: number): number {
  return amountPaise - applyDiscountPaise(amountPaise, pct);
}
