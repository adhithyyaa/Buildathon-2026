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
  if (!m) return <Card title="Model"><div className="h-16 animate-pulse rounded bg-slate-800/60" /></Card>;

  const recovery = [
    { name: 'CatBoost (primary)', auc: m.recovery.catboost_calibrated.roc_auc, primary: true },
    { name: 'XGBoost', auc: m.recovery.xgboost.roc_auc, primary: false },
    { name: 'Logistic Reg.', auc: m.recovery.logistic_regression.roc_auc, primary: false },
  ];
  const maxAuc = Math.max(...recovery.map((r) => r.auc));
  const maxImp = Math.max(1, ...m.action.top_features.map((f) => f.importance));

  return (
    <Card title="Model" right={<Pill tone="sky">v{m.version} · trained on {m.dataset.rows.toLocaleString()} cases</Pill>}>
      <div className="grid gap-6 lg:grid-cols-3">
        <div>
          <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Recovery model — ROC-AUC</div>
          <div className="space-y-2">
            {recovery.map((r) => (
              <div key={r.name}>
                <div className="mb-0.5 flex justify-between text-xs">
                  <span className={r.primary ? 'font-semibold text-sky-300' : 'text-slate-400'}>{r.name}</span>
                  <span className="tabular-nums text-slate-500">{r.auc.toFixed(3)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-800">
                  <div className={cx('h-1.5 rounded-full', r.primary ? 'bg-sky-400' : 'bg-slate-600')} style={{ width: `${(r.auc / maxAuc) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-slate-500">
            Action accuracy <b className="text-slate-300">{Math.round(m.action.catboost.accuracy * 100)}%</b> · escalation Brier{' '}
            <b className="text-slate-300">{m.escalation.catboost_calibrated.brier}</b>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Calibration — predicted vs actual</div>
          <Calibration curve={m.recovery.calibration_curve ?? []} />
          <div className="mt-1 text-[11px] text-slate-500">On the dashed line = perfectly calibrated probabilities.</div>
        </div>

        <div>
          <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">What drives the decision</div>
          <div className="space-y-1.5">
            {m.action.top_features.slice(0, 6).map((f) => (
              <div key={f.feature} className="flex items-center gap-2 text-xs">
                <span className="w-28 shrink-0 truncate text-slate-400">{f.feature.replace(/_/g, ' ')}</span>
                <div className="h-1.5 flex-1 rounded-full bg-slate-800">
                  <div className="h-1.5 rounded-full bg-violet-400" style={{ width: `${(f.importance / maxImp) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-slate-500">
            Failure-spike detection <b className="text-slate-300">{Math.round(m.anomaly.window.incident_detection_rate * 100)}%</b>
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
      <line x1="0" y1={H} x2={W} y2="0" stroke="rgb(71,85,105)" strokeDasharray="3 3" strokeWidth="1" />
      {curve.length > 1 && (
        <polyline fill="none" stroke="rgb(52,211,153)" strokeWidth="1.5" points={curve.map((p) => `${p.predicted * W},${H - p.observed * H}`).join(' ')} />
      )}
      {curve.map((p, i) => (
        <circle key={i} cx={p.predicted * W} cy={H - p.observed * H} r="2.6" fill="rgb(52,211,153)" />
      ))}
    </svg>
  );
}
