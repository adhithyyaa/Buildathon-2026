import { Router } from 'express';
import { ah } from '../lib/asyncHandler';
import { computeMetrics } from '../domain/metrics';

export const metricsRouter = Router();

/** GET /api/metrics?merchantId= — batch recovery metrics for the dashboard. */
metricsRouter.get(
  '/',
  ah(async (req, res) => {
    const metrics = await computeMetrics(req.query.merchantId as string | undefined);
    res.json(metrics);
  }),
);
