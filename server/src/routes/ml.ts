import { Router } from 'express';
import { ah } from '../lib/asyncHandler';
import { mlMetrics, mlHealth } from '../ml/client';

export const mlRouter = Router();

/** GET /api/ml/metrics — the training/validation report (model comparison, calibration, features). */
mlRouter.get(
  '/metrics',
  ah(async (_req, res) => {
    const m = await mlMetrics();
    if (!m) return void res.status(503).json({ error: 'ml_unavailable' });
    res.json(m);
  }),
);

/** GET /api/ml/health — is the ML service up, and which model version. */
mlRouter.get(
  '/health',
  ah(async (_req, res) => {
    res.json(await mlHealth());
  }),
);
