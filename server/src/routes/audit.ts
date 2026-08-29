import { Router } from 'express';
import { ah } from '../lib/asyncHandler';
import { requireToken } from '../lib/auth';
import { verifyAllChains } from '../domain/audit';

/** Audit-ledger integrity — re-walks every case's SHA-256 hash chain to prove nothing was altered. */
export const auditRouter = Router();

/** GET /api/audit/verify — tamper check over the whole ledger. */
auditRouter.get(
  '/verify',
  requireToken,
  ah(async (_req, res) => {
    res.json(await verifyAllChains());
  }),
);
