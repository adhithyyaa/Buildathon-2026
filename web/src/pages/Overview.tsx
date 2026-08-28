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
    { icon: 'bolt', name: 'ML Decisioning', blurb: 'CatBoost scores every case, benchmarked vs XGBoost & Logistic Reg.', stat: metrics ? `${metrics.ml.mlServedRatePct ?? 0}% model-served` : 'CatBoost', to: '/app/model' },
    { icon: 'shield', name: 'Bounded Policy Engine', blurb: 'ML proposes, a deterministic policy disposes — an allow-listed executor acts.', stat: metrics ? `${metrics.blockedActionCount} blocked` : 'India rules', to: '/app/pipeline' },
    { icon: 'lab', name: 'Recovery Lab', blurb: 'Incremental ₹ recovered vs a 20% control holdout, with bootstrap CIs.', stat: lift ? `+${lift.liftPct}pp lift` : '20% control', to: '/app/lab' },
    { icon: 'link', name: 'Signed Webhooks', blurb: 'HMAC-verified deliveries, exactly-once recovery on the money path.', stat: 'exactly-once', to: '/app/evidence' },
    { icon: 'signal', name: 'Anomaly Detection', blurb: 'Isolation-forest failure-spike detection on live traffic windows.', stat: '~88% detect', to: '/app/model' },
    { icon: 'receipt', name: 'Real Razorpay Round-trip', blurb: 'A real test-mode capture recovers a case through the production path.', stat: 'verified', to: '/app/evidence' },
    { icon: 'transfer', name: 'Cross-world Transfer', blurb: 'A frozen model still ranks an independently designed world it never saw.', stat: '~0.68 AUC', to: '/app/model' },
    { icon: 'audit', name: 'Full Audit Trail', blurb: 'Every state transition is logged: before → after, actor, details.', stat: 'bounded', to: '/app/queue' },
  ];

  return (
    <div className="space-y-6">
      {/* Essential KPIs only matching reference */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Total Recovered"
          tone="emerald"
          value={metrics ? <CountUp value={metrics.recoveredPaise} format={(n) => formatINR(n)} /> : '—'}
          sub={metrics ? `from ${metrics.recoveredCount} of ${metrics.totalCases} cases` : 'Recovered this batch'}
        />
        <Stat
          label="Recovery rate"
          value={metrics ? <CountUp value={metrics.recoveryRatePct} format={(n) => `${Math.round(n)}%`} /> : '—'}
          sub="of at-risk failed payments"
        />
        <Stat
          label="At-risk exposure"
          tone="amber"
          value={metrics ? <CountUp value={metrics.grossAtRiskPaise} format={(n) => formatINR(n)} /> : '—'}
          sub="gross batch exposure"
        />
        {lift ? (
          <Stat
            label="Incremental ₹ Lift"
            tone="emerald"
            value={<CountUp value={lift.incrementalPaise} format={(n) => formatINR(n)} />}
            sub={`vs control holdout (${lift.significant ? 'significant' : 'n.s.'})`}
            trend={`${lift.liftPct > 0 ? '+' : ''}${lift.liftPct}pp`}
          />
        ) : (
          <Stat
            label="Active cases"
            tone="sky"
            value={metrics ? <CountUp value={metrics.activeCount} /> : '—'}
            sub={metrics ? `${metrics.escalatedCount} escalated to review` : 'In progress'}
          />
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
              style={{ animationDelay: `${i * 40}ms` }}
              className="group flex animate-rise flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
            >
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-900 ring-1 ring-inset ring-slate-200/60 shadow-2xs">
                  <Icon name={mod.icon} className="h-[18px] w-[18px]" />
                </span>
                <span className="text-sm font-bold text-slate-900">{mod.name}</span>
              </div>
              <p className="mt-2.5 flex-1 text-xs leading-relaxed text-slate-500">{mod.blurb}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200/60">{mod.stat}</span>
                <span className="text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-700">
                  <Icon name="arrow" className="h-4 w-4" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Pipeline snapshot + recent recoveries */}
      <div className="grid gap-6 lg:grid-cols-2">
        {metrics && <PipelineSnapshot byState={metrics.byState} />}
        <Card
          title="Recent recoveries"
          right={<Link to="/app/queue" className="text-xs font-semibold text-slate-500 hover:text-slate-900">View all →</Link>}
        >
          {recovered.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No recoveries yet — run the pipeline from the Demo menu.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recovered.map((c) => (
                <Link key={c.id} to={`/app/cases/${c.id}`} className="flex items-center justify-between gap-3 py-3 text-sm hover:opacity-80 transition-opacity">
                  <div className="min-w-0">
                    <span className="block truncate font-semibold text-slate-900">{c.merchant.name}</span>
                    <span className="block truncate text-xs text-slate-400">{titleCase(c.reasonTag) || 'Subscription recovery'}</span>
                  </div>
                  <span className="shrink-0 font-bold tabular-nums text-emerald-600">{formatINR(c.outcome?.recoveredAmount ?? c.amount)}</span>
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
      <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      {hint && <span className="text-xs text-slate-400 font-medium">{hint}</span>}
    </div>
  );
}

function ImpactBar({ m }: { m: Metrics }) {
  const total = Math.max(1, m.grossAtRiskPaise);
  const seg = (v: number) => `${(v / total) * 100}%`;
  return (
    <Card title="Recovery impact" right={<span className="text-xs font-medium text-slate-400">of {formatINR(m.grossAtRiskPaise)} at risk</span>}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="bg-emerald-500 transition-[width] duration-700 ease-out" style={{ width: seg(m.impact.recoveredPaise) }} title="Recovered" />
        <div className="bg-amber-400 transition-[width] duration-700 ease-out" style={{ width: seg(m.impact.inProgressPaise) }} title="In progress" />
        <div className="bg-rose-400 transition-[width] duration-700 ease-out" style={{ width: seg(m.impact.lostPaise) }} title="Lost" />
      </div>
      <div className="mt-3.5 flex flex-wrap gap-x-6 gap-y-1.5 text-xs">
        <Legend color="bg-emerald-500" label="Recovered" value={formatINR(m.impact.recoveredPaise)} />
        <Legend color="bg-amber-400" label="In progress" value={formatINR(m.impact.inProgressPaise)} />
        <Legend color="bg-rose-400" label="Lost (expired)" value={formatINR(m.impact.lostPaise)} />
      </div>
    </Card>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cx('h-2.5 w-2.5 rounded-sm', color)} />
      <span className="text-slate-500 font-medium">{label}</span>
      <span className="font-bold tabular-nums text-slate-800">{value}</span>
    </span>
  );
}

function PipelineSnapshot({ byState }: { byState: Record<string, number> }) {
  const { flow } = pipelineBuckets(byState);
  return (
    <Card title="Pipeline" right={<Link to="/app/pipeline" className="text-xs font-semibold text-slate-500 hover:text-slate-900">View pipeline →</Link>}>
      <div className="flex items-center justify-between gap-1.5">
        {flow.map((b, i) => (
          <div key={b.key} className="flex flex-1 items-center gap-1.5">
            <div className="flex-1 rounded-xl border border-slate-100 bg-slate-50/60 px-2.5 py-2.5 text-center shadow-2xs">
              <div className="flex items-center justify-center gap-1.5">
                <span className={cx('h-1.5 w-1.5 rounded-full', ACTOR_FILL[b.actor])} />
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">{b.label}</span>
              </div>
              <div className="mt-1 text-lg font-bold tabular-nums text-slate-900"><CountUp value={b.count} /></div>
            </div>
            {i < flow.length - 1 && <span className="text-slate-300 font-bold">→</span>}
          </div>
        ))}
      </div>
    </Card>
  );
}
