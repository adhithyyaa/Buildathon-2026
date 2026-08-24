/**
 * Boot smoke test: starts the app on an ephemeral port, hits /health, prints, exits.
 * Run with:  npx tsx src/scripts/smoke.ts
 */
import { createApp } from '../app';

const app = createApp();
const server = app.listen(0, async () => {
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  try {
    const res = await fetch(`http://localhost:${port}/health`);
    const body = await res.json();
    console.log('HEALTH', res.status, JSON.stringify(body));
    console.log('SMOKE: PASS');
    server.close(() => process.exit(0));
  } catch (err) {
    console.error('SMOKE: FAIL', err);
    server.close(() => process.exit(1));
  }
});
