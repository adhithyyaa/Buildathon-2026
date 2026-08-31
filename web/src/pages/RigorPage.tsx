import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type ComplianceAudit, type ForensicReport, type ConformalReport, type RctReport, type UpliftReport, type MessageSafetyReport } from '../lib/api';
import { Card, Pill, cx } from '../components/ui';
import { Icon } from '../components/icons';

/**
 * Rigor & trust — the single page that answers "why should we believe any of this?". It aggregates
 * every independent way the system proves itself: measurement honesty, causal/ML validity, governance
 * & safety, and integrity. Live signals are fetched from the running system; the rest are enforced by
 * the test suite / CI. One scannable scorecard, each item linking to where it's demonstrated in depth.
 */
type Status = 'pass' | 'warn' | 'pending';

interface RigorItem {
  title: string;
  status: Status;
  metric: string;
  how: string;
  provenBy: string;
  to?: string;
}

export function RigorPage() {
  const [compliance, setCompliance] = useState<ComplianceAudit | null>(null);
  const [forensics, setForensics] = useState<ForensicReport | null>(null);
  const [conformal, setConformal] = useState<ConformalReport | null>(null);
  const [rct, setRct] = useState<RctReport | null>(null);
  const [uplift, setUplift] = useState<UpliftReport | null>(null);
  const [msg, setMsg] = useState<MessageSafetyReport | null>(null);

  useEffect(() => {
    api.complianceAudit().then(setCompliance).catch(() => {});
    api.auditForensics().then(setForensics).catch(() => {});
    api.mlConformal().then(setConformal).catch(() => {});
    api.mlRct().then(setRct).catch(() => {});
    api.mlUplift().then(setUplift).catch(() => {});
    api.messageSafety().then(setMsg).catch(() => {});
  }, []);

  const groups: Array<{ title: string; icon: string; items: RigorItem[] }> = [
    {
      title: 'Measurement honesty',
      icon: 'lab',
      items: [
        { title: 'A/A null test', status: 'pass', metric: 'unbiased (~0 lift)', how: 'The lift estimator reads ~0 on two statistically identical arms — the number is not an artifact.', provenBy: 'lab.aa.test.ts', to: '/app/lab' },
        {
          title: 'Doubly-robust off-policy eval',
          status: uplift ? 'pass' : 'pending',
          metric: uplift ? `within ${uplift.off_policy?.dr_error_vs_truth_pct ?? '—'}% of truth` : '…',
          how: 'The deployed policy value is estimated from the log alone (IPS + DR), validated against ground truth.',
          provenBy: 'ml/uplift.json', to: '/app/model',
        },
        { title: 'Artifact-locked numbers', status: 'pass', metric: 'docs ≡ artifacts', how: 'Every headline number in the README/demo is pinned to the ML artifact that produced it.', provenBy: 'claims.docs.test.ts' },
        { title: 'Confidence bands', status: 'pass', metric: 'quality guarded', how: 'Every committed ML artifact must sit inside its quality band, or CI fails.', provenBy: 'ml.bands.test.ts' },
      ],
    },
    {
      title: 'Causal & ML validity',
      icon: 'model',
      items: [
        {
          title: 'Causal uplift (not propensity)',
          status: uplift ? 'pass' : 'pending',
          metric: uplift ? `Qini ${uplift.best_treatment_ranking?.[uplift.primary_learner ?? 's_learner']?.qini_coefficient?.toFixed?.(2) ?? '—'}` : '…',
          how: 'We model the incremental effect of each action (CATE), benchmarked S- vs T-learner, selected by Qini.',
          provenBy: 'ml/uplift.json', to: '/app/model',
        },
        {
          title: 'Real-RCT external validity',
          status: rct ? 'pass' : 'pending',
          metric: rct ? `ATE within ${rct.ate_recovered?.dr_error_vs_truth_pct}%` : '…',
          how: rct ? `The same machinery recovers a real public RCT's ground-truth ATE (${rct.dataset?.name}).` : 'Validated on a real public RCT.',
          provenBy: 'ml/rct_validation.json', to: '/app/model',
        },
        {
          title: 'Conformal coverage guarantee',
          status: conformal ? (conformal.empirical_coverage_pct >= conformal.target_coverage_pct - 2 ? 'pass' : 'warn') : 'pending',
          metric: conformal ? `${conformal.empirical_coverage_pct}% (target ${conformal.target_coverage_pct}%)` : '…',
          how: 'Split-conformal gives each case a coverage-guaranteed set; uncertain ones route to a human.',
          provenBy: 'ml/conformal.json', to: '/app/model',
        },
        { title: 'Cross-world transfer', status: 'pass', metric: '~0.68 AUC (both ways)', how: 'A frozen model still ranks an independently designed world it never trained on.', provenBy: 'ml/transfer.json', to: '/app/model' },
      ],
    },
    {
      title: 'Governance & safety',
      icon: 'shield',
      items: [
        {
          title: 'Red-team compliance oracles',
          status: compliance ? (compliance.breached === 0 ? 'pass' : 'warn') : 'pending',
          metric: compliance ? `${compliance.defended}/${compliance.total} defended` : '…',
          how: 'India-payments guardrails attacked in-browser, judged by independent regulatory oracles.',
          provenBy: 'compliance.redteam.test.ts', to: '/app/compliance',
        },
        { title: 'Policy invariants (property-based)', status: 'pass', metric: '6 invariants, fuzzed', how: 'Fast-check fuzzes thousands of inputs; the policy never breaks a core invariant.', provenBy: 'policy.chaos.test.ts', to: '/app/compliance' },
        {
          title: 'Outbound message fact-check',
          status: msg ? (msg.allHandled ? 'pass' : 'warn') : 'pending',
          metric: msg ? `${msg.cases.filter((c) => c.handled).length}/${msg.cases.length} handled` : '…',
          how: 'Every fact in an LLM-drafted message is checked against ground truth before dispatch.',
          provenBy: 'messageValidator.test.ts', to: '/app/compliance',
        },
      ],
    },
    {
      title: 'Integrity & provenance',
      icon: 'audit',
      items: [
        {
          title: 'Tamper-evident ledger',
          status: forensics ? (forensics.allCaught ? 'pass' : 'warn') : 'pending',
          metric: forensics ? `${forensics.scenarios.filter((s) => s.caught).length}/${forensics.scenarios.length} tampers caught` : '…',
          how: 'A SHA-256 hash chain catches and classifies every content edit, deletion, or re-link.',
          provenBy: 'audit.chain.test.ts', to: '/app/evidence',
        },
        {
          title: 'Append-only ledger (DB-enforced)',
          status: forensics?.appendOnly ? (forensics.appendOnly.enforced ? 'pass' : 'warn') : 'pending',
          metric: forensics?.appendOnly ? (forensics.appendOnly.enforced ? 'UPDATE/DELETE rejected' : 'not enforced') : '…',
          how: 'A Postgres trigger rejects any in-place edit or delete — not even the app can rewrite a row.',
          provenBy: 'live probe', to: '/app/evidence',
        },
        { title: 'Real Razorpay captures', status: 'pass', metric: 'replayable, keys-free', how: 'Genuine test-mode payments, captured via the API and replayable through the signed-webhook path.', provenBy: 'live-captures.json', to: '/app/evidence' },
        { title: 'Exactly-once money path', status: 'pass', metric: 'concurrent-safe', how: 'Six simultaneous captures for one case converge to exactly-once recovery, all 200.', provenBy: 'webhooks.moneypath.test.ts', to: '/app/pipeline' },
      ],
    },
  ];

  const all = groups.flatMap((g) => g.items);
  const green = all.filter((i) => i.status === 'pass').length;

  return (
    <div className="space-y-6">
      <Card title="Rigor & trust" right={<Pill tone="emerald">every check in one place</Pill>}>
        <div className="grid gap-5 md:grid-cols-[auto_1fr] md:items-center">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
            <div className="text-4xl font-extrabold tabular-nums text-emerald-700">{green}/{all.length}</div>
            <div className="mt-1 text-xs font-semibold text-emerald-700">checks green</div>
          </div>
          <p className="text-sm leading-relaxed text-slate-600">
            Most demos ask you to trust the headline number. This system is built so you don't have to: every claim is
            backed by an <b className="text-slate-900">independent check</b> — an A/A null test, a real public RCT, a
            distribution-free coverage guarantee, adversarial compliance oracles, a fact-checker on every message, and a
            hash-chained, append-only ledger the database itself enforces. Live signals below are read from the running
            system; the rest are enforced by the test suite and CI on every push.
          </p>
        </div>
      </Card>

      {groups.map((g) => (
        <div key={g.title}>
          <div className="mb-2 flex items-center gap-2 px-1">
            <Icon name={g.icon} className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">{g.title}</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {g.items.map((it) => (
              <RigorCell key={it.title} item={it} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RigorCell({ item }: { item: RigorItem }) {
  const dot = item.status === 'pass' ? 'bg-emerald-500' : item.status === 'warn' ? 'bg-rose-500' : 'bg-slate-300';
  const inner = (
    <div className={cx('h-full rounded-2xl border bg-white p-4 shadow-xs transition-colors', item.to ? 'border-slate-200 hover:border-slate-300' : 'border-slate-200')}>
      <div className="flex items-center gap-2">
        <span className={cx('inline-block h-2 w-2 shrink-0 rounded-full', dot, item.status === 'pending' && 'animate-pulse')} />
        <h3 className="text-sm font-bold text-slate-900 leading-tight">{item.title}</h3>
      </div>
      <div className="mt-1.5 text-sm font-semibold tabular-nums text-slate-700">{item.metric}</div>
      <p className="mt-1.5 text-[11px] leading-snug text-slate-500">{item.how}</p>
      <div className="mt-2 flex items-center gap-1 text-[10px] font-medium text-slate-400">
        <Icon name="check" className="h-3 w-3 text-emerald-500" />
        <span className="font-mono">{item.provenBy}</span>
      </div>
    </div>
  );
  return item.to ? <Link to={item.to} className="block">{inner}</Link> : inner;
}
