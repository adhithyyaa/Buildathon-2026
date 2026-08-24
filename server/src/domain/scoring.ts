import { ReasonTag } from '@prisma/client';
import { basePriorRecovery } from './reasons';

/**
 * Deterministic risk scoring. Runs BEFORE any AI so the queue is always ranked by
 * expected recoverable value, and so the AI has a sober baseline to refine rather
 * than inventing numbers from scratch.
 *
 *   riskScore    (0..100) — priority to work this case (value-weighted).
 *   urgencyScore (0..100) — how time-sensitive the recovery is.
 *   recoveryPrior (0..1)  — baseline probability of recovering this money.
 */
export interface ScoringInput {
  amountPaise: number;
  reasonTag: ReasonTag;
  retryCount: number;
  ageMinutes: number;
  customer?: { priorPayments: number; priorConversions: number; optedOut: boolean } | null;
}

export interface ScoreResult {
  riskScore: number;
  urgencyScore: number;
  recoveryPrior: number;
  expectedRecoverablePaise: number;
  recommendedLane: 'retry' | 'fresh_link' | 'nudge' | 'incentive' | 'escalate';
}

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

const REASON_URGENCY: Record<ReasonTag, number> = {
  upi_collect_timeout: 0.9,
  bank_downtime: 0.85,
  abandoned: 0.8,
  authentication_failed: 0.7,
  insufficient_funds: 0.6,
  card_declined: 0.6,
  expired_card: 0.5,
  unknown: 0.5,
};

function laneFor(reasonTag: ReasonTag): ScoreResult['recommendedLane'] {
  switch (reasonTag) {
    case ReasonTag.bank_downtime:
    case ReasonTag.upi_collect_timeout:
    case ReasonTag.insufficient_funds:
      return 'retry';
    case ReasonTag.card_declined:
    case ReasonTag.expired_card:
    case ReasonTag.authentication_failed:
      return 'fresh_link';
    case ReasonTag.abandoned:
      return 'nudge';
    default:
      return 'escalate';
  }
}

export function computeScores(input: ScoringInput): ScoreResult {
  const rupees = input.amountPaise / 100;

  // Customer conversion rate as a soft signal (unknown customer -> neutral 0.5).
  const custConv = input.customer && input.customer.priorPayments > 0
    ? clamp(input.customer.priorConversions / input.customer.priorPayments)
    : 0.5;

  // Blend the reason's base prior with the customer's history.
  let recoveryPrior = clamp(0.6 * basePriorRecovery(input.reasonTag) + 0.4 * custConv, 0.05, 0.95);
  // Each prior failed attempt lowers our expectation.
  recoveryPrior = clamp(recoveryPrior * Math.pow(0.8, input.retryCount), 0.02, 0.95);
  if (input.customer?.optedOut) recoveryPrior = clamp(recoveryPrior * 0.5, 0.01, 0.95);

  // Amount factor on a log scale: ~₹1,00,000 saturates to 1.
  const amountFactor = clamp(Math.log10(rupees + 1) / 5);

  const riskScore = Math.round(100 * (0.7 * amountFactor + 0.3 * recoveryPrior));

  const timeDecay = clamp(1 - input.ageMinutes / (48 * 60)); // decays over 48h
  const urgency = clamp(0.6 * REASON_URGENCY[input.reasonTag] + 0.4 * timeDecay - input.retryCount * 0.1);
  const urgencyScore = Math.round(100 * urgency);

  return {
    riskScore,
    urgencyScore,
    recoveryPrior,
    expectedRecoverablePaise: Math.round(input.amountPaise * recoveryPrior),
    recommendedLane: laneFor(input.reasonTag),
  };
}
