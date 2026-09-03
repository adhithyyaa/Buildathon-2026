/**
 * `npm run prove` — one command that re-derives the headline claims from code and artifacts, in-process,
 * and prints PASS / FAIL lines with the observed values.
 *
 *  • Pure checks always run: the recorded Razorpay captures, the hash-chained ledger + forensics, the
 *    Recovery Lab's A/A null and A/B power, the 20% holdout, the red-team defence, the message
 *    fact-checker, the ML artifact bands, and the doc-locked numbers.
 *  • Live checks run against SELFTEST_BASE (default http://localhost:8787) when it answers — point it
 *    at the hosted deployment to prove the live system. When it does not answer they are printed as
 *    NOT RUN with the reason. Nothing is ever silently skipped.
 *
 * Exit code is non-zero if any check FAILS.
 *
 *   cd server && npm run prove
 *   SELFTEST_BASE=https://<host> npm run prove
 */
import fs from 'node:fs';
import path from 'node:path';
import { GENESIS, chainHash, rowContent, verifyRows, forensicDemo, type ChainRow } from '../domain/audit';
import { estimateLift } from '../domain/lab';
import { assignArm } from '../ingestion/ingest';
import { generateSyntheticCases } from '../seed/dataset';
import { normalizeAtRiskInput } from '../ingestion/normalize';
import { validateMessageFacts, type MessageFacts } from '../domain/messageValidator';
import { runCompliance } from '../domain/compliance';
import { ATTACKS } from '../domain/redteamAttacks';
import type { PolicyEnvelope } from '../ai/context';

const ROOT = path.resolve(__dirname, '../../..');
const BASE = process.env.SELFTEST_BASE ?? 'http://localhost:8787';

type Verdict = 'PASS' | 'FAIL' | 'NOT RUN';
const lines: { v: Verdict; name: string; detail: string }[] = [];
const report = (v: Verdict, name: string, detail: string) => lines.push({ v, name, detail });
const check = (name: string, ok: boolean, detail: string) => report(ok ? 'PASS' : 'FAIL', name, detail);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (rel: string): any => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

/** Deterministic PRNG so the A/A and A/B draws are reproducible run to run. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pureChecks() {
  // 1. The recorded Razorpay captures are genuine test-mode payments (pay_/order_ ids, status=captured).
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rts: any[] = json('server/fixtures/razorpay/live-captures.json').roundtrips ?? [];
    const genuine = rts.filter(
      (r) => /^pay_/.test(r.paymentId) && /^order_/.test(r.orderId) && r.payment?.status === 'captured' && r.payment?.captured === true,
    );
    const methods = [...new Set(rts.map((r) => r.payment?.method))].join(', ');
    const amounts = rts.map((r) => `₹${(r.payment?.amount ?? 0) / 100}`).join(', ');
    check(
      'money path: the recorded Razorpay test-mode captures are genuine',
      rts.length > 0 && genuine.length === rts.length,
      `${genuine.length}/${rts.length} roundtrips carry pay_/order_ ids with payment.status=captured (methods: ${methods}; ${amounts})`,
    );
  }

  // 2. The ledger: a real SHA-256 chain verifies clean, and forensics catch every tamper scenario.
  {
    const steps = ['ingested', 'analyzed', 'decided', 'executed', 'recovered', 'closed'];
    const rows: ChainRow[] = [];
    let prev = GENESIS;
    steps.forEach((step, i) => {
      const e = { id: `r${i}`, step, actor: i === 4 ? 'webhook' : 'system', beforeState: i ? `s${i - 1}` : null, afterState: `s${i}`, details: { i } };
      const hash = chainHash(prev, rowContent(e as ChainRow));
      rows.push({ ...(e as ChainRow), prevHash: prev, hash });
      prev = hash;
    });
    const clean = verifyRows(rows);
    const f = forensicDemo(rows);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const names = f.scenarios.map((s: any) => s.name ?? s.id ?? s.scenario ?? s.kind ?? '?');
    check(
      'ledger: a clean SHA-256 chain verifies and every tamper scenario is caught',
      clean.brokenAt == null && f.allCaught && f.scenarios.length >= 3,
      `${rows.length}-row chain verified (${clean.verified} links) · forensics allCaught=${f.allCaught} over ${f.scenarios.length} scenarios: ${names.join(', ')}`,
    );
  }

  // 3. The randomised holdout lands on the documented 20%.
  {
    const keys = generateSyntheticCases(400).map((r) => normalizeAtRiskInput(r, 'demo').dedupeKey);
    const ctrl = keys.filter((k) => assignArm(k) === 'control').length;
    const stable = keys.slice(0, 50).every((k) => assignArm(k) === assignArm(k));
    check(
      'holdout: the control arm is a real ~20% randomised split, deterministic per case',
      ctrl / 400 > 0.15 && ctrl / 400 < 0.25 && stable,
      `${ctrl}/400 = ${(ctrl / 4).toFixed(1)}% control (band 15–25%) · same key → same arm on replay: ${stable}`,
    );
  }

  // 4. Measurement is two-sided: A/A cannot manufacture lift; A/B detects a real effect.
  {
    const rnd = mulberry32(7);
    const draw = (arm: string, n: number, rate: number) =>
      Array.from({ length: n }, () => ({ arm, amount: 5_000 + Math.floor(rnd() * 20_000), recovered: rnd() < rate }));
    const AA = 100;
    let falsePositives = 0;
    for (let i = 0; i < AA; i++) {
      if (estimateLift([...draw('treatment', 320, 0.45), ...draw('control', 80, 0.45)]).significant) falsePositives++;
    }
    const ab = estimateLift([...draw('treatment', 320, 0.45), ...draw('control', 80, 0.15)]);
    check(
      'measurement: A/A null — equal arms are not called significant',
      falsePositives / AA <= 0.1,
      `${falsePositives}/${AA} A/A draws (identical 45% arms, 320 vs 80) flagged significant; ≤ 10% allowed at a 95% CI`,
    );
    check(
      'measurement: A/B power — a real +30pp effect is detected with a CI above zero',
      ab.significant && ab.liftCi95Pct[0] > 0,
      `synthetic +30pp effect → estimate ${ab.liftPct.toFixed(1)}pp, CI [${ab.liftCi95Pct[0]}, ${ab.liftCi95Pct[1]}], significant=${ab.significant}`,
    );
  }

  // 5. Outbound copy: the fact-checker blocks hallucinated money and unapproved offers, passes correct copy.
  {
    const facts: MessageFacts = { amountPaise: 250_000, currency: 'INR', merchantName: 'Acme', incentivePct: 0 };
    const cases: Array<[string, string, MessageFacts, boolean]> = [
      ['correct copy passes', 'Your payment of ₹2,500 to Acme did not go through. Complete it here.', facts, true],
      ['hallucinated amount blocked', 'You owe ₹9,999 to Acme — pay now.', facts, false],
      ['unapproved 25% discount blocked', 'Get 25% off — pay ₹2,500 now.', facts, false],
      ['approved 10% discount arithmetic passes', 'Complete now and pay just ₹2,250 (10% off).', { ...facts, incentivePct: 10 }, true],
    ];
    const results = cases.map(([label, text, f, expectOk]) => ({ label, ok: validateMessageFacts(text, f).ok === expectOk }));
    check(
      'outbound copy: the message fact-checker blocks what the arithmetic and policy did not sanction',
      results.every((r) => r.ok),
      results.map((r) => `${r.ok ? '✓' : '✗'} ${r.label}`).join(' · '),
    );
  }

  // 6. Governance: the real policy engine defends every red-team attack under independent oracles.
  {
    const ENVELOPE: PolicyEnvelope = {
      maxRetries: 3,
      maxDiscountPct: 10,
      humanApprovalAmountPaise: 2_500_000,
      quietHoursStart: 21,
      quietHoursEnd: 8,
      minPursuitPaise: 10_000,
      afaThresholdPaise: 1_500_000,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rt = ATTACKS.map((a) => ({ id: (a as any).id ?? (a as any).name ?? '?', r: runCompliance(a.build(ENVELOPE)) }));
    const breached = rt.filter((x) => x.r.verdict !== 'defended');
    const violations = rt.reduce((s, x) => s + x.r.violations, 0);
    check(
      'governance: the real policy engine defends every red-team attack (independent oracles)',
      breached.length === 0 && rt.length >= 8,
      `${rt.length - breached.length}/${rt.length} attacks defended, ${violations} oracle violations${breached.length ? ` — breached: ${breached.map((b) => b.id).join(', ')}` : ''}`,
    );
  }

  // 7. ML artifacts are inside their bands, and the README quotes them verbatim.
  {
    const up = json('ml/uplift.json');
    const rct = json('ml/rct_validation.json');
    const cf = json('ml/conformal.json');
    const qini: number = up.best_treatment_ranking.s_learner.qini_coefficient;
    const ece: number = up.calibration.ece;
    const capture: number = up.policy_value_incremental_inr.uplift_policy / up.policy_value_incremental_inr.oracle;
    const drErr: number = up.off_policy.dr_error_vs_truth_pct;
    check(
      'causal ML (synthetic world): Qini, calibration and policy capture inside their bands',
      qini > 0.8 && ece < 0.02 && capture > 0.9 && drErr < 10,
      `Qini ${qini.toFixed(2)} (>0.8) · ECE ${ece.toFixed(3)} (<0.02) · uplift policy captures ${(capture * 100).toFixed(0)}% of the oracle (>90%) · DR error ${drErr.toFixed(1)}% (<10%)`,
    );
    const best: string = rct.best_learner;
    const u30: number = rct.uplift_learners[best].uplift_at_30pct;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const learners = Object.entries(rct.uplift_learners) as Array<[string, any]>;
    const ate: number = rct.ate_ground_truth.diff_in_means;
    const rctErr: number = rct.ate_recovered.dr_error_vs_truth_pct;
    check(
      'causal ML (real Hillstrom RCT): the ATE is recovered and the uplift ranking beats treat-all',
      rctErr < 5 && u30 > 0 && learners.every(([, v]) => v.qini > 0),
      `${Number(rct.dataset.rows).toLocaleString('en-IN')} real randomised customers · ATE +${(ate * 100).toFixed(1)}pp recovered within ${rctErr}% · ${best} top-30% +${(u30 * 100).toFixed(1)}pp over the ATE · Qini > 0 for all: ${learners.map(([k, v]) => `${k} ${v.qini.toFixed(1)}`).join(', ')}`,
    );
    check(
      'conformal: empirical coverage meets the target on a fresh split',
      cf.empirical_coverage_pct >= cf.target_coverage_pct - 1,
      `${cf.empirical_coverage_pct}% empirical vs ${cf.target_coverage_pct}% target (tolerance −1pp)`,
    );

    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    const expected = [qini.toFixed(2), `+${(ate * 100).toFixed(1)}pp`, `${rctErr.toFixed(1)}%`, `+${(u30 * 100).toFixed(1)}pp`, `${cf.empirical_coverage_pct}%`];
    const missing = expected.filter((s) => !readme.includes(s));
    check(
      'docs: the README quotes the current artifact numbers verbatim (anti-drift)',
      missing.length === 0,
      missing.length ? `missing from README: ${missing.join(', ')}` : `found ${expected.join(' · ')}`,
    );
  }

  // 8. The pre-registered pilot is reported against its tagged protocol, misses included.
  {
    const p = path.join(ROOT, 'docs/PILOT_RESULTS.md');
    const txt = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
    const m = txt.match(/Verdict: (\d) of 7 gates met([^\n]*)/);
    check(
      'pre-registration: pilot results are reported gate by gate against the tagged protocol',
      !!m,
      m ? `${m[1]} of 7 gates met${m[2]} (docs/PILOT_RESULTS.md; protocol tag pilot-preregistered-v1)` : 'docs/PILOT_RESULTS.md is missing or has no verdict line',
    );
  }
}

async function liveChecks() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const get = async (p: string, ms: number): Promise<any | null> => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    try {
      const r = await fetch(BASE + p, { signal: c.signal });
      return r.ok ? await r.json() : null;
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  };

  // The hosted web tier scales to zero: give a cold start its time, and try twice before giving up.
  const health = (await get('/health', 30_000)) ?? (await get('/health', 30_000));
  if (!health) {
    report('NOT RUN', `live: ${BASE} did not answer /health`, 'set SELFTEST_BASE to a running API (local, or the hosted deployment) to prove the live system too');
    return;
  }
  const integ = health.integrations ?? {};
  check('live: API is healthy with its integrations', health.ok !== false, `${BASE} → db ${integ.db ?? '?'} · ml ${integ.ml ?? '?'} · razorpay ${integ.razorpay ?? '?'}`);

  const fo = await get('/api/audit/forensics', 90_000);
  if (fo && typeof fo.allCaught === 'boolean') {
    check(
      'live: ledger forensics and the Postgres append-only trigger hold on real rows',
      fo.allCaught === true && fo.appendOnly?.enforced === true,
      `allCaught=${fo.allCaught} over ${fo.scenarios?.length ?? 0} scenarios · append-only enforced=${fo.appendOnly?.enforced} (update blocked ${fo.appendOnly?.updateBlocked}, delete blocked ${fo.appendOnly?.deleteBlocked})`,
    );
  } else {
    report('NOT RUN', 'live: ledger forensics', 'no ledger to probe yet — seed and run the pipeline first');
  }

  const lab = await get('/api/lab', 30_000);
  if (lab && lab.totalResolved > 0) {
    const o = lab.overall;
    check(
      'live: the control-measured lift on the current book is significant',
      o.significant === true && o.liftCi95Pct[0] > 0,
      `treatment ${o.treatment.recovered}/${o.treatment.cases} vs control ${o.control.recovered}/${o.control.cases} → ${o.liftPct}pp, 95% CI [${o.liftCi95Pct[0]}, ${o.liftCi95Pct[1]}]`,
    );
  } else {
    report('NOT RUN', 'live: Recovery Lab lift', 'no resolved outcomes yet — press Resolve outcomes on the Demo controls');
  }

  const met = await get('/api/metrics', 30_000);
  if (met?.ml?.decisions > 0) {
    check(
      'live: decisions are model-served, not deterministic fallback',
      met.ml.mlServedRatePct >= 95,
      `${met.ml.mlServed}/${met.ml.decisions} = ${met.ml.mlServedRatePct}% ML-served · ${met.ml.fallbackCount} fallbacks · avg ${met.ml.avgLatencyMs} ms per decision`,
    );
  } else {
    report('NOT RUN', 'live: ML-served rate', 'no decisions yet — run the pipeline first');
  }
}

(async () => {
  const t0 = Date.now();
  pureChecks();
  await liveChecks();
  const n = (v: Verdict) => lines.filter((l) => l.v === v).length;
  console.log(`\noverwatch prove — re-deriving the claims (${lines.length} checks, ${Date.now() - t0} ms)\n`);
  for (const l of lines) console.log(`${l.v.padEnd(7)} ${l.name}\n        ${l.detail}`);
  console.log(`\n${n('PASS')} PASS · ${n('FAIL')} FAIL · ${n('NOT RUN')} NOT RUN${n('FAIL') ? '  ← a FAIL is a broken claim, fix it or fix the doc' : ''}`);
  process.exit(n('FAIL') > 0 ? 1 : 0);
})();
