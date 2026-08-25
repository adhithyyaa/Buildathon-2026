/**
 * End-to-end backend verification against the real DB (no HTTP, no AI key needed).
 * seed -> pipeline (deterministic fallback) -> retry worker -> metrics.
 * Run: npx tsx src/scripts/verify.ts
 */
import { prisma } from '../lib/prisma';
import { generateSyntheticCases } from '../seed/dataset';
import { normalizeAtRiskInput } from '../ingestion/normalize';
import { ingestEvent } from '../ingestion/ingest';
import { runCase } from '../pipeline/runCase';
import { tick } from '../worker/tick';
import { computeMetrics } from '../domain/metrics';
import { formatINR } from '../lib/money';

async function main() {
  if ((await prisma.case.count()) === 0) {
    console.log('seeding 120 synthetic cases...');
    for (const row of generateSyntheticCases(120)) {
      await ingestEvent(normalizeAtRiskInput(row, 'demo'));
    }
  }
  console.log('total cases:', await prisma.case.count());

  const atRisk = await prisma.case.findMany({ where: { state: 'at_risk' }, select: { id: true }, orderBy: { riskScore: 'desc' } });
  console.log('processing at_risk through pipeline:', atRisk.length);
  for (const c of atRisk) await runCase(c.id);

  // Fast-forward the retry worker so smart_retry cases resolve.
  for (let i = 0; i < 8; i++) {
    const r = await tick({ fastForward: true });
    if (r.dueRetries === 0) break;
  }

  const m = await computeMetrics();
  console.log('\n===== METRICS =====');
  console.log('total cases        :', m.totalCases);
  console.log('gross at-risk      :', formatINR(m.grossAtRiskPaise));
  console.log('recovered          :', m.recoveredCount, '/', m.totalCases, '=', m.recoveryRatePct + '%', '=', formatINR(m.recoveredPaise));
  console.log('active / escalated / expired:', m.activeCount, '/', m.escalatedCount, '/', m.expiredCount);
  console.log('blocked actions    :', m.blockedActionCount);
  console.log('by state           :', JSON.stringify(m.byState));
  console.log('by action          :', JSON.stringify(m.byAction));
  console.log('by reason          :', JSON.stringify(m.byReason));
  console.log('ML-served rate     :', m.ml.mlServedRatePct, '% (', m.ml.mlServed, 'model /', m.ml.fallbackCount, 'fallback of', m.ml.decisions, 'decisions )');
  console.log('===================');
}

main()
  .catch((err) => {
    console.error('VERIFY_FAILED', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
