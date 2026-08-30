import { Router } from 'express';
import { ah } from '../lib/asyncHandler';
import { requireToken } from '../lib/auth';
import { verifyAllChains, forensicReport } from '../domain/audit';

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

/** GET /api/audit/forensics — non-destructive demo: attack a real case chain (clones only) and show
 *  the verifier catching and CLASSIFYING each tamper (content-altered vs chain-relinked). Read-only. */
auditRouter.get(
  '/forensics',
  ah(async (_req, res) => {
    res.json(await forensicReport());
  }),
);
