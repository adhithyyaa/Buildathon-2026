import express from 'express';
import cors from 'cors';
import { env, hasRazorpay, hasAI } from './env';

/**
 * Builds the Express app. Routers are mounted here as they are implemented.
 *
 * NOTE: the Razorpay webhook route needs the *raw* request body to verify the
 * HMAC signature, so it is mounted with express.raw() BEFORE the global json()
 * parser (done in the webhook router, not here).
 */
export function createApp() {
  const app = express();

  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'recoup-server',
      env: env.NODE_ENV,
      integrations: { razorpay: hasRazorpay, ai: hasAI },
      ts: new Date().toISOString(),
    });
  });

  app.get('/', (_req, res) => {
    res.json({
      name: 'Recoup',
      tagline: 'Bounded AI revenue recovery for Razorpay',
      docs: '/health',
    });
  });

  // Routers mounted here as they land:
  //   app.use('/api/events', eventsRouter);
  //   app.use('/api/cases', casesRouter);
  //   app.use('/api/metrics', metricsRouter);
  //   app.use('/api/webhooks/razorpay', webhookRouter);

  return app;
}
