import { nowIST } from '../lib/time';

const MERCHANT_TYPE: Record<string, string> = {
  UrbanKart: 'retail',
  'Chai Point': 'food_delivery',
  FitClub: 'fitness',
  BookNook: 'books',
  'MedPlus Express': 'pharmacy',
};

function segment(c?: { priorPayments: number } | null): string {
  if (!c || c.priorPayments === 0) return 'new';
  return c.priorPayments < 6 ? 'occasional' : 'loyal';
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
    past_recovery_rate: 0.33,
    historical_conversion_rate: Number(convRate.toFixed(3)),
    prior_failed_attempts: a.attempts,
    opt_out_flag: a.customer?.optedOut ? 1 : 0,
    urgency_score: a.urgencyScore,
    previous_contact_attempts: a.previousContactAttempts,
    last_action_type: a.lastActionType,
    last_action_outcome: a.lastActionOutcome,
    allowed_actions: [...a.allowedActions],
  };
}
