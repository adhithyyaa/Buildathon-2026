import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type CaseRow, type Metrics } from '../lib/api';
import { formatINR, pctText, titleCase } from '../lib/format';
import { pipelineBuckets, ACTOR_FILL } from '../lib/stages';
import { Card, Stat, Button, cx } from '../components/ui';
import { DemoControls } from '../components/DemoControls';
import { CaseTable } from '../components/CaseTable';

const FILTERS: Array<{ key: string; label: string }> = [
  { key: '', label: 'All' },
  { key: 'at_risk', label: 'At risk' },
  { key: 'waiting_for_outcome', label: 'Waiting' },
  { key: 'manual_escalation', label: 'Escalated' },
  { key: 'recovered', label: 'Recovered' },
  { key: 'expired', label: 'Expired' },
];

export function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, c] = await Promise.all([api.metrics(), api.cases({ state: filter || undefined, limit: 200 })]);
      setMetrics(m);
      setCases(c.cases);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      {/* Hero metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Recovered" tone="emerald" value={metrics ? formatINR(metrics.recoveredPaise) : '—'} sub={metrics ? `${metrics.recoveredCount} of ${metrics.totalCases} cases` : ''} />
        <Stat label="Recovery rate" tone="emerald" value={metrics ? `${metrics.recoveryRatePct}%` : '—'} sub="of at-risk cases" />
        <Stat label="At risk" tone="amber" value={metrics ? formatINR(metrics.grossAtRiskPaise) : '—'} sub="gross exposure" />
        <Stat label="Active cases" tone="sky" value={metrics ? metrics.activeCount : '—'} sub={metrics ? `${metrics.escalatedCount} escalated · ${metrics.expiredCount} expired` : ''} />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MiniStat label="Escalated to human" value={metrics?.escalatedCount ?? '—'} />
        <MiniStat label="Blocked by policy" value={metrics?.blockedActionCount ?? '—'} />
        <MiniStat label="AI JSON validity" value={pctText(metrics?.ai.jsonValidityRatePct ?? null)} sub={metrics ? `${metrics.ai.decisions} AI calls · ${metrics.ai.fallbackCount} fallbacks` : ''} />
        <MiniStat label="Avg time to recover" value={metrics?.avgTimeToRecoveryMin != null ? `${metrics.avgTimeToRecoveryMin}m` : '—'} />
      </div>

      {metrics && <RecoveryImpact m={metrics} />}

      {metrics && <PipelineFlow byState={metrics.byState} />}

      <DemoControls onChanged={load} />

      {/* Breakdowns */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="At-risk by failure reason">{metrics ? <BarList data={metrics.byReason} tone="bg-sky-400" /> : <Skeleton />}</Card>
        <Card title="Chosen recovery action">{metrics ? <BarList data={metrics.byAction} tone="bg-violet-400" /> : <Skeleton />}</Card>
      </div>

      {/* Queue */}
      <Card
        title="Recovery queue"
        right={
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cx(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  filter === f.key ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        }
      >
        {error ? (
          <div className="px-2 py-8 text-center text-sm text-rose-400">
            Couldn’t reach the API. Is the server running on :8787?
            <div className="mt-2"><Button onClick={load}>Retry</Button></div>
          </div>
        ) : loading && !cases ? (
          <Skeleton rows={6} />
        ) : (
          <div className="-mx-5 -mb-5">
            <CaseTable cases={cases ?? []} />
          </div>
        )}
      </Card>
    </div>
  );
}

function RecoveryImpact({ m }: { m: Metrics }) {
  const total = Math.max(1, m.grossAtRiskPaise);
  const seg = (v: number) => `${(v / total) * 100}%`;
  return (
    <Card title="Recovery impact" right={<span className="text-xs text-slate-500">of {formatINR(m.grossAtRiskPaise)} at risk</span>}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
        <div className="bg-emerald-500" style={{ width: seg(m.impact.recoveredPaise) }} title="Recovered" />
        <div className="bg-amber-500/70" style={{ width: seg(m.impact.inProgressPaise) }} title="In progress" />
        <div className="bg-rose-500/70" style={{ width: seg(m.impact.lostPaise) }} title="Lost" />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
        <Legend color="bg-emerald-500" label="Recovered" value={formatINR(m.impact.recoveredPaise)} />
        <Legend color="bg-amber-500/70" label="In progress" value={formatINR(m.impact.inProgressPaise)} />
        <Legend color="bg-rose-500/70" label="Lost (expired)" value={formatINR(m.impact.lostPaise)} />
      </div>
      <p className="mt-3 text-xs text-slate-500">
        With no recovery system this batch brings back <span className="text-slate-300">₹0</span>. Recoup has recovered{' '}
        <span className="font-medium text-emerald-400">{formatINR(m.impact.recoveredPaise)}</span>, with{' '}
        <span className="font-medium text-amber-400">{formatINR(m.impact.inProgressPaise)}</span> still in play.
      </p>
    </Card>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cx('h-2.5 w-2.5 rounded-sm', color)} />
      <span className="text-slate-400">{label}</span>
      <span className="font-medium tabular-nums text-slate-200">{value}</span>
    </span>
  );
}

function PipelineFlow({ byState }: { byState: Record<string, number> }) {
  const { flow, escalated, expired } = pipelineBuckets(byState);
  return (
    <Card title="Recovery pipeline" right={<span className="text-xs text-slate-500">where every case flows</span>}>
      <div className="flex flex-wrap items-center gap-2">
        {flow.map((b, i) => (
          <div key={b.key} className="flex items-center gap-2">
            <div className="min-w-[112px] rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={cx('h-2 w-2 rounded-full', ACTOR_FILL[b.actor])} />
                <span className="text-[11px] uppercase tracking-wide text-slate-400">{b.label}</span>
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-slate-100">{b.count}</div>
            </div>
            {i < flow.length - 1 && <span className="text-slate-600">→</span>}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Branches:</span>
        <BranchChip label="Escalated to human" count={escalated} tone="rose" />
        <BranchChip label="Expired" count={expired} tone="slate" />
        <span className="ml-auto hidden text-[11px] text-slate-500 sm:inline">
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-400 align-middle" />
          AI stages — every suggestion is policy-checked before any action
        </span>
      </div>
    </Card>
  );
}

function BranchChip({ label, count, tone }: { label: string; count: number; tone: 'rose' | 'slate' }) {
  const c =
    tone === 'rose'
      ? 'bg-rose-500/15 text-rose-300 ring-rose-500/30'
      : 'bg-slate-500/15 text-slate-300 ring-slate-500/30';
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset', c)}>
      {label} <span className="font-bold tabular-nums">{count}</span>
    </span>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-200">{value}</div>
      {sub && <div className="text-[11px] text-slate-600">{sub}</div>}
    </div>
  );
}

function BarList({ data, tone }: { data: Record<string, number>; tone: string }) {
  const entries = Object.entries(data)
    .filter(([k]) => k !== 'none')
    .sort((a, b) => b[1] - a[1]);
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

function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-6 animate-pulse rounded bg-slate-800/60" />
      ))}
    </div>
  );
}
