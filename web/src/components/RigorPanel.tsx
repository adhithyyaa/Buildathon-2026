import { useEffect, useState } from 'react';
import { api, type ConformalReport, type RctReport } from '../lib/api';
import { Card, Pill, cx } from './ui';

/**
 * External validity + per-case certainty — two rigor proofs the rest of the field lacks:
 *  • the same uplift + doubly-robust OPE recovers a REAL public RCT's ground-truth ATE, and
 *  • split-conformal prediction gives each case a coverage-GUARANTEED certainty bucket.
 */
export function RigorPanel() {
  const [rct, setRct] = useState<RctReport | null>(null);
  const [cf, setCf] = useState<ConformalReport | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    Promise.all([api.mlRct().catch(() => null), api.mlConformal().catch(() => null)])
      .then(([r, c]) => { setRct(r); setCf(c); if (!r && !c) setErr(true); })
      .catch(() => setErr(true));
  }, []);

  if (err) return null;
  if (!rct && !cf) return <Card title="External validity & certainty"><div className="h-24 animate-pulse rounded-xl bg-slate-100" /></Card>;

  const coverageOk = cf ? cf.empirical_coverage_pct >= cf.target_coverage_pct - 1 : false;

  return (
    <Card
      title="External validity & per-case certainty"
      right={<Pill tone="violet">rigor the field lacks</Pill>}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Real-RCT external validity */}
        {rct && (
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Validated on a real public RCT</div>
            <p className="text-xs text-slate-500">
              The same uplift + doubly-robust OPE, run on the real <b className="text-slate-700">{rct.dataset.name}</b> ({rct.dataset.rows.toLocaleString('en-IN')} randomised).
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Metric label="True ATE" value={`+${(rct.ate_ground_truth.diff_in_means * 100).toFixed(1)}pp`} />
              <Metric label="DR-recovered" value={`+${(rct.ate_recovered.doubly_robust * 100).toFixed(1)}pp`} />
              <Metric label="DR error" value={rct.ate_recovered.dr_error_vs_truth_pct != null ? `${rct.ate_recovered.dr_error_vs_truth_pct}%` : '—'} good />
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">
              Our doubly-robust estimator recovers the trial's ground-truth ATE within {rct.ate_recovered.dr_error_vs_truth_pct}% on real noisy
              randomised data — external validity, not just the synthetic world. Best learner: <b className="text-slate-600">{rct.best_learner.replace('_', '-')}</b>.
            </p>
          </div>
        )}

        {/* Conformal per-case certainty */}
        {cf && (
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Conformal per-case certainty</div>
            <div className="flex items-end gap-2">
              <span className={cx('text-3xl font-extrabold tabular-nums', coverageOk ? 'text-emerald-700' : 'text-amber-700')}>{cf.empirical_coverage_pct}%</span>
              <span className="mb-1 text-xs font-semibold text-slate-500">empirical coverage (target {cf.target_coverage_pct}%)</span>
            </div>
            <div className="mt-1 text-[10.5px] text-slate-400">Distribution-free split-conformal — the guarantee, checked on a fresh split.</div>
            <div className="mt-3 space-y-1.5">
              <Bucket label="Confidently recoverable" pct={cf.buckets_pct.confident_recoverable} tone="bg-emerald-500" />
              <Bucket label="Confidently not recoverable" pct={cf.buckets_pct.confident_not_recoverable} tone="bg-slate-400" />
              <Bucket label="Uncertain → route to human" pct={cf.buckets_pct.uncertain_route_to_human} tone="bg-amber-400" />
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">
              Each case gets a coverage-guaranteed set; the uncertain ones are an honest hand-off, not a forced guess.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-1.5">
      <div className="text-[10px] font-medium text-slate-400">{label}</div>
      <div className={cx('text-sm font-bold tabular-nums', good ? 'text-emerald-700' : 'text-slate-800')}>{value}</div>
    </div>
  );
}

function Bucket({ label, pct, tone }: { label: string; pct: number; tone: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-44 shrink-0 text-[11px] font-medium text-slate-600">{label}</span>
      <div className="h-2 flex-1 rounded-full bg-slate-100">
        <div className={cx('h-2 rounded-full transition-all duration-500', tone)} style={{ width: `${Math.max(1, pct)}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-[11px] font-bold tabular-nums text-slate-700">{pct}%</span>
    </div>
  );
}
