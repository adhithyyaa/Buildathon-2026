import type { Request, Response, NextFunction, RequestHandler } from 'express';

/** Wrap an async route so rejected promises reach Express's error middleware (Express 4). */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
