import { useEffect, useState } from 'react';
import { api, type Metrics } from '../lib/api';
import { titleCase } from '../lib/format';
import { JOURNEY, pipelineBuckets, ACTOR_FILL, ACTOR_TEXT, type Actor } from '../lib/stages';
import { useRefresh } from '../lib/refresh';
import { Card, cx } from '../components/ui';
import { CountUp } from '../components/CountUp';

const ACTOR_LABEL: Record<Actor, string> = { det: 'Deterministic', ai: 'AI (ML + LLM)', policy: 'Policy engine', act: 'Executor' };

export function PipelinePage() {
  const { version, poll } = useRefresh();
  const [m, setM] = useState<Metrics | null>(null);
  useEffect(() => {
    api.metrics().then(setM).catch(() => setM(null));
  }, [version, poll]);

  const buckets = m ? pipelineBuckets(m.byState) : null;

  return (
    <div className="space-y-6">
      {/* Live operational flow */}
      <Card title="Recovery pipeline" right={<span className="text-xs font-medium text-slate-400">live case counts</span>}>
        {!buckets ? (
          <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
              {buckets.flow.map((b, i) => (
                <div key={b.key} className="flex flex-1 items-stretch gap-3">
                  <div className="animate-rise flex-1 rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 shadow-2xs" style={{ animationDelay: `${i * 60}ms` }}>
                    <div className="flex items-center gap-2">
                      <span className={cx('h-2 w-2 rounded-full', ACTOR_FILL[b.actor])} />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{b.label}</span>
                    </div>
                    <div className="mt-1 text-3xl font-bold tabular-nums text-slate-900"><CountUp value={b.count} /></div>
                    <div className="mt-0.5 text-[11px] font-medium text-slate-500">{ACTOR_LABEL[b.actor]}</div>
                  </div>
                  {i < buckets.flow.length - 1 && <Connector />}
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <span className="text-xs font-medium text-slate-400">Branches:</span>
              <BranchChip label="Escalated to human" count={buckets.escalated} tone="rose" />
              <BranchChip label="Expired" count={buckets.expired} tone="slate" />
            </div>
          </>
        )}
      </Card>

      {/* The bounded-agent design: who does what, in order */}
      <Card title="How a case is handled" right={<span className="text-xs font-medium text-slate-400">ML proposes · policy disposes</span>}>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {JOURNEY.map((s, i) => (
            <div key={s.key} className="animate-rise rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 shadow-2xs" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-center gap-2">
                <span className={cx('grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold text-white shadow-2xs', ACTOR_FILL[s.actor])}>{i + 1}</span>
                <span className={cx('text-sm font-bold', ACTOR_TEXT[s.actor])}>{s.label}</span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500 font-medium">{STAGE_BLURB[s.key]}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-3">
          {(['det', 'ai', 'policy', 'act'] as Actor[]).map((a) => (
            <span key={a} className="flex items-center gap-1.5 text-xs">
              <span className={cx('h-2 w-2 rounded-full', ACTOR_FILL[a])} />
              <span className="text-slate-600 font-medium">{ACTOR_LABEL[a]}</span>
            </span>
          ))}
          <span className="ml-auto text-[11px] font-medium text-slate-400">Every AI suggestion is policy-checked before any money moves.</span>
        </div>
      </Card>

      {/* Breakdowns — metrics that explain what is flowing */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="At-risk by failure reason">{m ? <BarList data={m.byReason} tone="bg-sky-500" /> : <BarSkeleton />}</Card>
        <Card title="Chosen recovery action">{m ? <BarList data={m.byAction} tone="bg-emerald-500" /> : <BarSkeleton />}</Card>
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
      <span className="block h-0.5 w-full rounded-full bg-slate-200" />
      <span className="animate-travel absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
    </span>
  );
}

function BranchChip({ label, count, tone }: { label: string; count: number; tone: 'rose' | 'slate' }) {
  const c = tone === 'rose' ? 'bg-rose-50 text-rose-700 ring-rose-200/80' : 'bg-slate-100 text-slate-700 ring-slate-200';
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', c)}>
      {label} <span className="font-bold tabular-nums">{count}</span>
    </span>
  );
}

function BarList({ data, tone }: { data: Record<string, number>; tone: string }) {
  const entries = Object.entries(data).filter(([k]) => k !== 'none').sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map((e) => e[1]));
  if (entries.length === 0) return <div className="text-sm text-slate-400 py-4 text-center">No data yet.</div>;
  return (
    <div className="space-y-3">
      {entries.map(([k, v]) => (
        <div key={k}>
          <div className="mb-1.5 flex justify-between text-xs font-medium">
            <span className="text-slate-700">{titleCase(k)}</span>
            <span className="tabular-nums font-bold text-slate-900">{v}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100">
            <div className={cx('h-1.5 rounded-full transition-all duration-500', tone)} style={{ width: `${(v / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function BarSkeleton() {
  return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-6 animate-pulse rounded-lg bg-slate-100" />)}</div>;
}

