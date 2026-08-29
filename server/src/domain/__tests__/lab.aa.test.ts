import { describe, it, expect } from 'vitest';
import { estimateLift } from '../lab';

/**
 * A/A null test for the Recovery Lab's incremental-lift estimator — the load-bearing rigor check.
 * The dashboard's headline "incremental ₹ lift" is only trustworthy if the estimator reads ~0 when
 * treatment and control are drawn from the SAME distribution (no real effect). If this fails, no lift
 * number this project reports can be believed. The A/B power test then proves the estimator is not
 * vacuously null — it detects and flags a genuine effect.
 */

/** Deterministic RNG (mulberry32) so the test is fully reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function draw(rand: () => number, arm: string, n: number, rate: number, amount = 100_000) {
  return Array.from({ length: n }, () => ({ arm, amount, recovered: rand() < rate }));
}

describe('Recovery Lab incremental-lift estimator', () => {
  it('A/A null: unbiased (~0 lift, not flagged significant) when both arms are identical', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const lifts: number[] = [];
    let falsePositives = 0;

    for (const s of seeds) {
      const rand = rng(s);
      const rate = 0.4; // treatment == control — there is no effect to find
      const rows = [...draw(rand, 'treatment', 800, rate), ...draw(rand, 'control', 800, rate)];
      const est = estimateLift(rows);
      lifts.push(est.liftPct);
      if (est.significant) falsePositives++;
    }

    const mean = lifts.reduce((a, b) => a + b, 0) / lifts.length;
    expect(Math.abs(mean)).toBeLessThan(1.5); // estimator is unbiased (mean lift ≈ 0 pp)
    expect(Math.max(...lifts.map(Math.abs))).toBeLessThan(6); // no wild per-run swings
    expect(falsePositives / seeds.length).toBeLessThanOrEqual(0.2); // ~nominal 95%-CI false-positive rate
  });

  it('A/B power: detects and flags a genuine treatment effect (not vacuously null)', () => {
    const rand = rng(42);
    const rows = [...draw(rand, 'treatment', 600, 0.55), ...draw(rand, 'control', 600, 0.2)];
    const est = estimateLift(rows);
    expect(est.liftPct).toBeGreaterThan(20); // ~35pp true effect is recovered
    expect(est.significant).toBe(true);
    expect(est.liftCi95Pct[0]).toBeGreaterThan(0); // CI lower bound excludes zero
  });
});
