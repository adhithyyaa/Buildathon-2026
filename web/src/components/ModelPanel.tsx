import { useEffect, useState } from 'react';
import { api, type MlMetrics } from '../lib/api';
import { Card, Pill, cx } from './ui';

export function ModelPanel() {
  const [m, setM] = useState<MlMetrics | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    api.mlMetrics().then(setM).catch(() => setErr(true));
  }, []);

  if (err) return null; // ML service offline → hide the panel
  if (!m) return <Card title="Model"><div className="h-24 animate-pulse rounded-xl bg-slate-100" /></Card>;

  const recovery = [
    { name: 'CatBoost (primary)', auc: m.recovery.catboost_calibrated.roc_auc, primary: true },
    { name: 'XGBoost', auc: m.recovery.xgboost.roc_auc, primary: false },
    { name: 'Logistic Reg.', auc: m.recovery.logistic_regression.roc_auc, primary: false },
  ];
  const maxAuc = Math.max(...recovery.map((r) => r.auc));
  const maxImp = Math.max(1, ...m.action.top_features.map((f) => f.importance));
  const ci = m.recovery.auc_ci?.catboost_calibrated;
  const vs = m.recovery.catboost_vs_logreg;
  const evPct = Math.round((m.action.agreement_with_ev_argmax ?? 0) * 100);
  const accPct = Math.round(m.action.catboost.accuracy * 100);

  return (
    <Card title="Model" right={<Pill tone="sky">v{m.version} · {m.dataset.rows.toLocaleString()} synthetic cases · time-ordered split</Pill>}>
      <div className="grid gap-6 lg:grid-cols-3">
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Recovery model — ROC-AUC</div>
          <div className="space-y-2.5">
            {recovery.map((r) => (
              <div key={r.name}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className={r.primary ? 'font-bold text-slate-900' : 'text-slate-600 font-medium'}>{r.name}</span>
                  <span className="tabular-nums font-bold text-slate-700">{r.auc.toFixed(3)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100">
                  <div className={cx('h-1.5 rounded-full transition-all duration-500', r.primary ? 'bg-sky-500' : 'bg-slate-300')} style={{ width: `${(r.auc / maxAuc) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          {ci && vs && (
            <div className="mt-3 text-[11px] leading-relaxed text-slate-500">
              Primary 95% CI <b className="tabular-nums text-slate-800">[{ci[0].toFixed(3)}–{ci[1].toFixed(3)}]</b>. Edge over
              logistic reg. <b className="tabular-nums text-slate-800">+{vs.diff_median.toFixed(3)}</b>{' '}
              ({vs.significant ? 'significant' : 'n.s.'}, but small) — CatBoost is primary for calibration &amp; native
              categoricals, not the AUC gap.
            </div>
          )}
          <div className="mt-3 text-xs text-slate-500">
            Action head agrees with EV-optimal action <b className="text-slate-800">{evPct}%</b>
            <span className="text-slate-400"> (raw accuracy {accPct}% on noisy labels — a real learning task)</span> · escalation Brier{' '}
            <b className="text-slate-800">{m.escalation.catboost_calibrated.brier}</b>
          </div>
        </div>

        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Calibration — predicted vs actual</div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 flex flex-col items-center">
            <Calibration curve={m.recovery.calibration_curve ?? []} />
          </div>
          <div className="mt-2 text-[11px] text-slate-400">On the dashed line = perfectly calibrated probabilities.</div>
        </div>

        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">What drives the decision</div>
          <div className="space-y-2">
            {m.action.top_features.slice(0, 6).map((f) => (
              <div key={f.feature} className="flex items-center gap-2 text-xs">
                <span className="w-28 shrink-0 truncate text-slate-600 font-medium">{f.feature.replace(/_/g, ' ')}</span>
                <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                  <div className="h-1.5 rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${(f.importance / maxImp) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 text-xs text-slate-500">
            Failure-spike detection <b className="text-slate-800">{Math.round(m.anomaly.window.incident_detection_rate * 100)}%</b>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Calibration({ curve }: { curve: MlMetrics['recovery']['calibration_curve'] }) {
  const W = 200;
  const H = 120;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[240px]" role="img" aria-label="Calibration curve">
      <line x1="0" y1={H} x2={W} y2="0" stroke="#cbd5e1" strokeDasharray="3 3" strokeWidth="1.5" />
      {curve.length > 1 && (
        <polyline fill="none" stroke="#10b981" strokeWidth="2" points={curve.map((p) => `${p.predicted * W},${H - p.observed * H}`).join(' ')} />
      )}
      {curve.map((p, i) => (
        <circle key={i} cx={p.predicted * W} cy={H - p.observed * H} r="3" fill="#10b981" />
      ))}
    </svg>
  );
}
