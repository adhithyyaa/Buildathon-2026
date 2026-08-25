import { nowIST } from '../lib/time';

const MERCHANT_TYPE: Record<string, string> = {
  UrbanKart: 'retail',
  'Chai Point': 'food_delivery',
  FitClub: 'fitness',
  BookNook: 'books',
  'MedPlus Express': 'pharmacy',
};

// These MUST mirror ml/src/worldmodel.py exactly, or the serve-time features drift from what
// the model trained on (train/serve skew). Kept here as the TS-side single source of truth.
const MERCHANT_PAST_RECOVERY: Record<string, number> = {
  retail: 0.34, food_delivery: 0.42, fitness: 0.28, books: 0.31, pharmacy: 0.38,
};
const BASE_RECOVERABILITY: Record<string, number> = {
  bank_downtime: 0.7, upi_collect_timeout: 0.62, insufficient_funds: 0.45, authentication_failed: 0.5,
  abandoned: 0.42, expired_card: 0.38, card_declined: 0.35, unknown: 0.3, debited_pending_reversal: 0.0,
};

function segment(c?: { priorPayments: number } | null): string {
  if (!c || c.priorPayments === 0) return 'new';
  return c.priorPayments < 6 ? 'occasional' : 'loyal';
}

/** Training-formula urgency (worldmodel.py:274-276) so the ML feature matches the trained distribution. */
function trainingUrgency(reasonTag: string, ageMinutes: number, attempts: number): number {
  const base = BASE_RECOVERABILITY[reasonTag] ?? 0.3;
  const raw = 0.6 * base + 0.4 * (1 - ageMinutes / (48 * 60)) - attempts * 0.1;
  return Number((100 * Math.max(0, Math.min(1, raw))).toFixed(1));
}

export interface FeatureArgs {
  amountPaise: number;
  currency: string;
  reasonTag: string;
  method?: string | null;
  channel?: string | null;
  attempts: number;
  ageMinutes: number;
  now: Date;
  merchantName: string;
  customer?: { priorPayments: number; priorConversions: number; optedOut: boolean } | null;
  urgencyScore: number;
  previousContactAttempts: number;
  lastActionType: string;
  lastActionOutcome: string;
  allowedActions: readonly string[];
}

/** Build the tabular feature payload the ML service expects. */
export function buildFeatures(a: FeatureArgs): Record<string, unknown> {
  const ist = nowIST();
  const convRate =
    a.customer && a.customer.priorPayments > 0
      ? Math.min(1, a.customer.priorConversions / a.customer.priorPayments)
      : 0.5;

  return {
    order_value: a.amountPaise / 100,
    failure_reason: a.reasonTag,
    payment_method: a.method ?? 'unknown',
    currency: a.currency,
    channel: a.channel ?? 'checkout',
    customer_segment: segment(a.customer),
    merchant_type: MERCHANT_TYPE[a.merchantName] ?? 'retail',
    retry_count: a.attempts,
    time_since_failure_min: Math.round(a.ageMinutes),
    case_age_min: Math.round(a.ageMinutes),
    hour_of_day: ist.hour(),
    day_of_week: ist.day(),
    // merchant-specific recovery culture, not a constant (matches worldmodel.py).
    past_recovery_rate: MERCHANT_PAST_RECOVERY[MERCHANT_TYPE[a.merchantName] ?? 'retail'] ?? 0.33,
    historical_conversion_rate: Number(convRate.toFixed(3)),
    // the customer's HISTORICAL failed count (payments that didn't convert) — a distinct feature
    // from the current retry_count. Feeding a.attempts here was a train/serve skew (duplicate column).
    prior_failed_attempts: a.customer ? Math.max(0, a.customer.priorPayments - a.customer.priorConversions) : 0,
    opt_out_flag: a.customer?.optedOut ? 1 : 0,
    // recompute urgency with the TRAINING formula so it matches the trained distribution
    // (the deterministic scoring engine uses a different urgency for lane routing — that's fine).
    urgency_score: trainingUrgency(a.reasonTag, a.ageMinutes, a.attempts),
    previous_contact_attempts: a.previousContactAttempts,
    last_action_type: a.lastActionType,
    last_action_outcome: a.lastActionOutcome,
    allowed_actions: [...a.allowedActions],
  };
}
