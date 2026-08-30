import { isAutoRetriable } from '../domain/reasons';
import { formatINR } from '../lib/money';
import type { DecisionContext } from './context';
import type { RecoveryPlan } from './schemas';

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Deterministic recovery plan. This is what the system does when the AI is
 * disabled, errors, or returns invalid output — so Sentinel ALWAYS makes a safe,
 * explainable decision. It mirrors the reason taxonomy and recommended lane.
 */
export function fallbackPlan(ctx: DecisionContext): RecoveryPlan {
  const tag = ctx.reasonTag;

  let action: RecoveryPlan['decision']['action'] = 'escalate_to_human';
  let channel: RecoveryPlan['decision']['channel'] = 'none';
  let retryDelayHours = 0;

  switch (ctx.recommendedLane) {
    case 'retry':
      action = 'smart_retry';
      channel = 'none';
      retryDelayHours = tag === 'bank_downtime' ? 2 : tag === 'upi_collect_timeout' ? 3 : 6;
      break;
    case 'fresh_link':
      action = 'send_payment_link';
      channel = 'whatsapp';
      break;
    case 'nudge':
      action = 'send_reminder';
      channel = 'whatsapp';
      break;
    default:
      action = 'escalate_to_human';
      channel = 'none';
  }

  // High-value cases go to a human regardless of lane (policy will also enforce this).
  const requiresHumanApproval = ctx.amountPaise >= ctx.policy.humanApprovalAmountPaise;
  if (requiresHumanApproval) {
    action = 'escalate_to_human';
    channel = 'none';
  }

  return {
    diagnosis: {
      reason_category: tag,
      recovery_probability: round2(ctx.recoveryPrior),
      is_auto_retriable: isAutoRetriable(tag),
      rationale: `Deterministic classification: ${tag}.`,
    },
    decision: {
      action,
      channel,
      confidence: round2(ctx.recoveryPrior),
      requires_human_approval: requiresHumanApproval,
      retry_delay_hours: retryDelayHours,
      incentive_pct: 0,
      reason: `Rule-based fallback for lane "${ctx.recommendedLane}".`,
    },
    message: draftFallbackMessage(ctx, action),
  };
}

function draftFallbackMessage(ctx: DecisionContext, action: RecoveryPlan['decision']['action']) {
  const name = ctx.customer?.name?.split(' ')[0] || 'there';
  const amount = formatINR(ctx.amountPaise);
  const merchant = ctx.merchantName;

  if (action === 'smart_retry') {
    return {
      subject: `We'll retry your ${merchant} payment`,
      body: `Hi ${name}, your ${amount} payment to ${merchant} didn't go through — it looks temporary, so we'll automatically try again shortly. No action needed.`,
    };
  }
  if (action === 'send_reminder') {
    return {
      subject: `Your ${merchant} order is waiting`,
      body: `Hi ${name}, you left a ${amount} order at ${merchant}. Your checkout is still open — tap to finish whenever you're ready.`,
    };
  }
  if (action === 'send_payment_link') {
    return {
      subject: `Complete your ${merchant} payment`,
      body: `Hi ${name}, your ${amount} payment to ${merchant} couldn't be completed. Here's a fresh secure link to try again.`,
    };
  }
  return {
    subject: `About your ${merchant} payment`,
    body: `Hi ${name}, we're looking into your ${amount} payment to ${merchant} and will be in touch.`,
  };
}
