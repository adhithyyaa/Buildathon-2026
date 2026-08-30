import { useEffect, useState } from 'react';
import { api, type UpliftReport } from '../lib/api';
import { Card, Pill, cx } from './ui';
import { titleCase } from '../lib/format';

/** Compact ₹ for large rupee sums: ₹1.55Cr / ₹8.4L. */
function inrCr(rupees: number): string {
  if (rupees >= 1e7) return `₹${(rupees / 1e7).toFixed(2)}Cr`;
  if (rupees >= 1e5) return `₹${(rupees / 1e5).toFixed(1)}L`;
  if (rupees >= 1e3) return `₹${Math.round(rupees / 1e3)}k`;
  return `₹${Math.round(rupees)}`;
}

const STRATEGY_LABEL: Record<string, string> = {
  uplift_policy: 'Uplift policy (ours)',
  rules_only: 'Rules-only baseline',
  always_retry: 'Always retry',
  random: 'Random action',
  oracle: 'Oracle (ceiling)',
  no_action: 'Do nothing (floor)',
};
const STRATEGY_ORDER = ['oracle', 'uplift_policy', 'rules_only', 'always_retry', 'random', 'no_action'];

/**
 * The causal uplift engine, surfaced. Models tau_a(x) — the incremental recovery each action causes
 * over doing nothing — evaluated against the world's ground truth (Qini, uplift-MAE) and by the
 * realised incremental ₹ of the uplift-optimal policy vs baselines. No competitor models this.
 */
export function UpliftPanel() {
  const [u, setU] = useState<UpliftReport | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    api.mlUplift().then(setU).catch(() => setErr(true));
  }, []);

  if (err) return null;
  if (!u) return <Card title="Causal uplift engine"><div className="h-24 animate-pulse rounded-xl bg-slate-100" /></Card>;

  const rank = u.best_treatment_ranking[u.primary_learner];
  const pv = u.policy_value_incremental_inr;
  const maxPv = Math.max(...Object.values(pv), 1);
  const oracle = pv.oracle ?? maxPv;
  const capturedPct = oracle > 0 ? Math.round((pv.uplift_policy / oracle) * 1000) / 10 : 0;

  const actions = Object.entries(u.per_action)
    .map(([action, v]) => ({ action, uplift: v.true_mean_uplift, qini: v[u.primary_learner].qini_coefficient, mae: v[u.primary_learner].uplift_mae }))
    .sort((a, b) => b.uplift - a.uplift);
  const maxUplift = Math.max(...actions.map((a) => a.uplift), 0.01);

  return (
    <Card
      title="Causal uplift engine — incremental effect per action"
      right={<Pill tone="violet">{u.primary_learner === 't_learner' ? 'T-learner' : 'S-learner'} · v{u.version}</Pill>}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Headline: Qini + calibration */}
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Targeting quality (vs ground truth)</div>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-extrabold tabular-nums text-violet-700">{rank.qini_coefficient.toFixed(2)}</span>
            <span className="mb-1 text-xs font-semibold text-slate-500">Qini coefficient</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">1.0 = perfect case ranking · 0 = no better than random</div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <Metric label="ECE (calibration)" value={u.calibration.ece.toFixed(3)} hint="lower is better" />
            <Metric label="Recovery ROC-AUC" value={u.calibration.roc_auc.toFixed(3)} />
            <Metric label="AUUC (model)" value={rank.auuc_model.toFixed(3)} />
            <Metric label="Uplift @ top 30%" value={`+${(rank.uplift_at_30pct * 100).toFixed(1)}pp`} />
          </div>
          <p className="mt-3 text-[10.5px] leading-relaxed text-slate-400">
            τ<sub>a</sub>(x) = P(recover | do a) − P(recover | do nothing), evaluated against the world's known mechanism.
          </p>
        </div>

        {/* Per-action true uplift */}
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Incremental effect by action</div>
          <div className="space-y-2.5">
            {actions.map((a) => (
              <div key={a.action}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium text-slate-700">{titleCase(a.action)}</span>
                  <span className="tabular-nums font-bold text-slate-700">+{(a.uplift * 100).toFixed(1)}pp</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100" title={`Qini ${a.qini} · uplift-MAE ${a.mae}`}>
                  <div className="h-1.5 rounded-full bg-violet-500 transition-all duration-500" style={{ width: `${(a.uplift / maxUplift) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[10.5px] text-slate-400">Mean recovery lift each action causes over no-action, per case.</div>
        </div>

        {/* Policy value: multi-strategy comparison */}
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Incremental ₹ recovered — strategy comparison</div>
          <div className="space-y-2">
            {STRATEGY_ORDER.filter((k) => k in pv).map((k) => {
              const isOurs = k === 'uplift_policy';
              const isOracle = k === 'oracle';
              return (
                <div key={k}>
                  <div className="mb-0.5 flex justify-between text-xs">
                    <span className={cx(isOurs ? 'font-bold text-slate-900' : 'font-medium text-slate-600')}>{STRATEGY_LABEL[k]}</span>
                    <span className="tabular-nums font-bold text-slate-700">{inrCr(pv[k]!)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className={cx('h-2 rounded-full transition-all duration-500', isOurs ? 'bg-emerald-500' : isOracle ? 'bg-violet-400' : 'bg-slate-300')}
                      style={{ width: `${Math.max(1, (pv[k]! / maxPv) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200/60">
            Uplift policy captures {capturedPct}% of the oracle ceiling
          </div>
        </div>
      </div>

      {u.off_policy && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Doubly-robust off-policy evaluation</span>
            <span className="text-[10.5px] font-medium text-slate-400">estimated from the logged data alone — no counterfactual peeking</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="DR estimate ₹/case" value={`₹${Math.round(u.off_policy.dr_value_inr_per_case).toLocaleString('en-IN')}`} hint={`95% CI ₹${Math.round(u.off_policy.dr_ci95_inr[0]).toLocaleString('en-IN')}–₹${Math.round(u.off_policy.dr_ci95_inr[1]).toLocaleString('en-IN')}`} />
            <Metric label="Logging policy ₹/case" value={`₹${Math.round(u.off_policy.logging_policy_inr_per_case).toLocaleString('en-IN')}`} />
            <Metric label="Ground truth ₹/case" value={`₹${Math.round(u.off_policy.ground_truth_inr_per_case).toLocaleString('en-IN')}`} />
            <Metric label="DR error vs truth" value={u.off_policy.dr_error_vs_truth_pct != null ? `${u.off_policy.dr_error_vs_truth_pct}%` : '—'} hint="lower = estimator is accurate" />
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">
            IPS reweights logged rewards by the behaviour propensity; DR adds a reward-model control variate to cut variance.
            The deployed EV policy is estimated to recover more per case than the policy that generated the log — and because this
            world exposes ground truth, we can confirm DR lands within {u.off_policy.dr_error_vs_truth_pct}% of it.
          </p>
          {u.uncertainty && (
            <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">
              <b className="text-slate-600">Per-case uncertainty:</b> a 30× bootstrap ensemble bounds each case's uplift — mean SE{' '}
              {(u.uncertainty.mean_se * 100).toFixed(1)}pp, and <b className="text-slate-600">{u.uncertainty.pct_confident_positive}%</b> of cases
              are confidently positive (95% lower bound &gt; 0). We bound the effect per case, not just point-estimate it.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-1.5">
      <div className="text-[10px] font-medium text-slate-400">{label}{hint && <span className="text-slate-300"> · {hint}</span>}</div>
      <div className="text-sm font-bold tabular-nums text-slate-800">{value}</div>
    </div>
  );
}
