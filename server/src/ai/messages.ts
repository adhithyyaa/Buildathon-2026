import { formatINR } from '../lib/money';

export interface DraftedMessage {
  subject: string;
  body: string;
}

/**
 * Deterministic customer-message template for a chosen action. This is the default
 * used in the batch pipeline (fast, no LLM). The LLM is used only on demand to
 * re-draft a nicer message or write an escalation summary (see routes/ai).
 */
export function templateMessage(
  args: { merchantName: string; amountPaise: number; customerName?: string | null },
  action: string,
): DraftedMessage {
  const name = args.customerName?.split(' ')[0] || 'there';
  const amount = formatINR(args.amountPaise);
  const merchant = args.merchantName;

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
  if (action === 'send_payment_link' || action === 'offer_incentive') {
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
