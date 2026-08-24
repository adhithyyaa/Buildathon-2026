import { formatINR } from '../lib/money';
import type { DecisionContext } from './context';

/** Shared system prompt for every LLM provider. */
export const SYSTEM = `You are Recoup's payment-recovery decisioning agent for merchants on Razorpay (India).

For ONE at-risk payment you must:
1) diagnose the true failure reason and estimate a realistic recovery probability (0..1),
2) choose EXACTLY ONE next-best action from the allowed set to maximize expected recovered value,
3) draft a short, warm, non-pushy customer message.

Hard rules:
- Pick "action" ONLY from the allowed actions provided.
- You PROPOSE ONLY. A deterministic policy engine runs AFTER you and will cap incentives, enforce human approval, and shift timing (quiet hours). Never assume your proposal is final; stay within the stated policy limits.
- smart_retry: for transient failures (bank_downtime, upi_collect_timeout, momentary insufficient_funds). Set a sensible retry_delay_hours.
- send_payment_link: for failures needing a fresh attempt (card_declined, expired_card, authentication_failed).
- send_reminder: for abandoned checkouts (a nudge; an existing link may still be valid).
- offer_incentive: ONLY when the customer is high-value or repeatedly stalled AND an incentive is likely to change the outcome. Keep incentive_pct within the merchant's max discount.
- escalate_to_human: for high-value or genuinely ambiguous cases.
- Set requires_human_approval=true when the amount is at/above the human-approval threshold or you propose an incentive.
- Be honest: confidence and recovery_probability must reflect real uncertainty.
- The message must be concise and friendly, usable over SMS/WhatsApp/email, and must not promise anything the action does not actually do.`;

/** Exact JSON contract — appended for providers using generic JSON mode (not Anthropic structured output). */
export const SHAPE_HINT = `Return ONLY a JSON object (no markdown fences, no commentary) with EXACTLY this shape:
{
  "diagnosis": {
    "reason_category": "insufficient_funds | card_declined | upi_collect_timeout | bank_downtime | authentication_failed | expired_card | abandoned | unknown",
    "recovery_probability": 0.0-1.0,
    "is_auto_retriable": true|false,
    "rationale": "one short sentence"
  },
  "decision": {
    "action": "smart_retry | send_payment_link | send_reminder | offer_incentive | escalate_to_human | no_action",
    "channel": "email | sms | whatsapp | none",
    "confidence": 0.0-1.0,
    "requires_human_approval": true|false,
    "retry_delay_hours": 0-72,
    "incentive_pct": 0-50,
    "reason": "one short sentence"
  },
  "message": { "subject": "short string", "body": "short string" }
}`;

export function buildUserPrompt(ctx: DecisionContext): string {
  const c = ctx.customer;
  return [
    'Case:',
    `- Merchant: ${ctx.merchantName}`,
    `- Amount: ${formatINR(ctx.amountPaise)} (${ctx.amountPaise} paise)`,
    `- Baseline failure reason (deterministic): ${ctx.reasonTag}`,
    `- Payment method: ${ctx.method ?? 'unknown'}`,
    `- Channel: ${ctx.channel ?? 'unknown'}`,
    `- Prior retry attempts: ${ctx.retryCount}`,
    `- Age since failure: ${ctx.ageMinutes} min`,
    `- Baseline recovery probability: ${ctx.recoveryPrior.toFixed(2)}`,
    `- Recommended lane (hint only): ${ctx.recommendedLane}`,
    'Customer:',
    c ? `- Name: ${c.name ?? 'unknown'}` : '- (no customer profile)',
    c ? `- Prior successful payments: ${c.priorPayments}` : '',
    c ? `- Prior conversions after outreach: ${c.priorConversions}` : '',
    c ? `- Opted out of outreach: ${c.optedOut}` : '',
    'Policy limits:',
    `- Max retries: ${ctx.policy.maxRetries}`,
    `- Max discount: ${ctx.policy.maxDiscountPct}%`,
    `- Human-approval threshold: ${formatINR(ctx.policy.humanApprovalAmountPaise)}`,
    `- Quiet hours (IST): ${ctx.policy.quietHoursStart}:00–${ctx.policy.quietHoursEnd}:00`,
    `Allowed actions: ${ctx.allowedActions.join(', ')}`,
    '',
    'Return the recovery plan.',
  ]
    .filter(Boolean)
    .join('\n');
}
