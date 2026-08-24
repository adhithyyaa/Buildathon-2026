import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/asyncHandler';
import { runCase } from '../pipeline/runCase';

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
  ah(async (req, res) => {
    const result = await runCase(req.params.id!);
    res.json(result);
  }),
);

/** POST /api/cases/:id/approve — a human approves an escalated case; recovers it manually. */
casesRouter.post(
  '/:id/approve',
  ah(async (req, res) => {
    const { markRecovered } = await import('../domain/recovery');
    const kase = await prisma.case.findUnique({ where: { id: req.params.id! } });
    if (!kase) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const updated = await markRecovered(req.params.id!, {
      recoveredAmountPaise: kase.amount,
      source: 'human',
      paymentRef: 'manual_approval',
    });
    res.json({ case: updated });
  }),
);
