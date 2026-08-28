import { Router } from 'express';
import { ah } from '../lib/asyncHandler';
import { requireToken } from '../lib/auth';
import { computeLift, computeImpactSeries, resolveOutcomes } from '../domain/lab';

/** Recovery Lab — live incremental-lift measurement (treatment vs a held-out control arm). */
export const labRouter = Router();

/** GET /api/lab — the incremental-lift report (overall + per reason, with 95% CIs). */
labRouter.get('/', ah(async (_req, res) => {
  res.json(await computeLift());
}));

/** GET /api/lab/impact — cumulative recovered-₹ vs the control-measured counterfactual baseline. */
labRouter.get('/impact', ah(async (_req, res) => {
  res.json(await computeImpactSeries());
}));

/** POST /api/lab/resolve — advance the experiment: draw outcomes for pending cases (demo control). */
labRouter.post('/resolve', requireToken, ah(async (_req, res) => {
  res.json(await resolveOutcomes());
}));
