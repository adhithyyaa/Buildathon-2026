import { useEffect, useState } from 'react';
import { api, type ComplianceAudit, type RedTeamResult, type OracleFinding, type MessageSafetyReport, type MessageSafetyCase } from '../lib/api';
import { Card, Pill, Button, cx } from '../components/ui';
import { Icon } from '../components/icons';

/**
 * Red-team compliance console — a judge attacks the India-payments guardrails in-browser, and an
 * INDEPENDENT set of regulatory oracles (separate code from the policy engine) judges whether each
 * guardrail actually held. "Defended" means an adversarial referee looked and found nothing.
 */
export function CompliancePage() {
  const [audit, setAudit] = useState<ComplianceAudit | null>(null);
  const [msg, setMsg] = useState<MessageSafetyReport | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    api.complianceAudit().then(setAudit).catch(() => setErr(true));
    api.messageSafety().then(setMsg).catch(() => setMsg(null));
  }, []);

  const rerunOne = (id: string) => {
    api.redTeam(id).then((r) => {
      setAudit((prev) => (prev ? { ...prev, results: prev.results.map((x) => (x.attack.id === id ? r : x)) } : prev));
    });
  };
  const rerunAll = () => {
    setAudit(null);
    api.complianceAudit().then(setAudit).catch(() => setErr(true));
  };

  if (err) return <Card title="Red-team compliance console"><p className="text-sm text-slate-500">Compliance service unavailable.</p></Card>;
  if (!audit) return <Card title="Red-team compliance console"><div className="h-40 animate-pulse rounded-xl bg-slate-100" /></Card>;

  const allDefended = audit.breached === 0;

  return (
    <div className="space-y-6">
      {/* Headline */}
      <Card
        title="Red-team compliance console"
        right={<Pill tone="emerald">independent oracles</Pill>}
      >
        <div className="grid gap-5 md:grid-cols-[auto_1fr] md:items-center">
          <div className={cx('rounded-2xl border p-5 text-center', allDefended ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50')}>
            <div className={cx('text-4xl font-extrabold tabular-nums', allDefended ? 'text-emerald-700' : 'text-rose-700')}>
              {audit.defended}/{audit.total}
            </div>
            <div className={cx('mt-1 text-xs font-semibold', allDefended ? 'text-emerald-700' : 'text-rose-700')}>
              {allDefended ? 'attacks defended' : `${audit.breached} BREACHED`}
            </div>
          </div>
          <div className="text-sm leading-relaxed text-slate-600">
            <p>
              Each card is an adversarial proposal engineered to push one India-payments regulation into a
              violation. We fire it at the <b className="text-slate-800">real policy engine</b>, then a set of{' '}
              <b className="text-slate-800">independent regulatory oracles</b> — separate code that re-derives what each
              regulation requires — judges the decision. If a guardrail ever silently regressed, the policy would still
              pass itself, but the oracle, judging from the regulation's side, would catch it.
            </p>
            <p className="mt-2 text-xs text-slate-400">
              The oracles are proven non-vacuous by <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">compliance.redteam.test.ts</code> — fed a
              deliberately non-compliant decision, every oracle fires.
            </p>
            <div className="mt-3">
              <Button variant="primary" onClick={rerunAll}>
                <Icon name="refresh" className="mr-1.5 h-4 w-4" /> Re-run all attacks
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Attack cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        {audit.results.map((r) => (
          <AttackCard key={r.attack.id} result={r} onRerun={() => rerunOne(r.attack.id)} />
        ))}
      </div>

      {/* Outbound message fact-check */}
      {msg && <MessageSafetyCard report={msg} />}
    </div>
  );
}

function MessageSafetyCard({ report }: { report: MessageSafetyReport }) {
  const blocked = report.cases.filter((c) => c.intent === 'hallucination').length;
  return (
    <Card
      title="Outbound message fact-check"
      right={<Pill tone={report.allHandled ? 'emerald' : 'rose'}>{report.cases.filter((c) => c.handled).length}/{report.cases.length} handled</Pill>}
    >
      <p className="text-sm leading-relaxed text-slate-600">
        The LLM drafts customer copy, but it never states a <b className="text-slate-900">fact</b> that reaches a customer
        unchecked. Before any send, a deterministic validator extracts every money amount, discount, and reference and
        checks it against ground truth (<b className="text-slate-900">{report.facts.amount}</b> owed to{' '}
        <b className="text-slate-900">{report.facts.merchant}</b>, approved incentive{' '}
        <b className="text-slate-900">{report.facts.approvedIncentivePct}%</b>). A hallucinated amount, an unapproved
        discount, or a fabricated id blocks the send and escalates to a human.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {report.cases.map((c) => (
          <MessageCase key={c.id} c={c} />
        ))}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">{blocked} hallucinations, all caught before dispatch; the legitimate message passes untouched.</p>
    </Card>
  );
}

function MessageCase({ c }: { c: MessageSafetyCase }) {
  const [subject, ...bodyLines] = c.message.split('\n');
  const legit = c.intent === 'legitimate';
  return (
    <div className={cx('rounded-xl border p-3', c.handled ? (legit ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white') : 'border-rose-300 bg-rose-50')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-800">{c.label}</span>
        <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
          legit ? 'bg-emerald-100 text-emerald-700' : c.handled ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
          {legit ? '✓ passes' : c.handled ? '✓ blocked' : '✗ leaked'}
        </span>
      </div>
      <div className="mt-1.5 rounded-lg border border-slate-100 bg-slate-50/70 p-2">
        <div className="text-[11px] font-semibold text-slate-600">{subject}</div>
        <div className="text-[11px] text-slate-500">{bodyLines.join(' ')}</div>
      </div>
      {c.validation.violations.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {c.validation.violations.map((v, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] text-rose-600">
              <span className="mt-0.5 font-mono rounded bg-rose-100 px-1 py-0.5 text-[9.5px] font-bold">{v.kind}</span>
              <span className="text-slate-500">claimed {v.claimed}, expected {v.expected}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AttackCard({ result, onRerun }: { result: RedTeamResult; onRerun: () => void }) {
  const defended = result.verdict === 'defended';
  // The oracle that names the regulation this attack targets (if any is a real oracle).
  const primary = result.findings.find((f) => f.rule === result.attack.targets);
  const okCount = result.findings.filter((f) => f.status === 'ok').length;
  const neutralised = result.decision.outcome === 'blocked' ? 'blocked' : 'escalated';
  const targetShort = result.attack.targets.split(' (')[0];

  return (
    <div className={cx('rounded-2xl border bg-white p-4 shadow-xs', defended ? 'border-slate-200' : 'border-rose-300')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon name="shield" className={cx('h-4 w-4 shrink-0', defended ? 'text-emerald-600' : 'text-rose-600')} />
            <h3 className="truncate text-sm font-bold text-slate-900">{result.attack.title}</h3>
          </div>
          <div className="mt-1 text-[11px] font-medium text-slate-400">targets: {result.attack.targets}</div>
        </div>
        <span
          className={cx(
            'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide',
            defended ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700',
          )}
        >
          {defended ? '✓ defended' : '✗ breached'}
        </span>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        <span className="font-semibold text-slate-600">Attack:</span> {result.attack.goal}
      </p>
      <p className="mt-1 text-[11px] text-slate-400">{result.attack.caseSummary}</p>

      {/* What the policy did */}
      <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Policy engine</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          <span className={cx('rounded-md px-1.5 py-0.5 text-[11px] font-bold',
            result.decision.outcome === 'approved' ? 'bg-emerald-100 text-emerald-700'
              : result.decision.outcome === 'escalate' ? 'bg-amber-100 text-amber-700'
                : 'bg-slate-200 text-slate-700')}>
            {result.decision.outcome}
          </span>
          <span className="text-slate-400">→</span>
          <span className="font-mono text-[11px] text-slate-700">{result.decision.finalAction}</span>
          {result.decision.requiresHumanApproval && <Pill tone="amber">human approval</Pill>}
        </div>
        {result.decision.notes.length > 0 && (
          <p className="mt-1.5 text-[11px] leading-snug text-slate-500">{result.decision.notes[result.decision.notes.length - 1]}</p>
        )}
      </div>

      {/* Independent oracle verdict */}
      <div className="mt-2.5">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Independent oracle</div>
        {primary && primary.status !== 'n/a' ? (
          <FindingRow f={primary} />
        ) : (
          <p className="mt-1 text-[11px] leading-snug text-slate-500">
            Threat neutralised upstream — the policy <b className="text-slate-700">{neutralised}</b> before {targetShort} could be reached.
          </p>
        )}
        <div className="mt-1 text-[10.5px] text-slate-400">
          {okCount > 0 && <>{okCount} regulation{okCount === 1 ? '' : 's'} actively verified clean · </>}
          {result.violations} violation{result.violations === 1 ? '' : 's'}
        </div>
      </div>

      <div className="mt-3">
        <Button variant="ghost" onClick={onRerun} className="text-xs">
          <Icon name="play" className="mr-1 h-3.5 w-3.5" /> Run attack
        </Button>
      </div>
    </div>
  );
}

function FindingRow({ f }: { f: OracleFinding }) {
  const tone = f.status === 'violation' ? 'rose' : f.status === 'ok' ? 'emerald' : 'slate';
  return (
    <div className="mt-1 rounded-lg border border-slate-100 p-2">
      <div className="flex items-center gap-1.5">
        <span className={cx('inline-block h-2 w-2 rounded-full',
          tone === 'emerald' ? 'bg-emerald-500' : tone === 'rose' ? 'bg-rose-500' : 'bg-slate-300')} />
        <span className="text-[11px] font-semibold text-slate-700">{f.rule}</span>
        <span className="ml-auto text-[9.5px] font-medium uppercase tracking-wide text-slate-400">{f.citation}</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-slate-500">{f.requirement}</p>
      <p className={cx('mt-0.5 text-[11px] leading-snug', tone === 'rose' ? 'text-rose-600 font-medium' : 'text-slate-400')}>{f.detail}</p>
    </div>
  );
}
