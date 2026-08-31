import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type CaseRow, type Funnel, type ImpactSeries, type LabReport, type Metrics, type ReasonBreakdownRow } from '../lib/api';
import { formatINR, titleCase } from '../lib/format';
import { useRefresh } from '../lib/refresh';
import { Card, Stat, cx } from '../components/ui';
import { Icon } from '../components/icons';
import { CountUp } from '../components/CountUp';
import { ImpactChart } from '../components/ImpactChart';
import { BusinessCasePanel } from '../components/BusinessCasePanel';

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
  const [impact, setImpact] = useState<ImpactSeries | null>(null);
  const [recovered, setRecovered] = useState<CaseRow[]>([]);

  useEffect(() => {
    api.metrics().then(setMetrics).catch(() => setMetrics(null));
    api.lab().then(setLab).catch(() => setLab(null));
    api.impact().then(setImpact).catch(() => setImpact(null));
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

      {/* Flagship: measured counterfactual impact */}
      {impact && impact.series.length >= 2 ? (
        <Card
          title="Measured impact — with Sentinel vs without"
          right={
            <span className="flex items-center gap-4 text-[11px] font-semibold">
              <span className="flex items-center gap-1.5 text-slate-600"><span className="h-0.5 w-5 rounded bg-emerald-500" /> Recovered (actual)</span>
              <span className="flex items-center gap-1.5 text-slate-500"><span className="h-0 w-5 border-t-2 border-dashed border-slate-500" /> Without Sentinel (control-measured)</span>
            </span>
          }
        >
          <ImpactChart data={impact} />
          <p className="mt-2 text-[11px] font-medium leading-relaxed text-slate-400">
            Cash actually banked across the failure timeline, vs the control arm's <b className="text-slate-600">measured</b>{' '}
            {impact.controlRatePct != null ? `${impact.controlRatePct}% ` : ''}recovery rate applied to the same failures — a randomized holdout, not an estimate.
            The Incremental ₹ Lift KPI projects this lift over the full at-risk book; this chart counts only recovered cash.
            {impact.events.length > 0 && (
              <>
                {' '}Markers: <span className="text-amber-600 font-semibold">● failure-spike incidents</span> · <span className="text-teal-600 font-semibold">● model loads</span>.
              </>
            )}
          </p>
        </Card>
      ) : (
        metrics && metrics.totalCases > 0 && (
          <Card title="Measured impact — with Sentinel vs without">
            <p className="py-6 text-center text-sm text-slate-400">
              Resolve outcomes (Demo menu → Resolve outcomes) to draw the measured counterfactual — cumulative recovered ₹ vs the control baseline.
            </p>
          </Card>
        )
      )}

      {/* Business case — ROI grounded in the measured lift + our cost model */}
      <BusinessCasePanel lab={lab} />

      {/* Funnel + failure-reason intelligence */}
      <div className="grid gap-6 lg:grid-cols-2">
        {metrics && <RecoveryFunnel funnel={metrics.funnel} />}
        {metrics && metrics.reasons.length > 0 && <FailureReasons rows={metrics.reasons} />}
      </div>

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

      {/* Recent recoveries */}
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

/**
 * Cumulative recovery funnel (Stripe-style tri-state tail): each stage counts cases that ever
 * reached it; the terminal row splits Attempted into In recovery / Recovered / Lost.
 */
function RecoveryFunnel({ funnel }: { funnel: Funnel }) {
  const stages = [
    { key: 'detected', label: 'Detected', stage: funnel.detected, tone: 'bg-slate-700' },
    { key: 'decided', label: 'Decided', stage: funnel.decided, tone: 'bg-teal-500' },
    { key: 'attempted', label: 'Attempted', stage: funnel.attempted, tone: 'bg-sky-500' },
    { key: 'recovered', label: 'Recovered', stage: funnel.recovered, tone: 'bg-emerald-500' },
  ];
  const max = Math.max(1, funnel.detected.count);
  const dropAfter = (i: number): string | null => {
    if (i === 0) {
      const d = funnel.detected.count - funnel.decided.count;
      if (d <= 0) return null;
      return `−${d} · incl. ${funnel.controlHeld.count} control-held (the experiment)`;
    }
    if (i === 1) {
      const d = funnel.decided.count - funnel.attempted.count;
      if (d <= 0) return null;
      return `−${d} · policy-blocked, no-action or escalated`;
    }
    if (i === 2) {
      const d = funnel.attempted.count - funnel.recovered.count - funnel.inRecovery.count;
      if (d <= 0) return null;
      return `−${d} · expired after attempts`;
    }
    return null;
  };

  return (
    <Card
      title="Recovery funnel"
      right={<Link to="/app/pipeline" className="text-xs font-semibold text-slate-500 hover:text-slate-900">View pipeline →</Link>}
    >
      <div className="space-y-1">
        {stages.map((s, i) => (
          <div key={s.key}>
            <div className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-500">{s.label}</span>
              <div className="relative h-7 flex-1 overflow-hidden rounded-lg bg-slate-100">
                <div
                  className={cx('h-full rounded-lg transition-[width] duration-700 ease-out', s.tone)}
                  style={{ width: `${Math.max(2.5, (s.stage.count / max) * 100)}%` }}
                />
                <span className="absolute inset-y-0 left-2.5 flex items-center gap-2 text-[11px] font-bold text-white mix-blend-luminosity drop-shadow-sm">
                  <CountUp value={s.stage.count} />
                </span>
              </div>
              <span className="w-20 shrink-0 text-right text-[11px] font-bold tabular-nums text-slate-700">{formatINR(s.stage.paise)}</span>
            </div>
            {dropAfter(i) && (
              <div className="ml-24 py-0.5 text-[10.5px] font-medium text-slate-400">↓ {dropAfter(i)}</div>
            )}
          </div>
        ))}
      </div>
      {/* Terminal tri-state of attempted work */}
      <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-slate-100 pt-3 text-[11px] font-semibold">
        <Link to="/app/queue?state=recovered" className="flex items-center gap-1.5 text-emerald-700 hover:opacity-80"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Recovered {funnel.recovered.count}</Link>
        <span className="flex items-center gap-1.5 text-amber-700"><span className="h-2 w-2 rounded-full bg-amber-400" /> In recovery {funnel.inRecovery.count}</span>
        <Link to="/app/queue?state=expired" className="flex items-center gap-1.5 text-rose-700 hover:opacity-80"><span className="h-2 w-2 rounded-full bg-rose-400" /> Lost {funnel.lost.count} ({formatINR(funnel.lost.paise)})</Link>
        <Link to="/app/lab" className="ml-auto text-[10.5px] font-medium text-slate-400 hover:text-slate-600">control outcomes → Recovery Lab</Link>
      </div>
    </Card>
  );
}

const FAULT_TONES: Record<ReasonBreakdownRow['faultOwner'], string> = {
  customer: 'bg-sky-50 text-sky-700 ring-sky-200/60',
  bank: 'bg-teal-50 text-teal-700 ring-teal-200/60',
  business: 'bg-amber-50 text-amber-700 ring-amber-200/60',
  other: 'bg-slate-100 text-slate-600 ring-slate-200/60',
};

const PATH_META: Record<ReasonBreakdownRow['path'], { label: string; tone: string }> = {
  auto_retry: { label: 'auto-retry', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200/60' },
  fresh_link: { label: 'fresh link', tone: 'bg-sky-50 text-sky-700 ring-sky-200/60' },
  do_not_touch: { label: 'RBI TAT — no action', tone: 'bg-rose-50 text-rose-700 ring-rose-200/60' },
};

/** Failure reasons in Razorpay's fault taxonomy, each tagged with the recovery path policy allows. */
function FailureReasons({ rows }: { rows: ReasonBreakdownRow[] }) {
  const top = rows.slice(0, 6);
  return (
    <Card title="Failure reasons" right={<span className="text-xs font-medium text-slate-400">fault owner · recovery path</span>}>
      <div className="space-y-3">
        {top.map((r) => {
          const rate = r.atRiskPaise > 0 ? (r.recoveredPaise / r.atRiskPaise) * 100 : 0;
          return (
            <Link key={r.reason} to={`/app/queue?reason=${r.reason}`} className="block rounded-lg transition-opacity hover:opacity-80" title={`View ${titleCase(r.reason)} cases`}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-slate-800">{titleCase(r.reason)}</span>
                <span className={cx('rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset', FAULT_TONES[r.faultOwner])}>{r.faultOwner}</span>
                <span className={cx('rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset', PATH_META[r.path].tone)}>{PATH_META[r.path].label}</span>
                <span className="ml-auto text-[11px] font-bold tabular-nums text-slate-600">
                  {r.recoveredCases}/{r.cases} · {formatINR(r.recoveredPaise)}
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100" title={`${Math.round(rate)}% of ${formatINR(r.atRiskPaise)} recovered`}>
                <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-700 ease-out" style={{ width: `${Math.min(100, rate)}%` }} />
              </div>
            </Link>
          );
        })}
      </div>
      <p className="mt-3 border-t border-slate-100 pt-2.5 text-[10.5px] font-medium leading-relaxed text-slate-400">
        Taxonomy follows Razorpay SR analytics (customer / bank / business / other). The path tag is what the policy engine allows — a
        debited-pending-reversal is never re-charged (RBI TAT auto-reversal).
      </p>
    </Card>
  );
}
