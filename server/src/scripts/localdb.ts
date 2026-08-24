/**
 * Docker-free local Postgres for development / verification, powered by
 * embedded-postgres (a real PostgreSQL server from a downloaded binary).
 * Run with: npx tsx src/scripts/localdb.ts   (keeps running; Ctrl-C to stop)
 *
 * Matches server/.env DATABASE_URL: postgresql://recoup:recoup@localhost:5432/recoup
 */
import fs from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const dataDir = path.resolve(__dirname, '../../.pgdata');

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'recoup',
    password: 'recoup',
    port: 5432,
    persistent: true,
    // Force UTF8 so we can store ₹ and other Unicode (Windows initdb defaults to WIN1252).
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  });

  const alreadyInit = fs.existsSync(path.join(dataDir, 'PG_VERSION'));
  if (!alreadyInit) {
    console.log('[localdb] initialising data dir...');
    await pg.initialise();
  }

  console.log('[localdb] starting postgres...');
  await pg.start();

  try {
    await pg.createDatabase('recoup');
  } catch {
    // database already exists — fine
  }

  console.log('EMBEDDED_PG: up on localhost:5432 db=recoup');

  const shutdown = async () => {
    console.log('[localdb] stopping...');
    try {
      await pg.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('EMBEDDED_PG_ERROR', err);
  process.exit(1);
});
