import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { env, hasAI } from '../env';
import { getAnthropic } from './client';
import { RecoveryPlanSchema, type RecoveryPlan } from './schemas';
import { fallbackPlan } from './fallback';
import type { DecisionContext } from './context';
import { formatINR } from '../lib/money';

export type FallbackReason = 'ai_disabled' | 'ai_error' | 'ai_invalid' | null;

export interface PlanResult {
  plan: RecoveryPlan;
  source: 'ai' | 'fallback';
  valid: boolean; // did the AI return schema-valid output?
  usedFallback: boolean;
  fallbackReason: FallbackReason;
  model: string;
  latencyMs: number;
  raw: unknown; // usage / error detail for the audit trail
}

const SYSTEM = `You are Recoup's payment-recovery decisioning agent for merchants on Razorpay (India).

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

function buildUserPrompt(ctx: DecisionContext): string {
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

/**
 * Ask the AI for a recovery plan, always returning a usable plan:
 *   - AI disabled  -> deterministic fallback
 *   - AI error     -> deterministic fallback
 *   - invalid JSON -> deterministic fallback
 *   - valid + allowed action -> the AI's plan
 * The caller records `valid` / `usedFallback` so we can report JSON-validity rate.
 */
export async function proposeRecoveryPlan(ctx: DecisionContext): Promise<PlanResult> {
  if (!hasAI) {
    return {
      plan: fallbackPlan(ctx),
      source: 'fallback',
      valid: false,
      usedFallback: true,
      fallbackReason: 'ai_disabled',
      model: 'deterministic-fallback',
      latencyMs: 0,
      raw: { note: 'ANTHROPIC_API_KEY not set' },
    };
  }

  const started = Date.now();
  try {
    const res = await getAnthropic().messages.parse({
      model: env.AI_MODEL,
      max_tokens: 2048,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildUserPrompt(ctx) }],
      output_config: { effort: 'low', format: zodOutputFormat(RecoveryPlanSchema) },
    });
    const latencyMs = Date.now() - started;
    const plan = res.parsed_output;

    if (!plan || !ctx.allowedActions.includes(plan.decision.action)) {
      return {
        plan: fallbackPlan(ctx),
        source: 'fallback',
        valid: false,
        usedFallback: true,
        fallbackReason: 'ai_invalid',
        model: env.AI_MODEL,
        latencyMs,
        raw: { note: plan ? 'action not allowed' : 'schema validation failed', usage: res.usage ?? null },
      };
    }

    return {
      plan,
      source: 'ai',
      valid: true,
      usedFallback: false,
      fallbackReason: null,
      model: env.AI_MODEL,
      latencyMs,
      raw: { usage: res.usage ?? null, stop_reason: res.stop_reason },
    };
  } catch (err) {
    return {
      plan: fallbackPlan(ctx),
      source: 'fallback',
      valid: false,
      usedFallback: true,
      fallbackReason: 'ai_error',
      model: env.AI_MODEL,
      latencyMs: Date.now() - started,
      raw: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}
