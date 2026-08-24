import { tick } from './tick';
import { logger } from '../lib/logger';

/** Standalone retry/expiry worker. Run with `npm run worker`. */
const INTERVAL_MS = 15_000;

async function loop() {
  try {
    await tick();
  } catch (err) {
    logger.error('worker.error', { message: err instanceof Error ? err.message : String(err) });
  }
}

logger.info('worker.start', { intervalMs: INTERVAL_MS });
void loop();
setInterval(() => void loop(), INTERVAL_MS);
