import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { ah } from '../lib/asyncHandler';
import { prepareCase, finishCase, type PreparedCase } from '../pipeline/runCase';
import { mlPredictBatch } from '../ml/client';
import { markRecovered, markExpired } from '../domain/recovery';
import { generateSyntheticCases, generateSpikeBurst } from '../seed/dataset';
import { normalizeAtRiskInput } from '../ingestion/normalize';
import { assignArm } from '../ingestion/ingest';
import { classifyReason } from '../domain/reasons';
import { chainHash, rowContent, GENESIS } from '../domain/audit';
import type { NormalizedEvent } from '../ingestion/normalize';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { tick } from '../worker/tick';
import { detectFailureSpikes } from '../domain/incidents';
import { formatINR } from '../lib/money';
import { logger } from '../lib/logger';
import { toMessage } from '../lib/errors';
import { mapLimit } from '../lib/concurrency';

// Bounded parallelism for the pipeline fan-out in /process and /tick. The DB is often in another region
// (e.g. Supabase in Mumbai while the app runs in UAE North), so throughput is round-trip-bound; running
// cases concurrently overlaps those round-trips. Kept at/under the Prisma pool size (see lib/prisma.ts)
// so workers don't starve on connections, and modest enough not to swamp the single ML replica.
// Kept safely below the Prisma pool (see lib/prisma.ts) so the fan-out never starves concurrent
// health/status polls of a connection — the source of occasional pool-timeout case failures.
const PROCESS_CONCURRENCY = 10;

/** Upsert the (few, shared) merchants and return a name→id map so bulk ingest needs no per-row lookup. */
async function ensureMerchants(names: Array<string | undefined>): Promise<Map<string, string>> {
  const distinct = [...new Set(names.map((n) => n?.trim() || 'Demo Merchant'))];
  await Promise.all(distinct.map((name) => prisma.merchant.upsert({ where: { name }, create: { name }, update: {} })));
  const rows = await prisma.merchant.findMany({ where: { name: { in: distinct } }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.name, r.id]));
}

export const demoRouter = Router();

/**
 * Bulk ingest a synthetic batch (seed / spike). Instead of ~10 round-trips per case (the per-row live
 * ingestion path), this generates ids client-side, builds every row in memory, and writes the whole
 * batch with four createMany calls — turning a cross-region, latency-bound loop into a handful of round
 * trips. It reproduces the live path's end state exactly: the same Event/Customer/Case rows, and each
 * case's two-row audit chain (ingested → normalized) hashed with the SAME functions the live path uses,
 * so tamper-evidence verification still passes. Idempotent: events whose dedupeKey already exists are
 * skipped (so a replay is a no-op), matching the live path's dedupe.
 */
async function bulkIngest(events: NormalizedEvent[]): Promise<{ total: number; created: number; deduped: number }> {
  if (events.length === 0) return { total: 0, created: 0, deduped: 0 };

  // Skip anything already ingested — one round-trip.
  const existing = await prisma.event.findMany({ where: { dedupeKey: { in: events.map((e) => e.dedupeKey) } }, select: { dedupeKey: true } });
  const seen = new Set(existing.map((e) => e.dedupeKey));
  const fresh = events.filter((e) => !seen.has(e.dedupeKey));
  const deduped = events.length - fresh.length;
  if (fresh.length === 0) return { total: events.length, created: 0, deduped };

  const merchantIds = await ensureMerchants(fresh.map((e) => e.merchantName));

  const customers: Prisma.CustomerCreateManyInput[] = [];
  const eventRows: Prisma.EventCreateManyInput[] = [];
  const caseRows: Prisma.CaseCreateManyInput[] = [];
  const auditRows: Prisma.AuditLogCreateManyInput[] = [];
  const custIdByKey = new Map<string, string>(); // intra-batch customer dedupe (externalId/email), as the live path does
  const auditBase = Date.now();

  fresh.forEach((n, i) => {
    const merchantName = n.merchantName?.trim() || 'Demo Merchant';
    const merchantId = merchantIds.get(merchantName)!;

    const c = n.customer;
    let customerId: string | null = null;
    if (c && (c.externalId || c.email || c.phone || c.name)) {
      const key = c.externalId ? `x:${merchantId}:${c.externalId}` : c.email ? `e:${merchantId}:${c.email}` : null;
      const reuse = key ? custIdByKey.get(key) : undefined;
      if (reuse) {
        customerId = reuse;
      } else {
        customerId = randomUUID();
        if (key) custIdByKey.set(key, customerId);
        customers.push({
          id: customerId,
          merchantId,
          externalId: c.externalId,
          name: c.name,
          email: c.email,
          phone: c.phone,
          optedOut: c.optedOut ?? false,
          priorPayments: c.priorPayments ?? 0,
          priorConversions: c.priorConversions ?? 0,
        });
      }
    }

    const reasonTag = classifyReason({ failureReason: n.failureReason, failureCode: n.failureCode, method: n.method, eventType: n.eventType });
    const eventId = randomUUID();
    const caseId = randomUUID();

    eventRows.push({
      id: eventId,
      merchantId,
      customerId,
      eventType: n.eventType,
      externalOrderId: n.externalOrderId,
      externalPaymentId: n.externalPaymentId,
      amount: n.amountPaise,
      currency: n.currency,
      method: n.method,
      failureReason: n.failureReason,
      failureCode: n.failureCode,
      channel: n.channel,
      retryCount: n.retryCount,
      dedupeKey: n.dedupeKey,
      raw: n.raw as Prisma.InputJsonValue,
      ...(n.occurredAt ? { createdAt: n.occurredAt } : {}),
    });

    caseRows.push({
      id: caseId,
      eventId,
      merchantId,
      customerId,
      amount: n.amountPaise,
      currency: n.currency,
      reasonTag,
      arm: assignArm(n.dedupeKey),
      state: 'at_risk',
      ...(n.occurredAt ? { createdAt: n.occurredAt } : {}),
    });

    // Two-row audit chain, identical to ingestEvent + transition(new→at_risk). Both rows are stamped
    // just before the seed instant — and thus before every later pipeline row's DB-clock createdAt —
    // with ingested < normalized, so per-case verifyCaseChain (orders by createdAt, then id) walks them
    // in logical order regardless of app/DB clock skew or batch size.
    const ing = { step: 'ingested', actor: 'system', beforeState: null, afterState: 'new', details: { source: n.source, dedupeKey: n.dedupeKey, reasonTag } };
    const h1 = chainHash(GENESIS, rowContent(ing));
    const norm = { step: 'normalized', actor: 'system', beforeState: 'new', afterState: 'at_risk', details: { reasonTag, amount: n.amountPaise } };
    const h2 = chainHash(h1, rowContent(norm));
    auditRows.push({ id: randomUUID(), caseId, step: 'ingested', actor: 'system', beforeState: null, afterState: 'new', details: ing.details as Prisma.InputJsonValue, prevHash: GENESIS, hash: h1, createdAt: new Date(auditBase - 2) });
    auditRows.push({ id: randomUUID(), caseId, step: 'normalized', actor: 'system', beforeState: 'new', afterState: 'at_risk', details: norm.details as Prisma.InputJsonValue, prevHash: h1, hash: h2, createdAt: new Date(auditBase - 1) });
  });

  // Four bulk writes, FK order: customers → events → cases → audit.
  if (customers.length) await prisma.customer.createMany({ data: customers });
  await prisma.event.createMany({ data: eventRows });
  await prisma.case.createMany({ data: caseRows });
  await prisma.auditLog.createMany({ data: auditRows });

  return { total: events.length, created: fresh.length, deduped };
}

async function seedDemo(count: number) {
  const events = generateSyntheticCases(count).map((row) => normalizeAtRiskInput(row, 'demo'));
  return bulkIngest(events);
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
    const now = new Date();
    const atRisk = await prisma.case.findMany({
      where: { state: 'at_risk' },
      select: { id: true },
      orderBy: [{ riskScore: 'desc' }],
      take: limit,
    });

    // Phase 1 — score + analyze every case in parallel. Control cases finish here; treatment cases
    // return "ready" carrying their ML features.
    let processed = 0;
    let failed = 0;
    const ready: PreparedCase[] = [];
    const prepped = await mapLimit(atRisk, PROCESS_CONCURRENCY, async (c) => {
      try {
        return await prepareCase(c.id, now);
      } catch (e) {
        logger.error('process.prepare_failed', { caseId: c.id, error: toMessage(e) });
        return null;
      }
    });
    for (const p of prepped) {
      if (p === null) failed++;
      else if ('done' in p) processed++;
      else ready.push(p.ready);
    }

    // Phase 2 — score ALL ready cases in ONE batched round-trip, instead of a serial ML call per case.
    // This is the win: the single ML replica amortizes its per-request overhead across the whole set.
    const tBatch = Date.now();
    const predictions = await mlPredictBatch(ready.map((r) => r.features));
    // Each case's inference cost is its share of the batch call — the honest per-decision latency of
    // batched scoring (the model-health panel reports it; timing only the injection would read ~0ms).
    const perCaseMlMs = ready.length ? Math.round((Date.now() - tBatch) / ready.length) : 0;

    // Phase 3 — deterministic policy + execute per case, in parallel.
    const finals = await mapLimit(ready, PROCESS_CONCURRENCY, async (prep, i) => {
      try {
        await finishCase(prep, predictions[i] ?? null, now, perCaseMlMs);
        return true;
      } catch (e) {
        logger.error('process.finish_failed', { caseId: prep.caseId, error: toMessage(e) });
        return false;
      }
    });
    processed += finals.filter(Boolean).length;
    failed += finals.length - finals.filter(Boolean).length;

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
    const { created, deduped } = await bulkIngest(events);
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
