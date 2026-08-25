import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/asyncHandler';
import { runCase } from '../pipeline/runCase';
import { markRecovered, markExpired } from '../domain/recovery';
import { generateSyntheticCases } from '../seed/dataset';
import { normalizeAtRiskInput } from '../ingestion/normalize';
import { ingestEvent } from '../ingestion/ingest';
import { tick } from '../worker/tick';
import { formatINR } from '../lib/money';
import { logger } from '../lib/logger';
import { toMessage } from '../lib/errors';

export const demoRouter = Router();

async function seedDemo(count: number) {
  const rows = generateSyntheticCases(count);
  let created = 0;
  let deduped = 0;
  for (const row of rows) {
    const n = normalizeAtRiskInput(row, 'demo');
    const r = await ingestEvent(n);
    r.deduped ? deduped++ : created++;
  }
  return { total: rows.length, created, deduped };
}

/** POST /api/demo/seed { count? } — load a reproducible synthetic batch. */
demoRouter.post(
  '/seed',
  ah(async (req, res) => {
    const count = Math.min(Number(req.body?.count) || 120, 400);
    res.json(await seedDemo(count));
  }),
);

/** POST /api/demo/process { limit? } — run the pipeline on all at-risk cases. */
demoRouter.post(
  '/process',
  ah(async (req, res) => {
    const limit = Math.min(Number(req.body?.limit) || 500, 1000);
    const atRisk = await prisma.case.findMany({
      where: { state: 'at_risk' },
      select: { id: true },
      orderBy: [{ riskScore: 'desc' }],
      take: limit,
    });
    let processed = 0;
    let failed = 0;
    for (const c of atRisk) {
      try {
        await runCase(c.id);
        processed++;
      } catch (e) {
        failed++;
        logger.error('process.case_failed', { caseId: c.id, error: toMessage(e) });
      }
    }
    res.json({ processed, failed });
  }),
);

/** POST /api/demo/tick?fastForward=true — advance the retry/expiry worker one step. */
demoRouter.post(
  '/tick',
  ah(async (req, res) => {
    const fastForward = req.query.fastForward === 'true' || req.body?.fastForward === true;
    res.json(await tick({ fastForward }));
  }),
);

/** GET /api/demo/pay/:caseId — simulate a customer paying a recovery link. */
demoRouter.get(
  '/pay/:caseId',
  ah(async (req, res) => {
    const caseId = req.params.caseId!;
    const kase = await prisma.case.findUnique({
      where: { id: caseId },
      include: {
        merchant: true,
        actions: { where: { paymentLinkId: { not: null } }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!kase) {
      res.status(404).send(htmlPage('Not found', 'This recovery case does not exist.'));
      return;
    }
    const payload = kase.actions[0]?.payload as { finalAmountPaise?: number } | null;
    const amount = Number(payload?.finalAmountPaise) || kase.amount;
    await markRecovered(caseId, { recoveredAmountPaise: amount, source: 'demo', paymentRef: 'sim_pay' });
    res.set('Content-Type', 'text/html').send(
      htmlPage('Payment successful', `You paid <b>${formatINR(amount)}</b> to ${kase.merchant.name}.<br/>This case is now marked <b>recovered</b> in Recoup.`),
    );
  }),
);

/** POST /api/demo/expire-overdue — expire waiting cases past their TTL. */
demoRouter.post(
  '/expire-overdue',
  ah(async (req, res) => {
    const now = new Date();
    const overdue = await prisma.case.findMany({
      where: { state: 'waiting_for_outcome', expiresAt: { lt: now } },
      select: { id: true },
    });
    for (const c of overdue) await markExpired(c.id, now);
    res.json({ expired: overdue.length });
  }),
);

/** POST /api/demo/reset — wipe all data (demo control). */
demoRouter.post(
  '/reset',
  ah(async (_req, res) => {
    // ML tables first: Prediction has a FK to Case, so it must go before cases.
    await prisma.prediction.deleteMany({});
    await prisma.anomalyFlag.deleteMany({});
    await prisma.modelRun.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.action.deleteMany({});
    await prisma.decision.deleteMany({});
    await prisma.outcome.deleteMany({});
    await prisma.case.deleteMany({});
    await prisma.event.deleteMany({});
    await prisma.customer.deleteMany({});
    await prisma.merchant.deleteMany({});
    res.json({ ok: true });
  }),
);

function htmlPage(title: string, body: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#0b1220;color:#e5e7eb;display:grid;place-items:center;min-height:100vh;margin:0}.card{background:#111827;border:1px solid #1f2937;border-radius:16px;padding:32px 40px;max-width:440px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.4)}h1{color:#34d399;margin:0 0 12px;font-size:22px}p{color:#9ca3af;line-height:1.6;margin:0}</style></head><body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`;
}
