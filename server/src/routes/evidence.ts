import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/asyncHandler';

export const evidenceRouter = Router();

interface Roundtrip {
  orderId: string;
  paymentId: string;
  order?: { amount?: number; status?: string; created_at?: number };
  payment: { id: string; amount: number; currency: string; status: string; method: string; captured: boolean; created_at?: number };
}

const FIXTURE = path.resolve(__dirname, '../../fixtures/razorpay/live-captures.json');

/**
 * GET /api/evidence/roundtrip — the committed REAL Razorpay test-mode captures, cross-referenced to
 * the case each one recovered through the production signed-webhook path. Read-only and safe to
 * expose: these are already-committed test-mode ids, and it reads the very fixture replayRoundtrip
 * drives. Returns { captures: [] } gracefully if the fixture is absent.
 */
evidenceRouter.get(
  '/roundtrip',
  ah(async (_req, res) => {
    let file: { roundtrips?: Roundtrip[] } = {};
    try {
      file = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    } catch {
      res.json({ captures: [] });
      return;
    }
    const trips = file.roundtrips ?? [];

    const captures = await Promise.all(
      trips.map(async (t) => {
        // The webhook writes the pay_ id into Outcome.notes ("Recovered via webhook (pay_...)"),
        // so we can tie each real capture back to the exact case it closed.
        const outcome = await prisma.outcome.findFirst({
          where: { status: 'recovered', notes: { contains: t.paymentId } },
          orderBy: { recoveredAt: 'desc' },
        });
        let recoveredCase: { id: string; merchant: string; recoveredAt: string | null } | null = null;
        if (outcome) {
          const kase = await prisma.case.findUnique({
            where: { id: outcome.caseId },
            include: { merchant: { select: { name: true } } },
          });
          if (kase) recoveredCase = { id: kase.id, merchant: kase.merchant.name, recoveredAt: outcome.recoveredAt?.toISOString() ?? null };
        }
        return {
          orderId: t.orderId,
          paymentId: t.paymentId,
          amount: t.payment.amount,
          currency: t.payment.currency,
          status: t.payment.status,
          method: t.payment.method,
          captured: t.payment.captured,
          capturedAt: t.payment.created_at ?? null,
          recoveredCase,
        };
      }),
    );
    res.json({ captures });
  }),
);
