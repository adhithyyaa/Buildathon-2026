import { Router } from 'express';
import { ah } from '../lib/asyncHandler';
import { AtRiskInputSchema, normalizeAtRiskInput } from '../ingestion/normalize';
import { ingestEvent } from '../ingestion/ingest';

export const eventsRouter = Router();

/**
 * POST /api/events/ingest
 * Body: a single AtRiskInput, or { events: AtRiskInput[] }.
 * Idempotent (dedupe on dedupeKey). This is the demo panel + CSV entry point.
 */
eventsRouter.post(
  '/ingest',
  ah(async (req, res) => {
    const body = req.body ?? {};
    const rows: unknown[] = Array.isArray(body.events) ? body.events : [body];

    const results = [];
    for (const row of rows) {
      const parsed = AtRiskInputSchema.safeParse(row);
      if (!parsed.success) {
        results.push({ ok: false, error: parsed.error.flatten() });
        continue;
      }
      const normalized = normalizeAtRiskInput(parsed.data, 'demo');
      const r = await ingestEvent(normalized);
      results.push({ ok: true, ...r });
    }

    res.json({ count: results.length, results });
  }),
);
