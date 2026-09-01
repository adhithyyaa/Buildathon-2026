import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../env';
import { logger } from './logger';

let warned = false;

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Guard operator / destructive endpoints (pause, reset, dispatch, approve, run…). Reads a bearer
 * token from `Authorization: Bearer <t>` or `x-overwatch-token`, compared in constant time to
 * OVERWATCH_ADMIN_TOKEN. If the token is unset the endpoints are OPEN (zero-config local demo) — with
 * a one-time warning — so the mechanism is present and enforced the moment a token is configured.
 * (The Razorpay webhook has its own HMAC auth and must NOT sit behind this.)
 */
export function requireToken(req: Request, res: Response, next: NextFunction): void {
  const expected = env.OVERWATCH_ADMIN_TOKEN;
  if (!expected) {
    // Fail OPEN in local dev, or when a deployment explicitly opts in (a public, test-data demo where
    // judges click the controls). Otherwise an unset token means the operator endpoints are LOCKED —
    // refusing is the safe default in prod/staging.
    const demoOpen = env.OPEN_OPERATOR_ENDPOINTS === 'true';
    if (env.NODE_ENV !== 'development' && !demoOpen) {
      res.status(503).json({ error: 'operator_auth_unconfigured', message: 'set OVERWATCH_ADMIN_TOKEN to enable operator endpoints' });
      return;
    }
    if (!warned) {
      logger.warn('auth.disabled', { note: 'OVERWATCH_ADMIN_TOKEN unset — operator endpoints are open (development only)' });
      warned = true;
    }
    return next();
  }
  const header = req.header('authorization') ?? '';
  const provided = header.replace(/^Bearer\s+/i, '') || req.header('x-overwatch-token') || '';
  if (provided && tokenMatches(provided, expected)) return next();
  res.status(401).json({ error: 'unauthorized' });
}
