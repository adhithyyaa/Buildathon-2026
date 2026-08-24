import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/asyncHandler';
import { explainCase, draftMessageAI, summarizeEscalation, type CaseNarrateInput } from '../ai/narrate';
import { hasLLM } from '../ai/llm';

/** On-demand LLM text: explanation, message drafting, escalation summaries. Never in the money path. */
export const aiRouter = Router();

async function loadInput(id: string): Promise<CaseNarrateInput | null> {
  const kase = await prisma.case.findUnique({
    where: { id },
    include: {
      merchant: true,
      customer: true,
      event: true,
      predictions: { orderBy: { createdAt: 'desc' }, take: 1 },
      auditLogs: { where: { step: 'policy_eval' }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!kase) return null;
  const p = kase.predictions[0];
  const details = (kase.auditLogs[0]?.details ?? {}) as { outcome?: string; notes?: string[] };
  return {
    merchant: kase.merchant.name,
    amountPaise: kase.amount,
    reason: kase.reasonTag ?? 'unknown',
    method: kase.event.method,
    action: kase.assignedAction ?? p?.actionClass ?? 'no_action',
    recoveryProbability: p?.recoveryProbability ?? kase.recoveryProbability,
    confidence: p?.calibratedConfidence ?? null,
    escalation: p?.escalationProbability ?? null,
    anomaly: p?.anomalyScore ?? null,
    perAction: (p?.perAction as Record<string, number> | null) ?? null,
    policyOutcome: details.outcome,
    policyNotes: details.notes,
    customerName: kase.customer?.name,
    priorPayments: kase.customer?.priorPayments,
  };
}

aiRouter.post(
  '/cases/:id/explain',
  ah(async (req, res) => {
    const input = await loadInput(req.params.id!);
    if (!input) return void res.status(404).json({ error: 'not_found' });
    const r = await explainCase(input);
    res.json({ ...r, llmConfigured: hasLLM });
  }),
);

aiRouter.post(
  '/cases/:id/draft-message',
  ah(async (req, res) => {
    const input = await loadInput(req.params.id!);
    if (!input) return void res.status(404).json({ error: 'not_found' });
    const r = await draftMessageAI(input);
    res.json({ ...r, llmConfigured: hasLLM });
  }),
);

aiRouter.post(
  '/cases/:id/summarize',
  ah(async (req, res) => {
    const input = await loadInput(req.params.id!);
    if (!input) return void res.status(404).json({ error: 'not_found' });
    const escalationReason = input.policyNotes?.join('; ');
    const r = await summarizeEscalation({ ...input, escalationReason });
    res.json({ ...r, llmConfigured: hasLLM });
  }),
);
