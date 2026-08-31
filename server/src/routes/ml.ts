import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { ah } from '../lib/asyncHandler';
import { mlMetrics, mlHealth } from '../ml/client';
import { computeModelHealth } from '../domain/modelHealth';

export const mlRouter = Router();

// Git-tracked training artifacts. Resolved relative to the launch cwd — `server/` in dev, `/app` in the
// container (where the image bundles them at `/ml`, so `../ml/*.json` resolves either way).
const METRICS_CANDIDATES = ['../ml/metrics.json', 'ml/metrics.json', '../../ml/metrics.json'];
const UPLIFT_CANDIDATES = ['../ml/uplift.json', 'ml/uplift.json', '../../ml/uplift.json'];
const EXPLORE_CANDIDATES = ['../ml/explore.json', 'ml/explore.json', '../../ml/explore.json'];
const CONFORMAL_CANDIDATES = ['../ml/conformal.json', 'ml/conformal.json', '../../ml/conformal.json'];
const RCT_CANDIDATES = ['../ml/rct_validation.json', 'ml/rct_validation.json', '../../ml/rct_validation.json'];

async function readFirst(candidates: string[]): Promise<unknown | null> {
  for (const rel of candidates) {
    try {
      return JSON.parse(await readFile(path.resolve(process.cwd(), rel), 'utf8')) as unknown;
    } catch {
      /* try the next candidate path */
    }
  }
  return null;
}

/**
 * GET /api/ml/metrics — the training/validation report (model comparison, calibration, features).
 * Prefers the live ML service, then falls back to the bundled `ml/metrics.json` (identical payload —
 * the service loads that same file) so the Model page works even without the Python service deployed.
 */
mlRouter.get(
  '/metrics',
  ah(async (_req, res) => {
    const m = (await mlMetrics()) ?? (await readFirst(METRICS_CANDIDATES));
    if (!m) return void res.status(503).json({ error: 'ml_unavailable' });
    res.json(m);
  }),
);

/** GET /api/ml/uplift — the causal uplift report (Qini, ECE, per-action uplift, policy-value, DR-OPE). */
mlRouter.get(
  '/uplift',
  ah(async (_req, res) => {
    const report = await readFirst(UPLIFT_CANDIDATES);
    if (!report) return void res.status(404).json({ error: 'uplift_report_unavailable' });
    res.json(report);
  }),
);

/** GET /api/ml/explore — the online contextual Thompson-sampling exploration report. */
mlRouter.get(
  '/explore',
  ah(async (_req, res) => {
    const report = await readFirst(EXPLORE_CANDIDATES);
    if (!report) return void res.status(404).json({ error: 'explore_report_unavailable' });
    res.json(report);
  }),
);

/** GET /api/ml/conformal — split-conformal per-case certainty (coverage guarantee). */
mlRouter.get(
  '/conformal',
  ah(async (_req, res) => {
    const report = await readFirst(CONFORMAL_CANDIDATES);
    if (!report) return void res.status(404).json({ error: 'conformal_report_unavailable' });
    res.json(report);
  }),
);

/** GET /api/ml/rct — external validity: uplift + DR-OPE recovered on a real public RCT. */
mlRouter.get(
  '/rct',
  ah(async (_req, res) => {
    const report = await readFirst(RCT_CANDIDATES);
    if (!report) return void res.status(404).json({ error: 'rct_report_unavailable' });
    res.json(report);
  }),
);

/** GET /api/ml/monitor — production model-health: per-feature PSI drift, score distribution, latency. */
mlRouter.get(
  '/monitor',
  ah(async (_req, res) => {
    res.json(await computeModelHealth());
  }),
);

/** GET /api/ml/health — is the ML service up, and which model version. */
mlRouter.get(
  '/health',
  ah(async (_req, res) => {
    res.json(await mlHealth());
  }),
);
