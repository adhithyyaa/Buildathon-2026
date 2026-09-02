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
      res.status(404).send(htmlPage('Link not found', 'This recovery link is invalid or has expired.', 'error'));
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

/**
 * Customer-facing recovery-link landing page. Rendered on the light Overwatch brand (warm paper,
 * emerald signal, the shield mark) so it matches the dashboard the operator just came from — the
 * page a real payer would see, not a stray dark screen.
 */
function htmlPage(title: string, body: string, variant: 'success' | 'error' = 'success') {
  const accent = variant === 'success' ? '#059669' : '#e11d48';
  const accentSoft = variant === 'success' ? '#ecfdf5' : '#fff1f2';
  const ring = variant === 'success' ? '#a7f3d0' : '#fecdd3';
  const glyph =
    variant === 'success'
      ? '<path d="M8 16.5l5 5 11-11.5" fill="none" stroke="#059669" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
      : '<path d="M16 9v9m0 4.2v.2" fill="none" stroke="#e11d48" stroke-width="3" stroke-linecap="round"/>';
  const logo =
    '<svg viewBox="0 0 32 32" width="30" height="30" fill="none" aria-hidden="true">' +
    '<path d="M16 2.4l10.8 3.83a1 1 0 0 1 .66.94v7.2c0 6.86-4.62 11.86-10.9 14.02a1.6 1.6 0 0 1-1.12 0C9.16 26.23 4.54 21.23 4.54 14.37v-7.2a1 1 0 0 1 .66-.94L16 2.4z" fill="#059669"/>' +
    '<path d="M16 2.4l10.8 3.83a1 1 0 0 1 .66.94v7.2c0 6.86-4.62 11.86-10.9 14.02a1.6 1.6 0 0 1-1.12 0" fill="#047857"/>' +
    '<path d="M10.9 15.9l3.5 3.6 7.1-7.4" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Overwatch</title><style>
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;color:#0f172a;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,system-ui,sans-serif;
  background-color:#fbfbf8;
  background-image:radial-gradient(560px 320px at 50% -6%,rgba(16,185,129,.14),transparent 70%),linear-gradient(rgba(15,23,42,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,42,.03) 1px,transparent 1px);
  background-size:auto,44px 44px,44px 44px}
.card{width:100%;max-width:432px;background:#fff;border:1px solid #e7e9ee;border-radius:20px;
  padding:36px 34px;text-align:center;box-shadow:0 12px 40px rgba(15,23,42,.08)}
.brand{display:inline-flex;align-items:center;gap:8px;margin-bottom:26px}
.brand span{font-size:16px;font-weight:700;letter-spacing:-.01em;color:#0b1220}
.badge{width:66px;height:66px;margin:0 auto 20px;border-radius:999px;display:grid;place-items:center;
  background:${accentSoft};box-shadow:0 0 0 6px ${ring}55}
h1{margin:0 0 10px;font-size:22px;font-weight:600;letter-spacing:-.015em;color:#0b1220}
p{margin:0;font-size:15px;line-height:1.65;color:#475569}
p b{color:#0b1220;font-weight:600}
.foot{margin-top:26px;padding-top:18px;border-top:1px solid #eef0f4;
  font-size:12px;color:#94a3b8;letter-spacing:.02em}
.foot b{color:${accent};font-weight:600}
</style></head><body><div class="card">
<div class="brand">${logo}<span>Overwatch</span></div>
<div class="badge"><svg viewBox="0 0 32 32" width="32" height="32">${glyph}</svg></div>
<h1>${title}</h1><p>${body}</p>
<div class="foot">Secured recovery link · <b>Overwatch</b></div>
</div></body></html>`;
}
