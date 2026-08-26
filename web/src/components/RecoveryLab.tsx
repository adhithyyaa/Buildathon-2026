import { useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { api, type LabReport } from '../lib/api';
import { Card, Pill, cx } from './ui';
import { formatINR } from '../lib/format';
import { titleCase } from '../lib/format';

export interface RecoveryLabHandle {
  refresh: () => void;
}

const rupees = (paise: number) => formatINR(paise);

export const RecoveryLab = forwardRef<RecoveryLabHandle>(function RecoveryLab(_props, ref) {
  const [lab, setLab] = useState<LabReport | null>(null);
  const [err, setErr] = useState(false);
  const load = () => api.lab().then(setLab).catch(() => setErr(true));
  useEffect(() => { load(); }, []);
  useImperativeHandle(ref, () => ({ refresh: load }));

  if (err) return null;
  if (!lab || lab.totalResolved === 0) {
    return (
      <Card title="Recovery Lab — incremental ₹ vs a live control">
        <p className="text-sm text-slate-500 py-4">
          No resolved outcomes yet. A 20% held-out <b className="text-slate-800 font-semibold">control</b> arm gets no recovery action —
          run the pipeline, then <b className="text-slate-800 font-semibold">Resolve outcomes</b> to measure how much the ML+policy
          treatment arm recovers <i>over</i> the control (the incremental ₹, not gross).
        </p>
      </Card>
    );
  }

  const o = lab.overall;
  const sig = o.significant && o.liftPct > 0;
  const maxLift = Math.max(1, ...lab.byReason.map((r) => Math.abs(r.incrementalPaise)));

  return (
    <Card
      title="Recovery Lab — incremental ₹ vs a live control"
      right={<Pill tone={sig ? 'emerald' : 'slate'}>{lab.totalResolved.toLocaleString()} resolved · 20% control holdout</Pill>}
    >
      {/* The money shot: recovered vs control, with a CI. */}
      <div className="grid gap-4 sm:grid-cols-[1.3fr_1fr_1fr]">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Incremental recovered (vs control)</div>
          <div className="mt-1 text-3xl font-black text-emerald-900 tabular-nums">{rupees(o.incrementalPaise)}</div>
          <div className="mt-1.5 text-xs text-emerald-700 font-medium">
            <b className="text-emerald-900 font-bold">{o.liftPct > 0 ? '+' : ''}{o.liftPct}pp</b> lift · 95% CI [{o.liftCi95Pct[0]}, {o.liftCi95Pct[1]}]pp ·{' '}
            <span className={sig ? 'text-emerald-800 font-bold' : 'text-amber-800'}>{sig ? 'significant' : 'not yet significant'}</span>
          </div>
        </div>
        <Rate label="Treatment (ML + policy)" stat={o.treatment} tone="sky" />
        <Rate label="Control (no action)" stat={o.control} tone="slate" />
      </div>

      <p className="mt-3.5 text-[11px] leading-relaxed text-slate-500 font-medium">
        This is the number nobody publishes: not gross "recovered ₹", but recovered <i>versus what would have happened
        anyway</i>. A random 20% of cases are a no-action control; the gap between the arms — with a bootstrap CI — is the
        recovery layer's true, provable value, and a live A/B signal on the model.
      </p>

      {/* Per-reason incremental lift. */}
      {lab.byReason.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Incremental lift by failure reason</div>
          <div className="space-y-2.5">
            {lab.byReason.map((r) => (
              <div key={r.reason}>
                <div className="mb-1 flex justify-between text-xs font-medium">
                  <span className={r.liftPct > 0 ? 'text-slate-800 font-semibold' : 'text-rose-700'}>{titleCase(r.reason)}</span>
                  <span className="tabular-nums font-bold text-slate-700">
                    {rupees(r.incrementalPaise)} · {r.liftPct > 0 ? '+' : ''}{r.liftPct}pp
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100">
                  <div
                    className={cx('h-1.5 rounded-full transition-all duration-500', r.liftPct > 0 ? 'bg-emerald-500' : 'bg-rose-500')}
                    style={{ width: `${(Math.abs(r.incrementalPaise) / maxLift) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The self-optimizing loop: reasons with no proven lift are auto-suppressed IN the policy. */}
      {lab.suppressionCandidates.length > 0 && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-800 leading-relaxed">
          <b>⟳ Auto-suppressed (policy is now skipping these):</b> {lab.suppressionCandidates.map(titleCase).join(', ')} — the
          treatment arm shows <i>no proven lift over control</i> here, so the policy takes <b>no action</b> on these reasons
          until they re-prove themselves. This is the closed loop: measure → prune → recover more per ₹ spent.
        </div>
      )}
    </Card>
  );
});

function Rate({ label, stat, tone }: { label: string; stat: { recoveryRatePct: number | null; cases: number; recovered: number }; tone: 'sky' | 'slate' }) {
  const txt = tone === 'sky' ? 'text-sky-900' : 'text-slate-900';
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 shadow-2xs">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={cx('mt-1 text-2xl font-black tabular-nums', txt)}>{stat.recoveryRatePct != null ? `${stat.recoveryRatePct}%` : '—'}</div>
      <div className="mt-1 text-xs text-slate-500 font-medium">{stat.recovered}/{stat.cases} recovered</div>
    </div>
  );
}
