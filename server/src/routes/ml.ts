import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { ah } from '../lib/asyncHandler';
import { mlMetrics, mlHealth } from '../ml/client';
import { computeModelHealth } from '../domain/modelHealth';

export const mlRouter = Router();

// The uplift report is a git-tracked training artifact (ml/uplift.json), like ml/metrics.json.
// Resolve it relative to wherever the server was launched (cwd is usually server/).
const UPLIFT_CANDIDATES = ['../ml/uplift.json', 'ml/uplift.json', '../../ml/uplift.json'];

/** GET /api/ml/metrics — the training/validation report (model comparison, calibration, features). */
mlRouter.get(
  '/metrics',
  ah(async (_req, res) => {
    const m = await mlMetrics();
    if (!m) return void res.status(503).json({ error: 'ml_unavailable' });
    res.json(m);
  }),
);

/** GET /api/ml/uplift — the causal uplift report (Qini, ECE, per-action uplift, policy-value comparison). */
mlRouter.get(
  '/uplift',
  ah(async (_req, res) => {
    for (const rel of UPLIFT_CANDIDATES) {
      try {
        const raw = await readFile(path.resolve(process.cwd(), rel), 'utf8');
        return void res.json(JSON.parse(raw));
      } catch {
        /* try the next candidate path */
      }
    }
    res.status(404).json({ error: 'uplift_report_unavailable' });
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
