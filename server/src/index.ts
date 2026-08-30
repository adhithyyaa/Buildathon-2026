import { createApp } from './app';
import { env } from './env';
import { ensureAuditAppendOnly } from './domain/audit';
import { logger } from './lib/logger';

const app = createApp();

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[sentinel] API listening on http://localhost:${env.PORT}  (${env.NODE_ENV})`);
  // Enforce the append-only guard on the audit ledger at the database level (idempotent). Best-effort:
  // if it can't be installed (e.g. restricted role), the hash chain still makes tampering evident.
  ensureAuditAppendOnly()
    .then(() => logger.info('audit ledger: append-only trigger enforced'))
    .catch((e) => logger.warn(`audit ledger: could not install append-only trigger (${e?.message ?? e})`));
});
