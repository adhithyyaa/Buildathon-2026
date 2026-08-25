import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import { env, hasRazorpay, hasAI, aiProvider } from './env';
import { logger } from './lib/logger';
import { toMessage } from './lib/errors';
import { mlHealth } from './ml/client';
import { webhookRouter } from './routes/webhooks';
import { casesRouter } from './routes/cases';
import { eventsRouter } from './routes/events';
import { metricsRouter } from './routes/metrics';
import { demoRouter } from './routes/demo';
import { aiRouter } from './routes/ai';
import { mlRouter } from './routes/ml';
import { adminRouter } from './routes/admin';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));

  // The Razorpay webhook needs the RAW body to verify its HMAC signature, so it
  // is mounted BEFORE the global JSON parser.
  app.use('/api/webhooks', webhookRouter);

  app.use(express.json({ limit: '1mb' }));

  app.get('/health', async (_req, res) => {
    const ml = await mlHealth();
    res.json({
      ok: true,
      service: 'recoup-server',
      env: env.NODE_ENV,
      integrations: { razorpay: hasRazorpay, ai: hasAI, aiProvider, ml: ml.ok, mlVersion: ml.version },
      ts: new Date().toISOString(),
    });
  });

  app.get('/', (_req, res) => {
    res.json({ name: 'Recoup', tagline: 'Bounded AI revenue recovery for Razorpay', health: '/health' });
  });

  app.use('/api/cases', casesRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/metrics', metricsRouter);
  app.use('/api/demo', demoRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/ml', mlRouter);
  app.use('/api/admin', adminRouter);

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    const message = toMessage(err);
    logger.error('unhandled_error', { message });
    res.status(500).json({ error: 'internal_error', message });
  };
  app.use(errorHandler);

  return app;
}
