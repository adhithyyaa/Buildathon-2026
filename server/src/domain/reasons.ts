import { ReasonTag } from '@prisma/client';

/**
 * Deterministic failure-reason classifier.
 *
 * Gateways return inconsistent, overlapping reason strings. This maps the raw
 * signal into our normalized taxonomy. It is used two ways:
 *   - as the baseline `reason_tag` on every case, and
 *   - as the FALLBACK when the AI layer is unavailable or returns invalid output.
 *
 * The AI diagnosis can refine this (and add a recovery probability), but the
 * system is always able to make a safe decision without the AI.
 */
export function classifyReason(input: {
  failureReason?: string | null;
  failureCode?: string | null;
  method?: string | null;
  eventType: string;
}): ReasonTag {
  if (input.eventType === 'checkout_abandoned') return ReasonTag.abandoned;

  const s = `${input.failureReason ?? ''} ${input.failureCode ?? ''}`.toLowerCase();
  const method = (input.method ?? '').toLowerCase();
  const isUpi = method.includes('upi');

  if (/insufficient|insuff|low.?balance|\bnsf\b|not_enough/.test(s)) return ReasonTag.insufficient_funds;
  if (/expired/.test(s) && /card/.test(s)) return ReasonTag.expired_card;
  if (/auth|otp|3ds|3-?d-?secure|authentication|not.?authenticated/.test(s)) return ReasonTag.authentication_failed;
  if (/downtime|bank.?down|issuer.?down|gateway.?error|gateway.?down|server_error/.test(s)) return ReasonTag.bank_downtime;
  if (isUpi && /timeout|expired|collect|not.?approved|declined|failed|no.?response/.test(s)) return ReasonTag.upi_collect_timeout;
  if (/do_not_honou?r|declin|card_declined|payment_failed|\bfailed\b|invalid_card|card/.test(s)) return ReasonTag.card_declined;

  return ReasonTag.unknown;
}

/** Reasons that are candidates for an automatic retry (vs needing a fresh link / other action). */
export function isAutoRetriable(tag: ReasonTag): boolean {
  return (
    tag === ReasonTag.bank_downtime ||
    tag === ReasonTag.upi_collect_timeout ||
    tag === ReasonTag.insufficient_funds
  );
}

/** A coarse prior probability of recovery per reason (0..1), used by the fallback decisioner. */
export function basePriorRecovery(tag: ReasonTag): number {
  switch (tag) {
    case ReasonTag.bank_downtime:
      return 0.7; // transient; retry usually works
    case ReasonTag.upi_collect_timeout:
      return 0.6;
    case ReasonTag.insufficient_funds:
      return 0.45; // depends on when they have funds
    case ReasonTag.authentication_failed:
      return 0.5; // a fresh link often clears it
    case ReasonTag.card_declined:
      return 0.35;
    case ReasonTag.expired_card:
      return 0.4; // needs a new card via fresh link
    case ReasonTag.abandoned:
      return 0.4; // a nudge / small incentive can convert
    default:
      return 0.3;
  }
}
