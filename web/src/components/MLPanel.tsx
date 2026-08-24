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
        <Metric label="Recovery probability" value={pct(prediction.recoveryProbability)} tone="emerald" bar={prediction.recoveryProbability} />
        <Metric label="Confidence (calibrated)" value={pct(prediction.calibratedConfidence)} tone="sky" bar={prediction.calibratedConfidence ?? 0} />
        <Metric label="Escalation risk" value={pct(prediction.escalationProbability)} tone="amber" bar={prediction.escalationProbability ?? 0} />
        <Metric label="Anomaly score" value={pct(anom)} tone={anom && anom > 0.6 ? 'rose' : 'slate'} bar={anom ?? 0} />
      </div>

      {per && (
        <div className="mt-5">
          <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Recovery odds by action (model)</div>
          <div className="space-y-2">
            {Object.entries(per)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => {
                const chosen = k === prediction.actionClass;
                return (
                  <div key={k}>
                    <div className="mb-0.5 flex justify-between text-xs">
                      <span className={chosen ? 'font-semibold text-sky-300' : 'text-slate-400'}>
                        {titleCase(k)}
                        {chosen && ' · chosen'}
                      </span>
                      <span className="tabular-nums text-slate-500">{pct(v)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800">
                      <div className={cx('h-1.5 rounded-full', chosen ? 'bg-sky-400' : 'bg-slate-600')} style={{ width: `${v * 100}%` }} />
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
  const barColor = { emerald: 'bg-emerald-400', sky: 'bg-sky-400', amber: 'bg-amber-400', rose: 'bg-rose-400', slate: 'bg-slate-500' }[tone];
  const txt = { emerald: 'text-emerald-300', sky: 'text-sky-300', amber: 'text-amber-300', rose: 'text-rose-300', slate: 'text-slate-300' }[tone];
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cx('mt-0.5 text-xl font-bold tabular-nums', txt)}>{value}</div>
      <div className="mt-1 h-1 rounded-full bg-slate-800">
        <div className={cx('h-1 rounded-full', barColor)} style={{ width: `${Math.round((bar || 0) * 100)}%` }} />
      </div>
    </div>
  );
}
