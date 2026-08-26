import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type CaseRow, type LabReport, type Metrics } from '../lib/api';
import { formatINR, titleCase } from '../lib/format';
import { pipelineBuckets, ACTOR_FILL } from '../lib/stages';
import { useRefresh } from '../lib/refresh';
import { Card, Stat, cx } from '../components/ui';
import { Icon } from '../components/icons';
import { CountUp } from '../components/CountUp';

interface Module {
  icon: string;
  name: string;
  blurb: string;
  stat: string;
  to: string;
}

export function Overview() {
  const { version, poll } = useRefresh();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [lab, setLab] = useState<LabReport | null>(null);
  const [recovered, setRecovered] = useState<CaseRow[]>([]);

  useEffect(() => {
    api.metrics().then(setMetrics).catch(() => setMetrics(null));
    api.lab().then(setLab).catch(() => setLab(null));
    api.cases({ state: 'recovered', limit: 6 }).then((r) => setRecovered(r.cases)).catch(() => setRecovered([]));
  }, [version, poll]);

  const lift = lab && lab.totalResolved > 0 ? lab.overall : null;

  const modules: Module[] = [
    { icon: 'bolt', name: 'ML Decisioning', blurb: 'CatBoost scores every case, benchmarked vs XGBoost & Logistic Reg.', stat: metrics ? `${metrics.ml.mlServedRatePct ?? 0}% model-served` : 'CatBoost', to: '/model' },
    { icon: 'shield', name: 'Bounded Policy Engine', blurb: 'ML proposes, a deterministic policy disposes — an allow-listed executor acts.', stat: metrics ? `${metrics.blockedActionCount} blocked` : 'India rules', to: '/pipeline' },
    { icon: 'lab', name: 'Recovery Lab', blurb: 'Incremental ₹ recovered vs a 20% control holdout, with bootstrap CIs.', stat: lift ? `+${lift.liftPct}pp lift` : '20% control', to: '/lab' },
    { icon: 'link', name: 'Signed Webhooks', blurb: 'HMAC-verified deliveries, exactly-once recovery on the money path.', stat: 'exactly-once', to: '/evidence' },
    { icon: 'signal', name: 'Anomaly Detection', blurb: 'Isolation-forest failure-spike detection on live traffic windows.', stat: '~88% detect', to: '/model' },
    { icon: 'receipt', name: 'Real Razorpay Round-trip', blurb: 'A real test-mode capture recovers a case through the production path.', stat: 'verified', to: '/evidence' },
    { icon: 'transfer', name: 'Cross-world Transfer', blurb: 'A frozen model still ranks an independently designed world it never saw.', stat: '~0.68 AUC', to: '/model' },
    { icon: 'audit', name: 'Full Audit Trail', blurb: 'Every state transition is logged: before → after, actor, details.', stat: 'bounded', to: '/queue' },
  ];

  return (
    <div className="space-y-8">
      {/* Essential KPIs only */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Recovered" tone="emerald" value={metrics ? <CountUp value={metrics.recoveredPaise} format={(n) => formatINR(n)} /> : '—'} sub={metrics ? `${metrics.recoveredCount} of ${metrics.totalCases} cases` : ''} />
        <Stat label="Recovery rate" value={metrics ? <CountUp value={metrics.recoveryRatePct} format={(n) => `${Math.round(n)}%`} /> : '—'} sub="of at-risk cases" />
        <Stat label="At-risk exposure" tone="amber" value={metrics ? <CountUp value={metrics.grossAtRiskPaise} format={(n) => formatINR(n)} /> : '—'} sub="gross, this batch" />
        {lift ? (
          <Stat label="Incremental ₹" tone="emerald" value={<CountUp value={lift.incrementalPaise} format={(n) => formatINR(n)} />} sub={`vs control · ${lift.significant ? 'significant' : 'n.s.'}`} />
        ) : (
          <Stat label="Active cases" tone="sky" value={metrics ? <CountUp value={metrics.activeCount} /> : '—'} sub={metrics ? `${metrics.escalatedCount} escalated` : ''} />
        )}
      </div>

      {metrics && <ImpactBar m={metrics} />}

      {/* Modules showcase */}
      <section>
        <SectionHead title="Platform modules" hint="Everything the recovery engine ships" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map((mod, i) => (
            <Link
              key={mod.name}
              to={mod.to}
              style={{ animationDelay: `${i * 50}ms` }}
              className="group flex animate-rise flex-col rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-slate-700 hover:bg-slate-900"
            >
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-800/80 text-emerald-300 ring-1 ring-inset ring-slate-700/60">
                  <Icon name={mod.icon} className="h-[18px] w-[18px]" />
                </span>
                <span className="text-sm font-semibold text-slate-100">{mod.name}</span>
              </div>
              <p className="mt-2.5 flex-1 text-xs leading-relaxed text-slate-400">{mod.blurb}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/25">{mod.stat}</span>
                <span className="text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-400">
                  <Icon name="arrow" className="h-4 w-4" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Pipeline snapshot + recent recoveries */}
      <div className="grid gap-4 lg:grid-cols-2">
        {metrics && <PipelineSnapshot byState={metrics.byState} />}
        <Card
          title="Recent recoveries"
          right={<Link to="/queue" className="text-xs text-slate-400 hover:text-slate-200">View queue →</Link>}
        >
          {recovered.length === 0 ? (
            <p className="text-sm text-slate-500">No recoveries yet — run the pipeline from the Demo menu.</p>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {recovered.map((c) => (
                <Link key={c.id} to={`/cases/${c.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:opacity-80">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-200">{c.merchant.name}</span>
                    <span className="block truncate text-xs text-slate-500">{titleCase(c.reasonTag) || 'recovered'}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-emerald-300">{formatINR(c.outcome?.recoveredAmount ?? c.amount)}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </div>
  );
}

function ImpactBar({ m }: { m: Metrics }) {
  const total = Math.max(1, m.grossAtRiskPaise);
  const seg = (v: number) => `${(v / total) * 100}%`;
  return (
    <Card title="Recovery impact" right={<span className="text-xs text-slate-500">of {formatINR(m.grossAtRiskPaise)} at risk</span>}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
        <div className="bg-emerald-500 transition-[width] duration-700 ease-out" style={{ width: seg(m.impact.recoveredPaise) }} title="Recovered" />
        <div className="bg-amber-500/70 transition-[width] duration-700 ease-out" style={{ width: seg(m.impact.inProgressPaise) }} title="In progress" />
        <div className="bg-rose-500/70 transition-[width] duration-700 ease-out" style={{ width: seg(m.impact.lostPaise) }} title="Lost" />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
        <Legend color="bg-emerald-500" label="Recovered" value={formatINR(m.impact.recoveredPaise)} />
        <Legend color="bg-amber-500/70" label="In progress" value={formatINR(m.impact.inProgressPaise)} />
        <Legend color="bg-rose-500/70" label="Lost (expired)" value={formatINR(m.impact.lostPaise)} />
      </div>
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

function PipelineSnapshot({ byState }: { byState: Record<string, number> }) {
  const { flow } = pipelineBuckets(byState);
  return (
    <Card title="Pipeline" right={<Link to="/pipeline" className="text-xs text-slate-400 hover:text-slate-200">View pipeline →</Link>}>
      <div className="flex items-center justify-between gap-1">
        {flow.map((b, i) => (
          <div key={b.key} className="flex flex-1 items-center gap-1">
            <div className="flex-1 rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-2 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <span className={cx('h-1.5 w-1.5 rounded-full', ACTOR_FILL[b.actor])} />
                <span className="text-[10px] uppercase tracking-wide text-slate-500">{b.label}</span>
              </div>
              <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-100"><CountUp value={b.count} /></div>
            </div>
            {i < flow.length - 1 && <span className="text-slate-600">→</span>}
          </div>
        ))}
      </div>
    </Card>
  );
}
