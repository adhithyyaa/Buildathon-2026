import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Artifact-locked numbers — the anti-drift guard no competitor ships.
 *
 * Every headline metric a judge reads in the README / demo runbook is COMPUTED by an ML script and
 * written to a git-tracked JSON artifact (ml/*.json). Prose, though, is edited by hand and silently
 * rots: retrain the model, the artifact moves, the doc keeps quoting yesterday's number. This test
 * pins each claim to the exact field that produced it — it recomputes the string the way the prose
 * rounds it and asserts the doc still contains it. Retrain and forget to update the docs → CI is red.
 *
 * It is deliberately one-directional (doc must match artifact, not vice-versa): the artifacts are the
 * source of truth, the prose is the thing that drifts. If this fails, either re-run the ML script that
 * owns the artifact and update the sentence, or the sentence is wrong — either way the number is a lie
 * until it's fixed.
 */

// server/src/domain/__tests__ → repo root is four levels up.
const ROOT = path.resolve(__dirname, '../../../..');

const artifactCache = new Map<string, Record<string, unknown>>();
function artifact(rel: string): any {
  if (!artifactCache.has(rel)) artifactCache.set(rel, JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8')));
  return artifactCache.get(rel);
}

const docCache = new Map<string, string>();
function doc(rel: string): string {
  if (!docCache.has(rel)) docCache.set(rel, readFileSync(path.join(ROOT, rel), 'utf8'));
  return docCache.get(rel)!;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const pp = (frac: number) => `${(frac * 100).toFixed(1)}pp`;

interface Claim {
  label: string;
  artifact: string;
  value: (j: any) => number | string;
  render: (v: any) => string;
  docs: string[];
}

/** Each claim: where the number is computed, how the prose writes it, and which docs must carry it. */
const CLAIMS: Claim[] = [
  // ── Causal uplift (ml/uplift.json) ───────────────────────────────────────────────────────────
  {
    label: 'Qini coefficient (S-learner, best-treatment ranking)',
    artifact: 'ml/uplift.json',
    value: (j) => j.best_treatment_ranking.s_learner.qini_coefficient,
    render: (v) => Number(v).toFixed(2), // "0.93"
    docs: ['README.md', 'docs/DEMO.md'],
  },
  {
    label: 'ECE (calibration error)',
    artifact: 'ml/uplift.json',
    value: (j) => j.calibration.ece,
    render: (v) => Number(v).toFixed(3), // "0.008"
    docs: ['README.md', 'docs/DEMO.md'],
  },
  {
    label: 'Uplift policy capture of the oracle ceiling',
    artifact: 'ml/uplift.json',
    value: (j) => j.policy_value_incremental_inr.uplift_policy / j.policy_value_incremental_inr.oracle,
    render: (v) => `~${Math.round(Number(v) * 100)}%`, // "~99%"
    docs: ['README.md', 'docs/DEMO.md'],
  },
  {
    label: 'Doubly-robust value ₹/case',
    artifact: 'ml/uplift.json',
    value: (j) => j.off_policy.dr_value_inr_per_case,
    render: inr, // "₹3,276"
    docs: ['README.md'],
  },
  {
    label: 'Logging-policy value ₹/case',
    artifact: 'ml/uplift.json',
    value: (j) => j.off_policy.logging_policy_inr_per_case,
    render: inr, // "₹2,442"
    docs: ['README.md'],
  },
  {
    label: 'DR error vs ground truth (synthetic)',
    artifact: 'ml/uplift.json',
    value: (j) => j.off_policy.dr_error_vs_truth_pct,
    render: (v) => `~${Math.round(Number(v))}%`, // "~6%"
    docs: ['README.md', 'docs/DEMO.md'],
  },

  // ── Real-RCT external validity (ml/rct_validation.json) ───────────────────────────────────────
  {
    label: 'Real-RCT ground-truth ATE',
    artifact: 'ml/rct_validation.json',
    value: (j) => j.ate_ground_truth.diff_in_means,
    render: (v) => `+${pp(Number(v))}`, // "+6.1pp"
    docs: ['README.md', 'docs/DEMO.md'],
  },
  {
    label: 'Real-RCT DR recovery error',
    artifact: 'ml/rct_validation.json',
    value: (j) => j.ate_recovered.dr_error_vs_truth_pct,
    render: (v) => `${Number(v).toFixed(1)}%`, // "1.9%"
    docs: ['README.md', 'docs/DEMO.md'],
  },
  {
    label: 'Real-RCT sample size',
    artifact: 'ml/rct_validation.json',
    value: (j) => j.dataset.rows,
    render: (v) => Number(v).toLocaleString('en-IN'), // "64,000"
    docs: ['README.md', 'docs/DEMO.md'],
  },
  {
    label: 'Real-RCT best uplift learner',
    artifact: 'ml/rct_validation.json',
    value: (j) => j.best_learner,
    render: (v) => String(v).replace('_', '-'), // "x-learner"
    docs: ['README.md', 'docs/DEMO.md'],
  },
  {
    // The ranking result on REAL data: uplift among the best learner's top-30% minus the population ATE.
    label: 'Real-RCT top-30% targeting gain (best learner)',
    artifact: 'ml/rct_validation.json',
    value: (j) => j.uplift_learners[j.best_learner].uplift_at_30pct,
    render: (v) => `+${pp(Number(v))}`, // "+2.0pp"
    docs: ['README.md', 'docs/PROOF.md'],
  },
  {
    label: 'Real-RCT top-30% targeting gain (S-learner)',
    artifact: 'ml/rct_validation.json',
    value: (j) => j.uplift_learners.s_learner.uplift_at_30pct,
    render: (v) => `+${pp(Number(v))}`, // "+2.5pp"
    docs: ['README.md', 'docs/PROOF.md'],
  },

  // ── Conformal per-case certainty (ml/conformal.json) ─────────────────────────────────────────
  {
    label: 'Conformal empirical coverage',
    artifact: 'ml/conformal.json',
    value: (j) => j.empirical_coverage_pct,
    render: (v) => `${v}%`, // "90.7%"
    docs: ['README.md', 'docs/DEMO.md'],
  },
  {
    label: 'Conformal target coverage',
    artifact: 'ml/conformal.json',
    value: (j) => j.target_coverage_pct,
    render: (v) => `${v}%`, // "90%"
    docs: ['README.md', 'docs/DEMO.md'],
  },

  // ── Online exploration (ml/explore.json) ─────────────────────────────────────────────────────
  {
    label: 'Thompson-sampling share of oracle',
    artifact: 'ml/explore.json',
    value: (j) => j.ts_pct_of_oracle_final,
    render: (v) => `~${Math.round(Number(v))}%`, // "~93%"
    docs: ['docs/DEMO.md'],
  },
];

describe('Docs stay locked to the ML artifacts that produced them', () => {
  for (const c of CLAIMS) {
    it(`${c.label} → ${c.docs.join(', ')}`, () => {
      const rendered = c.render(c.value(artifact(c.artifact)));
      // A vacuous render (empty / single char) would match almost any doc — refuse to pass on it.
      expect(rendered.length, `vacuous render for "${c.label}"`).toBeGreaterThan(1);
      for (const d of c.docs) {
        expect(
          doc(d),
          `${d} no longer contains the current value for "${c.label}" (expected to find "${rendered}" from ${c.artifact}). ` +
            `Retrain drift: re-run the ML script that owns ${c.artifact} and update the sentence, or the sentence is stale.`,
        ).toContain(rendered);
      }
    });
  }
});
