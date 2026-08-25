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
        <p className="text-sm text-slate-500">
          No resolved outcomes yet. A 20% held-out <b className="text-slate-300">control</b> arm gets no recovery action —
          run the pipeline, then <b className="text-slate-300">Resolve outcomes</b> to measure how much the ML+policy
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
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="text-[11px] uppercase tracking-wide text-emerald-300/80">Incremental recovered (vs control)</div>
          <div className="mt-1 text-3xl font-black text-emerald-300">{rupees(o.incrementalPaise)}</div>
          <div className="mt-1 text-xs text-slate-400">
            <b className="text-slate-200">{o.liftPct > 0 ? '+' : ''}{o.liftPct}pp</b> lift · 95% CI [{o.liftCi95Pct[0]}, {o.liftCi95Pct[1]}]pp ·{' '}
            <span className={sig ? 'text-emerald-400' : 'text-amber-400'}>{sig ? 'significant' : 'not yet significant'}</span>
          </div>
        </div>
        <Rate label="Treatment (ML + policy)" stat={o.treatment} tone="sky" />
        <Rate label="Control (no action)" stat={o.control} tone="slate" />
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        This is the number nobody publishes: not gross "recovered ₹", but recovered <i>versus what would have happened
        anyway</i>. A random 20% of cases are a no-action control; the gap between the arms — with a bootstrap CI — is the
        recovery layer's true, provable value, and a live A/B signal on the model.
      </p>

      {/* Per-reason incremental lift. */}
      {lab.byReason.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Incremental lift by failure reason</div>
          <div className="space-y-2">
            {lab.byReason.map((r) => (
              <div key={r.reason}>
                <div className="mb-0.5 flex justify-between text-xs">
                  <span className={r.liftPct > 0 ? 'text-slate-300' : 'text-rose-300/80'}>{titleCase(r.reason)}</span>
                  <span className="tabular-nums text-slate-500">
                    {rupees(r.incrementalPaise)} · {r.liftPct > 0 ? '+' : ''}{r.liftPct}pp
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-800">
                  <div
                    className={cx('h-1.5 rounded-full', r.liftPct > 0 ? 'bg-emerald-400' : 'bg-rose-500')}
                    style={{ width: `${(Math.abs(r.incrementalPaise) / maxLift) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Efficiency loop: reasons that don't beat control are wasted effort. */}
      {lab.suppressionCandidates.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
          <b>Auto-suppress candidates:</b> {lab.suppressionCandidates.map(titleCase).join(', ')} — the treatment arm does not
          beat control here, so pursuing these wastes actions and spend. The policy can stop acting on them until the model improves.
        </div>
      )}
    </Card>
  );
});

function Rate({ label, stat, tone }: { label: string; stat: { recoveryRatePct: number | null; cases: number; recovered: number }; tone: 'sky' | 'slate' }) {
  const txt = tone === 'sky' ? 'text-sky-300' : 'text-slate-300';
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cx('mt-1 text-2xl font-bold tabular-nums', txt)}>{stat.recoveryRatePct != null ? `${stat.recoveryRatePct}%` : '—'}</div>
      <div className="mt-1 text-xs text-slate-500">{stat.recovered}/{stat.cases} recovered</div>
    </div>
  );
}
