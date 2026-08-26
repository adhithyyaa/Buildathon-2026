import { useEffect, useState } from 'react';
import { api, type Metrics } from '../lib/api';
import { titleCase } from '../lib/format';
import { JOURNEY, pipelineBuckets, ACTOR_FILL, ACTOR_TEXT, type Actor } from '../lib/stages';
import { useRefresh } from '../lib/refresh';
import { Card, cx } from '../components/ui';
import { CountUp } from '../components/CountUp';

const ACTOR_LABEL: Record<Actor, string> = { det: 'Deterministic', ai: 'AI (ML + LLM)', policy: 'Policy engine', act: 'Executor' };

export function PipelinePage() {
  const { version } = useRefresh();
  const [m, setM] = useState<Metrics | null>(null);
  useEffect(() => {
    api.metrics().then(setM).catch(() => setM(null));
  }, [version]);

  const buckets = m ? pipelineBuckets(m.byState) : null;

  return (
    <div className="space-y-4">
      {/* Live operational flow */}
      <Card title="Recovery pipeline" right={<span className="text-xs text-slate-500">live case counts</span>}>
        {!buckets ? (
          <div className="h-24 animate-pulse rounded-xl bg-slate-800/40" />
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
              {buckets.flow.map((b, i) => (
                <div key={b.key} className="flex flex-1 items-stretch gap-3">
                  <div className="animate-rise flex-1 rounded-2xl border border-slate-800 bg-slate-950/40 p-4" style={{ animationDelay: `${i * 80}ms` }}>
                    <div className="flex items-center gap-2">
                      <span className={cx('h-2 w-2 rounded-full', ACTOR_FILL[b.actor])} />
                      <span className="text-[11px] uppercase tracking-wide text-slate-400">{b.label}</span>
                    </div>
                    <div className="mt-1 text-3xl font-bold tabular-nums text-slate-100"><CountUp value={b.count} /></div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{ACTOR_LABEL[b.actor]}</div>
                  </div>
                  {i < buckets.flow.length - 1 && <Connector />}
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">Branches:</span>
              <BranchChip label="Escalated to human" count={buckets.escalated} tone="rose" />
              <BranchChip label="Expired" count={buckets.expired} tone="slate" />
            </div>
          </>
        )}
      </Card>

      {/* The bounded-agent design: who does what, in order */}
      <Card title="How a case is handled" right={<span className="text-xs text-slate-500">ML proposes · policy disposes</span>}>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {JOURNEY.map((s, i) => (
            <div key={s.key} className="animate-rise rounded-xl border border-slate-800 bg-slate-950/40 p-3" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-center gap-2">
                <span className={cx('grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold text-slate-950', ACTOR_FILL[s.actor])}>{i + 1}</span>
                <span className={cx('text-sm font-semibold', ACTOR_TEXT[s.actor])}>{s.label}</span>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{STAGE_BLURB[s.key]}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-800/80 pt-3">
          {(['det', 'ai', 'policy', 'act'] as Actor[]).map((a) => (
            <span key={a} className="flex items-center gap-1.5 text-xs">
              <span className={cx('h-2.5 w-2.5 rounded-full', ACTOR_FILL[a])} />
              <span className="text-slate-400">{ACTOR_LABEL[a]}</span>
            </span>
          ))}
          <span className="ml-auto text-[11px] text-slate-500">Every AI suggestion is policy-checked before any money moves.</span>
        </div>
      </Card>

      {/* Breakdowns — metrics that explain what is flowing */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="At-risk by failure reason">{m ? <BarList data={m.byReason} tone="bg-sky-400" /> : <BarSkeleton />}</Card>
        <Card title="Chosen recovery action">{m ? <BarList data={m.byAction} tone="bg-violet-400" /> : <BarSkeleton />}</Card>
      </div>
    </div>
  );
}

const STAGE_BLURB: Record<string, string> = {
  caught: 'A failed payment is ingested and scored for risk & urgency.',
  diagnosed: 'The ML model reads features and diagnoses why it failed.',
  decided: 'The model chooses the recovery action with the best expected value.',
  policy: 'A deterministic policy can override, block, or require approval.',
  actioned: 'An allow-listed executor dispatches the approved action only.',
  recovered: 'A signed Razorpay webhook confirms the real capture.',
};

function Connector() {
  return (
    <span className="relative hidden w-6 shrink-0 self-center sm:block" aria-hidden="true">
      <span className="block h-0.5 w-full rounded-full bg-slate-700/70" />
      <span className="animate-travel absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
    </span>
  );
}

function BranchChip({ label, count, tone }: { label: string; count: number; tone: 'rose' | 'slate' }) {
  const c = tone === 'rose' ? 'bg-rose-500/15 text-rose-300 ring-rose-500/30' : 'bg-slate-500/15 text-slate-300 ring-slate-500/30';
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset', c)}>
      {label} <span className="font-bold tabular-nums">{count}</span>
    </span>
  );
}

function BarList({ data, tone }: { data: Record<string, number>; tone: string }) {
  const entries = Object.entries(data).filter(([k]) => k !== 'none').sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map((e) => e[1]));
  if (entries.length === 0) return <div className="text-sm text-slate-500">No data yet.</div>;
  return (
    <div className="space-y-2.5">
      {entries.map(([k, v]) => (
        <div key={k}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-slate-300">{titleCase(k)}</span>
            <span className="tabular-nums text-slate-500">{v}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-800">
            <div className={cx('h-1.5 rounded-full', tone)} style={{ width: `${(v / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function BarSkeleton() {
  return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-6 animate-pulse rounded bg-slate-800/60" />)}</div>;
}
