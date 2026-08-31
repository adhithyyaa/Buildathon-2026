import { formatINR } from '../lib/money';
import { llmText } from './llm';
import { templateMessage, type DraftedMessage } from './messages';

const pct = (x: number | null | undefined) => (x == null ? '—' : `${Math.round(x * 100)}%`);

export interface CaseNarrateInput {
  merchant: string;
  amountPaise: number;
  reason: string;
  method?: string | null;
  action: string;
  recoveryProbability?: number | null;
  confidence?: number | null;
  escalation?: number | null;
  anomaly?: number | null;
  perAction?: Record<string, number> | null;
  policyOutcome?: string;
  policyNotes?: string[];
  customerName?: string | null;
  priorPayments?: number;
}

/** Plain-English "why did the system choose this action" for the ops user. */
export async function explainCase(c: CaseNarrateInput): Promise<{ text: string; source: 'llm' | 'template' }> {
  const system =
    "You are Overwatch's analyst. In 2-3 short, plain sentences explain to a merchant operations user WHY the recovery system chose this action for this failed payment. Reference the actual numbers. No jargon, no markdown, no preamble.";
  const user = [
    `Merchant: ${c.merchant}. Amount: ${formatINR(c.amountPaise)}. Failure reason: ${c.reason}. Method: ${c.method ?? 'unknown'}.`,
    `The ML model chose action "${c.action}" with recovery probability ${pct(c.recoveryProbability)}, confidence ${pct(c.confidence)}, escalation risk ${pct(c.escalation)}.`,
    c.perAction ? `Per-action recovery odds: ${JSON.stringify(c.perAction)}.` : '',
    c.policyOutcome ? `Policy outcome: ${c.policyOutcome}${c.policyNotes?.length ? ` (${c.policyNotes.join('; ')})` : ''}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const out = await llmText(system, user, 200);
  if (out) return { text: out, source: 'llm' };
  return {
    text: `The model chose ${c.action.replace(/_/g, ' ')} — it had the best expected recovery for a ${c.reason.replace(/_/g, ' ')} failure (recovery probability ${pct(c.recoveryProbability)}).${c.policyOutcome && c.policyOutcome !== 'approved' ? ` The policy engine then set this to ${c.policyOutcome}.` : ''}`,
    source: 'template',
  };
}

/** LLM re-draft of the customer message (falls back to the template). */
export async function draftMessageAI(c: CaseNarrateInput): Promise<DraftedMessage & { source: 'llm' | 'template' }> {
  const template = templateMessage({ merchantName: c.merchant, amountPaise: c.amountPaise, customerName: c.customerName }, c.action);
  const system =
    "Draft a short, warm customer message to help recover a failed payment. Under 45 words, plain text, no emojis. First line 'Subject: <subject>', then a blank line, then the body.";
  const user = `Customer first name: ${c.customerName?.split(' ')[0] ?? 'there'}. Merchant: ${c.merchant}. Amount: ${formatINR(c.amountPaise)}. Action: ${c.action}.`;
  const out = await llmText(system, user, 180);
  if (!out) return { ...template, source: 'template' };
  const m = out.match(/subject:\s*(.+)/i);
  const subject = m && m[1] ? m[1].trim() : template.subject;
  const body = out.replace(/subject:\s*.+(\r?\n)+/i, '').trim() || template.body;
  return { subject, body, source: 'llm' };
}

/** One-paragraph handoff summary for a human taking over an escalated case. */
export async function summarizeEscalation(c: CaseNarrateInput & { escalationReason?: string }): Promise<{ text: string; source: 'llm' | 'template' }> {
  const system =
    'Write a one-paragraph (under 55 words) handoff summary for a human agent taking over an escalated payment-recovery case. State the situation, why it was escalated, and a suggested next step. Plain text, no markdown.';
  const user = `Merchant ${c.merchant}, amount ${formatINR(c.amountPaise)}, reason ${c.reason}, customer ${c.customerName ?? 'unknown'} (prior payments ${c.priorPayments ?? 0}). Escalated because: ${c.escalationReason ?? 'policy required human review'}. Model recovery probability ${pct(c.recoveryProbability)}.`;
  const out = await llmText(system, user, 200);
  if (out) return { text: out, source: 'llm' };
  return {
    text: `${c.merchant} ${formatINR(c.amountPaise)} (${c.reason.replace(/_/g, ' ')}) was escalated: ${c.escalationReason ?? 'policy required review'}. Recovery probability ${pct(c.recoveryProbability)}. Suggest a manual outreach and a review of the customer's history before deciding.`,
    source: 'template',
  };
}
