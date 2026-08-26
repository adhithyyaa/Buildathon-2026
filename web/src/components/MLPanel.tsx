import type { Prediction } from '../lib/api';
import { Card, Pill, cx } from './ui';
import { titleCase } from '../lib/format';

const pct = (x: number | null | undefined) => (x == null ? '—' : `${Math.round(x * 100)}%`);

export function MLPanel({ prediction }: { prediction: Prediction | null }) {
  if (!prediction) return null;
  const isML = prediction.source === 'ml';
  const per = prediction.perAction;
  const anom = prediction.anomalyScore;

  return (
    <Card
      title="ML prediction"
      right={<Pill tone={isML ? 'sky' : 'slate'}>{isML ? prediction.model : 'deterministic fallback'}</Pill>}
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="Recovery probability (calibrated)" value={pct(prediction.recoveryProbability)} tone="emerald" bar={prediction.recoveryProbability} />
        <Metric label="Action confidence" value={pct(prediction.actionConfidence)} tone="sky" bar={prediction.actionConfidence ?? 0} />
        <Metric label="Escalation risk" value={pct(prediction.escalationProbability)} tone="amber" bar={prediction.escalationProbability ?? 0} />
        <Metric label="Anomaly score" value={pct(anom)} tone={anom && anom > 0.6 ? 'rose' : 'slate'} bar={anom ?? 0} />
      </div>

      {per && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Recovery odds by action (model)</div>
          <div className="space-y-2.5">
            {Object.entries(per)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => {
                const chosen = k === prediction.actionClass;
                return (
                  <div key={k}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className={chosen ? 'font-bold text-slate-900' : 'text-slate-600 font-medium'}>
                        {titleCase(k)}
                        {chosen && ' · chosen'}
                      </span>
                      <span className="tabular-nums font-bold text-slate-700">{pct(v)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100">
                      <div className={cx('h-1.5 rounded-full transition-all duration-500', chosen ? 'bg-sky-500' : 'bg-slate-300')} style={{ width: `${v * 100}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </Card>
  );
}

function Metric({ label, value, tone, bar }: { label: string; value: string; tone: 'emerald' | 'sky' | 'amber' | 'rose' | 'slate'; bar: number }) {
  const barColor = { emerald: 'bg-emerald-500', sky: 'bg-sky-500', amber: 'bg-amber-500', rose: 'bg-rose-500', slate: 'bg-slate-400' }[tone];
  const txt = { emerald: 'text-emerald-900', sky: 'text-sky-900', amber: 'text-amber-900', rose: 'text-rose-900', slate: 'text-slate-900' }[tone];
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 shadow-2xs">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">{label}</div>
      <div className={cx('mt-1 text-xl font-black tabular-nums', txt)}>{value}</div>
      <div className="mt-2 h-1 rounded-full bg-slate-200">
        <div className={cx('h-1 rounded-full transition-all duration-500', barColor)} style={{ width: `${Math.round((bar || 0) * 100)}%` }} />
      </div>
    </div>
  );
}
