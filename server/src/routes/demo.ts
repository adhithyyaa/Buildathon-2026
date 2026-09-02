import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/asyncHandler';
import { runCase } from '../pipeline/runCase';
import { markRecovered, markExpired } from '../domain/recovery';
import { generateSyntheticCases, generateSpikeBurst } from '../seed/dataset';
import { normalizeAtRiskInput } from '../ingestion/normalize';
import { ingestEvent } from '../ingestion/ingest';
import { tick } from '../worker/tick';
import { detectFailureSpikes } from '../domain/incidents';
import { formatINR } from '../lib/money';
import { logger } from '../lib/logger';
import { toMessage } from '../lib/errors';
import { mapLimit } from '../lib/concurrency';

// Bounded parallelism for the demo's per-row DB work. The DB is often in another region (e.g. Supabase
// in Mumbai while the app runs in UAE North), so sequential awaits are dominated by round-trip latency;
// overlapping them cuts seed/process/spike from ~a minute to a few seconds. Kept modest so we don't
// exhaust the connection pool or hammer the single ML replica.
const INGEST_CONCURRENCY = 10;
const PROCESS_CONCURRENCY = 8;

/** Create the (few, shared) merchants up front so the parallel ingest only ever reads them. */
async function ensureMerchants(names: Array<string | undefined>): Promise<void> {
  const distinct = [...new Set(names.map((n) => n?.trim() || 'Demo Merchant'))];
  for (const name of distinct) {
    await prisma.merchant.upsert({ where: { name }, create: { name }, update: {} });
  }
}

export const demoRouter = Router();

async function seedDemo(count: number) {
  const events = generateSyntheticCases(count).map((row) => normalizeAtRiskInput(row, 'demo'));
  await ensureMerchants(events.map((n) => n.merchantName));
  const results = await mapLimit(events, INGEST_CONCURRENCY, (n) => ingestEvent(n));
  let created = 0;
  let deduped = 0;
  for (const r of results) r.deduped ? deduped++ : created++;
  return { total: events.length, created, deduped };
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
    const outcomes = await mapLimit(atRisk, PROCESS_CONCURRENCY, async (c) => {
      try {
        await runCase(c.id);
        return true;
      } catch (e) {
        logger.error('process.case_failed', { caseId: c.id, error: toMessage(e) });
        return false;
      }
    });
    const processed = outcomes.filter(Boolean).length;
    const failed = outcomes.length - processed;
    res.json({ processed, failed });
  }),
);

/**
 * POST /api/demo/spike { reason?, count? } — ingest a concentrated burst of one failure reason
 * and run the IsolationForest detector, so the live incident path (detect → flag → policy defers
 * retries) can be demonstrated on demand.
 */
demoRouter.post(
  '/spike',
  ah(async (req, res) => {
    const reason = req.body?.reason === 'bank_downtime' ? 'bank_downtime' : 'upi_collect_timeout';
    // 60 clears the detector's z≥2.5 bar over the trained 4h baseline (mean ~17, σ ~12) with margin.
    const count = Math.min(Number(req.body?.count) || 60, 120);
    const events = generateSpikeBurst(reason, count, Date.now() % 1_000_000_000).map((row) => normalizeAtRiskInput(row, 'demo'));
    await ensureMerchants(events.map((n) => n.merchantName));
    const results = await mapLimit(events, INGEST_CONCURRENCY, (n) => ingestEvent(n));
    let created = 0;
    let deduped = 0;
    for (const r of results) r.deduped ? deduped++ : created++;
    const det = await detectFailureSpikes();
    res.json({ created, deduped, anomaly: det.anomaly, reasons: det.reasons });
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
      htmlPage('Payment successful', `You paid <b>${formatINR(amount)}</b> to ${kase.merchant.name}.<br/>This case is now marked <b>recovered</b> in Overwatch.`),
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
    // One TRUNCATE ... CASCADE clears the whole demo graph in a single statement — far fewer round-trips
    // than per-table deletes (which matter when the DB is cross-region), and TRUNCATE bypasses the
    // append-only AuditLog trigger (that trigger only guards row DELETE/UPDATE). Setting and
    // ProcessedWebhook are intentionally preserved (kill switch, tick lease, webhook idempotency).
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "AuditLog","Outcome","Action","Decision","Prediction","AnomalyFlag","ModelRun","Case","Event","Customer","Merchant" RESTART IDENTITY CASCADE',
    );
    res.json({ ok: true });
  }),
);

function htmlPage(title: string, body: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#0b1220;color:#e5e7eb;display:grid;place-items:center;min-height:100vh;margin:0}.card{background:#111827;border:1px solid #1f2937;border-radius:16px;padding:32px 40px;max-width:440px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.4)}h1{color:#34d399;margin:0 0 12px;font-size:22px}p{color:#9ca3af;line-height:1.6;margin:0}</style></head><body><div class="card"><h1>${title}</h1><p>${body}</p></div></body></html>`;
}
