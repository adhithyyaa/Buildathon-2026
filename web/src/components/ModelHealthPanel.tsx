import { useEffect, useState } from 'react';
import { api, type ModelHealth, type DriftStatus } from '../lib/api';
import { useRefresh } from '../lib/refresh';
import { Card, Pill, cx } from './ui';
import { titleCase } from '../lib/format';

const STATUS_TONE: Record<DriftStatus, { pill: 'emerald' | 'amber' | 'rose'; bar: string; text: string }> = {
  stable: { pill: 'emerald', bar: 'bg-emerald-500', text: 'text-emerald-700' },
  watch: { pill: 'amber', bar: 'bg-amber-500', text: 'text-amber-700' },
  shift: { pill: 'rose', bar: 'bg-rose-500', text: 'text-rose-700' },
};

/**
 * F8 — production model-health. Answers "how do you know the model still works on live traffic?":
 * per-feature PSI drift vs training (0.1 watch / 0.25 shift), the live score distribution, and real
 * inference latency. A failure-spike visibly moves the failure_reason PSI, so it is a live instrument.
 */
export function ModelHealthPanel() {
  const { version, poll } = useRefresh();
  const [h, setH] = useState<ModelHealth | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    api.modelHealth().then(setH).catch(() => setErr(true));
  }, [version, poll]);

  if (err) return null;
  if (!h) return <Card title="Model health"><div className="h-24 animate-pulse rounded-xl bg-slate-100" /></Card>;

  const maxBin = Math.max(...h.scoreDistribution.bins, 1);

  return (
    <Card
      title="Model health — live drift & latency"
      right={<Pill tone={STATUS_TONE[h.overallStatus].pill}>{titleCase(h.overallStatus)} · {h.cases} live cases</Pill>}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Feature drift (PSI) */}
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Feature drift (PSI vs training)</div>
          <div className="space-y-3">
            {h.features.map((f) => {
              const tone = STATUS_TONE[f.status];
              // Scale the bar so the 0.25 "shift" threshold sits at ~80% width.
              const w = Math.min(100, (f.psi / 0.25) * 80);
              return (
                <div key={f.feature}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">{titleCase(f.feature)}</span>
                    <span className={cx('tabular-nums font-bold', tone.text)}>{f.psi.toFixed(3)} · {f.status}</span>
                  </div>
                  <div className="relative h-2 rounded-full bg-slate-100">
                    <div className={cx('h-2 rounded-full transition-all duration-500', tone.bar)} style={{ width: `${Math.max(2, w)}%` }} />
                    {/* threshold ticks at 0.1 (watch) and 0.25 (shift) */}
                    <span className="absolute top-[-2px] h-3 w-px bg-amber-300" style={{ left: `${(0.1 / 0.25) * 80}%` }} title="0.10 watch" />
                    <span className="absolute top-[-2px] h-3 w-px bg-rose-300" style={{ left: '80%' }} title="0.25 shift" />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-[10.5px] leading-relaxed text-slate-400">
            PSI &lt; 0.1 stable · 0.1–0.25 watch · &gt; 0.25 shift. Ticks mark the thresholds; trigger a failure spike to move the reason PSI.
          </div>
        </div>

        {/* Score distribution */}
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Recovery-probability distribution</div>
          <div className="flex h-24 items-end gap-1">
            {h.scoreDistribution.bins.map((n, i) => (
              <div key={i} className="flex-1" title={`${(i * 10)}–${i * 10 + 10}%: ${n}`}>
                <div className="rounded-t bg-violet-400 transition-all duration-500" style={{ height: `${(n / maxBin) * 100}%`, minHeight: n > 0 ? 2 : 0 }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-400"><span>0%</span><span>50%</span><span>100%</span></div>
          <div className="mt-2 text-xs text-slate-500">
            Mean predicted <b className="text-slate-800">{Math.round(h.scoreDistribution.mean * 100)}%</b> over <b className="text-slate-800">{h.scoreDistribution.count}</b> live predictions.
          </div>
        </div>

        {/* Latency */}
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Inference latency</div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Average" value={`${h.latency.avgMs} ms`} />
            <Stat label="p50" value={`${h.latency.p50Ms} ms`} />
            <Stat label="p95" value={`${h.latency.p95Ms} ms`} />
            <Stat label="Max" value={`${h.latency.maxMs} ms`} />
          </div>
          <div className="mt-2 text-[10.5px] text-slate-400">Measured on {h.latency.count} model-served decisions.</div>
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-1.5">
      <div className="text-[10px] font-medium text-slate-400">{label}</div>
      <div className="text-sm font-bold tabular-nums text-slate-800">{value}</div>
    </div>
  );
}
