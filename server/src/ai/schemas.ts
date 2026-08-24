import { z } from 'zod';

/**
 * The strict contract for the AI's output. The model must return an object that
 * validates against this schema; if it doesn't, we discard it and fall back to a
 * deterministic plan. These enums mirror the Prisma enums exactly.
 */

export const REASON_CATEGORIES = [
  'insufficient_funds',
  'card_declined',
  'upi_collect_timeout',
  'bank_downtime',
  'authentication_failed',
  'expired_card',
  'abandoned',
  'unknown',
] as const;

export const DECISION_ACTIONS = [
  'smart_retry',
  'send_payment_link',
  'send_reminder',
  'offer_incentive',
  'escalate_to_human',
  'no_action',
] as const;

export const CHANNELS = ['email', 'sms', 'whatsapp', 'none'] as const;

export const RecoveryPlanSchema = z.object({
  diagnosis: z.object({
    reason_category: z.enum(REASON_CATEGORIES),
    recovery_probability: z.number().min(0).max(1),
    is_auto_retriable: z.boolean(),
    rationale: z.string().max(500),
  }),
  decision: z.object({
    action: z.enum(DECISION_ACTIONS),
    channel: z.enum(CHANNELS),
    confidence: z.number().min(0).max(1),
    requires_human_approval: z.boolean(),
    // Proposed retry delay for smart_retry (hours from now). Policy may shift it (quiet hours).
    retry_delay_hours: z.number().min(0).max(72),
    // Proposed incentive; the policy engine caps this to the merchant's max discount.
    incentive_pct: z.number().min(0).max(50),
    reason: z.string().max(500),
  }),
  message: z.object({
    subject: z.string().max(160),
    body: z.string().max(1200),
  }),
});

export type RecoveryPlan = z.infer<typeof RecoveryPlanSchema>;
