import { useEffect, useState } from 'react';
import { api, type CaseExplanation } from '../lib/api';
import { Card, Pill, cx } from './ui';
import { titleCase } from '../lib/format';

const CATEGORY_TONE: Record<string, string> = {
  payment: 'text-teal-600',
  customer: 'text-sky-600',
  timing: 'text-amber-600',
  merchant: 'text-emerald-600',
  action: 'text-slate-900',
  other: 'text-slate-600',
};

/**
 * F5 — per-case reason codes. SHAP attribution on the recovery model shows which case factors pushed
 * this recovery probability up (↑, emerald) or down (↓, rose), for the action the engine chose. Turns
 * the model from a black box into an auditable, per-case explanation.
 */
export function ReasonCodes({ caseId }: { caseId: string }) {
  const [ex, setEx] = useState<CaseExplanation | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    setEx(null);
    setErr(false);
    api.caseReasonCodes(caseId).then(setEx).catch(() => setErr(true));
  }, [caseId]);

  if (err) return null;
  if (!ex) return <Card title="Why this decision"><div className="h-24 animate-pulse rounded-xl bg-slate-100" /></Card>;
  if (!ex.available || ex.factors.length === 0) return null;

  const max = Math.max(...ex.factors.map((f) => Math.abs(f.impact)), 0.001);

  return (
    <Card
      title="Why this decision — model reason codes"
      right={ex.recovery_probability != null ? <Pill tone="emerald">{Math.round(ex.recovery_probability * 100)}% recovery prob.</Pill> : null}
    >
      <p className="mb-3.5 text-[11px] leading-relaxed text-slate-400">
        SHAP attribution on the recovery model for <b className="text-slate-600">{titleCase(ex.action ?? '')}</b> — which case
        factors pushed the calibrated probability up (<span className="font-semibold text-emerald-600">↑</span>) or down
        (<span className="font-semibold text-rose-600">↓</span>){ex.base_rate != null ? `, from a ${Math.round(ex.base_rate * 100)}% base rate` : ''}.
      </p>
      <div className="space-y-2.5">
        {ex.factors.map((f) => {
          const up = f.direction === 'increases';
          const w = (Math.abs(f.impact) / max) * 48; // up to 48% of each half
          return (
            <div key={f.feature} className="flex items-center gap-3">
              <div className="w-40 shrink-0">
                <div className={cx('text-xs font-semibold', CATEGORY_TONE[f.category] ?? 'text-slate-700')}>{f.label}</div>
                {f.value != null && f.value !== '' && <div className="truncate text-[10.5px] text-slate-400">{String(f.value)}</div>}
              </div>
              <div className="relative h-4 flex-1">
                <div className="absolute inset-y-0 left-1/2 w-px bg-slate-200" />
                <div
                  className={cx('absolute inset-y-0.5 rounded', up ? 'bg-emerald-400' : 'bg-rose-400')}
                  style={up ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }}
                />
              </div>
              <span className={cx('w-14 shrink-0 text-right text-xs font-bold tabular-nums', up ? 'text-emerald-700' : 'text-rose-700')}>
                {up ? '↑' : '↓'} {Math.abs(f.impact).toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 border-t border-slate-100 pt-2.5 text-[10.5px] text-slate-400">
        Values are log-odds contributions from CatBoost’s native SHAP — the same model that produced the calibrated probability above.
      </p>
    </Card>
  );
}
