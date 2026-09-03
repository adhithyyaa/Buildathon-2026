import { describe, it, expect } from 'vitest';
import { assignArm } from '../../ingestion/ingest';
import { generateSyntheticCases } from '../../seed/dataset';
import { normalizeAtRiskInput } from '../../ingestion/normalize';

/**
 * Guards the Recovery Lab's control arm. The split is a deterministic hash of each case's dedupe key;
 * a weak hash once realized only ~9% control against a documented 20%, starving the control arm and
 * widening the lift CI. This pins the realized share to the documented holdout on the demo batches.
 */
const keys = (n: number) => generateSyntheticCases(n).map((r) => normalizeAtRiskInput(r, 'demo').dedupeKey);

describe('control-arm split', () => {
  it('lands on the documented 20% holdout (±5pp) for the demo batches', () => {
    for (const n of [120, 400]) {
      const ks = keys(n);
      const frac = ks.filter((k) => assignArm(k) === 'control').length / ks.length;
      expect(frac, `n=${n}: realized control share ${(frac * 100).toFixed(1)}%`).toBeGreaterThan(0.15);
      expect(frac, `n=${n}: realized control share ${(frac * 100).toFixed(1)}%`).toBeLessThan(0.25);
    }
  });

  it('is deterministic per dedupe key — a replay reproduces the same split', () => {
    for (const k of keys(50)) expect(assignArm(k)).toBe(assignArm(k));
  });

  it('is not degenerate — both arms are present even in a small batch', () => {
    const arms = new Set(keys(60).map((k) => assignArm(k)));
    expect(arms.has('control') && arms.has('treatment')).toBe(true);
  });
});
