import { Router } from 'express';
import { ActionType, Channel } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/asyncHandler';
import { requireToken } from '../lib/auth';
import { logAudit } from '../domain/audit';
import { runCase } from '../pipeline/runCase';
import type { PolicyDecision } from '../domain/policy';
import type { RecoveryPlan } from '../ai/schemas';

export const casesRouter = Router();

/** GET /api/cases?state=&merchantId=&limit= — ranked at-risk queue. */
casesRouter.get(
  '/',
  ah(async (req, res) => {
    const state = req.query.state as string | undefined;
    const merchantId = req.query.merchantId as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 200, 500);

    const where: Record<string, unknown> = {};
    if (state) where.state = state;
    if (merchantId) where.merchantId = merchantId;

    const cases = await prisma.case.findMany({
      where,
      include: {
        customer: { select: { name: true, email: true, optedOut: true } },
        merchant: { select: { name: true } },
        outcome: true,
        event: { select: { method: true, failureReason: true, channel: true, eventType: true, createdAt: true } },
      },
      orderBy: [{ riskScore: 'desc' }, { urgencyScore: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    res.json({ cases });
  }),
);

/** GET /api/cases/:id — full case detail with the decision + action + audit trail. */
casesRouter.get(
  '/:id',
  ah(async (req, res) => {
    const kase = await prisma.case.findUnique({
      where: { id: req.params.id! },
      include: {
        customer: true,
        merchant: true,
        event: true,
        outcome: true,
        predictions: { orderBy: { createdAt: 'asc' } },
        decisions: { orderBy: { createdAt: 'asc' } },
        actions: { orderBy: { createdAt: 'asc' } },
        auditLogs: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!kase) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ case: kase });
  }),
);

/** POST /api/cases/:id/run — run the recovery pipeline for one case. */
casesRouter.post(
  '/:id/run',
  requireToken,
  ah(async (req, res) => {
    const result = await runCase(req.params.id!);
    res.json(result);
  }),
);

/**
 * POST /api/cases/:id/approve — a human approves an escalated case. This ACTUALLY DISPATCHES the
 * withheld action (sends the real payment link / schedules the retry) via the executor; it does
 * NOT book fictional recovery. Recovery is still only confirmed later by the signed webhook.
 * If the withheld action was itself a hand-off (escalate/no_action) there is nothing to dispatch,
 * so we acknowledge it and leave the case escalated — we never book recovery without a real capture.
 */
casesRouter.post(
  '/:id/approve',
  requireToken,
  ah(async (req, res) => {
    const { execute } = await import('../domain/executor');
    const kase = await prisma.case.findUnique({
      where: { id: req.params.id! },
      include: { customer: true, merchant: true, decisions: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!kase) return void res.status(404).json({ error: 'not_found' });
    if (kase.state !== 'manual_escalation') return void res.status(409).json({ error: 'not_escalated', state: kase.state });
    const decision = kase.decisions[0];
    if (!decision) return void res.status(409).json({ error: 'no_decision_to_approve' });

    const plan = decision.rawOutput as unknown as RecoveryPlan;
    const approvedAction = (decision.action ?? plan.decision.action) as ActionType;
    await logAudit({ caseId: kase.id, step: 'human_approved', actor: 'human', details: { action: approvedAction, approver: (req.body?.approver as string) ?? 'operator' } });

    // Nothing to dispatch (the withheld action was a hand-off). We do NOT book fictional recovery —
    // there was no payment. Record the acknowledgement and leave the case escalated for the human to
    // resolve out-of-band; a real payment.captured webhook is what flips it to recovered.
    if (approvedAction === 'escalate_to_human' || approvedAction === 'no_action') {
      return void res.json({ case: kase, dispatched: null, note: 'acknowledged; no automated action to dispatch — resolve manually (recovery is only booked on a real capture)' });
    }

    const policy: PolicyDecision = {
      outcome: 'approved',
      finalAction: approvedAction,
      finalChannel: (decision.channel ?? 'whatsapp') as Channel,
      finalIncentivePct: decision.incentivePct ?? 0,
      requiresHumanApproval: false,
      scheduledFor: decision.suggestedRetryAt ?? null,
      notes: [`Human approved the escalated action (${approvedAction}); dispatching now.`],
    };
    const result = await execute({
      caseId: kase.id,
      amountPaise: kase.amount,
      currency: kase.currency,
      merchantName: kase.merchant.name,
      customer: kase.customer ? { name: kase.customer.name, email: kase.customer.email, phone: kase.customer.phone } : null,
      plan,
      policy,
      now: new Date(),
    });
    const updated = await prisma.case.findUnique({ where: { id: kase.id } });
    res.json({ case: updated, dispatched: { action: approvedAction, state: result.finalState, paymentLinkUrl: result.paymentLinkUrl ?? null } });
  }),
);

/** POST /api/cases/:id/reject — a human declines to pursue an escalated case; it expires unrecovered. */
casesRouter.post(
  '/:id/reject',
  requireToken,
  ah(async (req, res) => {
    const { transition } = await import('../domain/state');
    const kase = await prisma.case.findUnique({ where: { id: req.params.id! } });
    if (!kase) return void res.status(404).json({ error: 'not_found' });
    if (kase.state !== 'manual_escalation') return void res.status(409).json({ error: 'not_escalated', state: kase.state });
    const reason = (req.body?.reason as string) ?? 'human declined to pursue';
    const updated = await transition(kase.id, 'expired', { step: 'human_rejected', actor: 'human', details: { reason } });
    res.json({ case: updated, rejected: true });
  }),
);
