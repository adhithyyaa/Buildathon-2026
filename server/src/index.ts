import { createApp } from './app';
import { env } from './env';
import { ensureAuditAppendOnly } from './domain/audit';
import { tick } from './worker/tick';
import { toMessage } from './lib/errors';
import { logger } from './lib/logger';

const app = createApp();

/**
 * Optionally run the retry/expiry scheduler in-process (RUN_WORKER=true). The hosted deployment runs a
 * single always-on API container and no separate worker, so without this retries/expiries would only
 * advance on a manual tick; this restores the automatic progression the local setup has. tick() claims
 * a single-flight DB lease, so this is safe even if more than one replica has it enabled.
 */
function startInProcessWorker(): void {
  const INTERVAL_MS = 15_000;
  const loop = async () => {
    try {
      await tick();
    } catch (e) {
      logger.warn('worker.error', { error: toMessage(e) });
    }
  };
  setInterval(() => void loop(), INTERVAL_MS);
  logger.info('in-process retry/expiry worker started', { intervalMs: INTERVAL_MS });
}

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[overwatch] API listening on http://localhost:${env.PORT}  (${env.NODE_ENV})`);
  // Enforce the append-only guard on the audit ledger at the database level (idempotent). Best-effort:
  // if it can't be installed (e.g. restricted role), the hash chain still makes tampering evident.
  ensureAuditAppendOnly()
    .then(() => logger.info('audit ledger: append-only trigger enforced'))
    .catch((e) => logger.warn(`audit ledger: could not install append-only trigger (${e?.message ?? e})`));

  if (env.RUN_WORKER === 'true') startInProcessWorker();
});
