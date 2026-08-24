import { generateSyntheticCases } from './dataset';
import { normalizeAtRiskInput } from '../ingestion/normalize';
import { ingestEvent } from '../ingestion/ingest';
import { prisma } from '../lib/prisma';

/** CLI seed: `npm run db:seed [count]`. Idempotent (dedupe on seed keys). */
async function main() {
  const count = Number(process.argv[2]) || 120;
  const rows = generateSyntheticCases(count);
  let created = 0;
  let deduped = 0;
  for (const row of rows) {
    const n = normalizeAtRiskInput(row, 'demo');
    const r = await ingestEvent(n);
    r.deduped ? deduped++ : created++;
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ total: rows.length, created, deduped }));
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
