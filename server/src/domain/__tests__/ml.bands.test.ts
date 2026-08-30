import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * ML confidence bands — a regression guard on model QUALITY, not just doc text (that is claims.docs).
 * Every committed artifact's headline metric must land inside a declared sane band. A retrain that
 * silently degrades the model (Qini collapses, coverage drops below its guarantee, DR error blows up)
 * fails CI here, before the number is ever quoted or shipped. Bands are deliberately generous — they
 * catch regressions and absurd values, not normal run-to-run noise.
 */
const ROOT = path.resolve(__dirname, '../../../..');
const load = (rel: string): any => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));

interface Band {
  label: string;
  value: () => number | string;
  ok: (v: any) => boolean;
  because: string;
}

const uplift = () => load('ml/uplift.json');
const conformal = () => load('ml/conformal.json');
const rct = () => load('ml/rct_validation.json');
const metrics = () => load('ml/metrics.json');
const explore = () => load('ml/explore.json');

const BANDS: Band[] = [
  // Causal uplift
  { label: 'uplift Qini (S-learner)', value: () => uplift().best_treatment_ranking.s_learner.qini_coefficient, ok: (v) => v >= 0.85 && v <= 0.99, because: 'ranking quality must stay strong (0.85–0.99)' },
  { label: 'uplift ECE', value: () => uplift().calibration.ece, ok: (v) => v >= 0 && v <= 0.03, because: 'calibration error must stay low (≤ 0.03)' },
  { label: 'uplift DR error vs truth %', value: () => uplift().off_policy.dr_error_vs_truth_pct, ok: (v) => v >= 0 && v <= 15, because: 'DR-OPE must track ground truth within 15%' },
  { label: 'uplift policy capture of oracle', value: () => uplift().policy_value_incremental_inr.uplift_policy / uplift().policy_value_incremental_inr.oracle, ok: (v) => v >= 0.95 && v <= 1.0, because: 'policy must capture ≥ 95% of the oracle ceiling' },
  // Conformal — the coverage guarantee must actually hold
  { label: 'conformal empirical vs target coverage', value: () => conformal().empirical_coverage_pct - conformal().target_coverage_pct, ok: (v) => v >= -2, because: 'empirical coverage must not fall > 2pp below target' },
  { label: 'conformal avg set size', value: () => conformal().avg_set_size, ok: (v) => v >= 1.0 && v <= 2.0, because: 'prediction-set size must stay in [1, 2]' },
  // Real-RCT external validity
  { label: 'RCT DR error vs truth %', value: () => rct().ate_recovered.dr_error_vs_truth_pct, ok: (v) => v >= 0 && v <= 10, because: 'DR must recover the real-RCT ATE within 10%' },
  { label: 'RCT ground-truth ATE', value: () => rct().ate_ground_truth.diff_in_means, ok: (v) => v >= 0.04 && v <= 0.08, because: 'Hillstrom ATE is a known ~6pp' },
  { label: 'RCT best learner', value: () => rct().best_learner, ok: (v) => ['s_learner', 't_learner', 'x_learner'].includes(v), because: 'best learner must be a real meta-learner' },
  // Recovery model + exploration
  { label: 'recovery ROC-AUC (calibrated CatBoost)', value: () => metrics().recovery.catboost_calibrated.roc_auc, ok: (v) => v >= 0.7 && v <= 0.85, because: 'discrimination must stay in a plausible, non-degenerate band' },
  { label: 'Thompson % of oracle', value: () => explore().ts_pct_of_oracle_final, ok: (v) => v >= 80 && v <= 100, because: 'online exploration must reach ≥ 80% of oracle' },
];

describe('ML artifacts stay within their confidence bands', () => {
  for (const b of BANDS) {
    it(`${b.label} — ${b.because}`, () => {
      const v = b.value();
      expect(v, `${b.label} = ${JSON.stringify(v)} is outside its band (${b.because}). A retrain regressed the model, or the artifact is stale.`).toSatisfy(b.ok);
    });
  }
});
