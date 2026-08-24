import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type CaseDetail } from '../lib/api';
import { formatINR, titleCase, timeAgo } from '../lib/format';
import { Card, Button, StateBadge, ActionBadge, Pill, cx } from '../components/ui';
import { AuditTimeline } from '../components/AuditTimeline';
import { StageTracker } from '../components/StageTracker';

function last<T>(arr: T[]): T | undefined {
  return arr.length ? arr[arr.length - 1] : undefined;
}

export function CasePage() {
  const { id } = useParams();
  const [data, setData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.caseDetail(id);
      setData(r.case);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <div className="py-16 text-center text-slate-500">Loading case…</div>;
  if (error) return <div className="py-16 text-center text-rose-400">Error: {error}</div>;
  if (!data || !id) return null;

  const decision = last(data.decisions) ?? null;
  const diag = decision?.rawOutput?.diagnosis as
    | { reason_category?: string; recovery_probability?: number; is_auto_retriable?: boolean; rationale?: string }
    | undefined;
  const lastAction = last(data.actions) ?? null;
  const linkAction = [...data.actions].reverse().find((a) => a.paymentLinkUrl);
  const policyEval = [...data.auditLogs].reverse().find((l) => l.step === 'policy_eval');
  const policyOutcome = policyEval?.details?.outcome as string | undefined;

  return (
    <div className="space-y-5">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        ← Recovery queue
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-100">{data.merchant.name}</h1>
            <StateBadge state={data.state} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-400">
            <span className="text-lg font-semibold text-slate-200">{formatINR(data.amount)}</span>
            <span>·</span>
            <span>{titleCase(data.reasonTag)}</span>
            <span>·</span>
            <span>{data.event.method ?? data.event.eventType}</span>
            <span>·</span>
            <span>risk {data.riskScore} / urgency {data.urgencyScore}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.state === 'at_risk' && (
            <Button variant="primary" disabled={busy} onClick={() => act(() => api.runCase(id))}>
              {busy ? 'Running…' : 'Run pipeline'}
            </Button>
          )}
          {data.state === 'manual_escalation' && (
            <Button variant="primary" disabled={busy} onClick={() => act(() => api.approveCase(id))}>
              {busy ? 'Approving…' : 'Approve & recover'}
            </Button>
          )}
          {linkAction?.paymentLinkUrl && data.state !== 'recovered' && (
            <Button onClick={() => window.open(linkAction.paymentLinkUrl!, '_blank')}>Open payment link ↗</Button>
          )}
          <Button variant="ghost" disabled={busy} onClick={load}>Refresh</Button>
        </div>
      </div>

      <StageTracker state={data.state} />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left: the decision story */}
        <div className="space-y-5 lg:col-span-2">
          <Card
            title="AI decision"
            right={decision ? <Pill tone={decision.usedFallback ? 'slate' : 'sky'}>{decision.usedFallback ? 'Deterministic fallback' : `Claude · ${decision.model}`}</Pill> : null}
          >
            {!decision ? (
              <p className="text-sm text-slate-500">Not analyzed yet. Run the pipeline to generate a decision.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <ActionBadge action={decision.action} />
                  {decision.confidence != null && (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 rounded-full bg-slate-800">
                        <div className="h-1.5 rounded-full bg-sky-400" style={{ width: `${Math.round((decision.confidence ?? 0) * 100)}%` }} />
                      </div>
                      <span className="text-xs text-slate-400">{Math.round((decision.confidence ?? 0) * 100)}% confidence</span>
                    </div>
                  )}
                  {decision.requiresHumanApproval && <Pill tone="amber">Needs human approval</Pill>}
                </div>
                {decision.reason && <p className="text-sm text-slate-300">{decision.reason}</p>}
                {diag && (
                  <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-4 sm:grid-cols-4">
                    <KeyVal k="Diagnosis" v={titleCase(diag.reason_category)} />
                    <KeyVal k="Recovery prob." v={diag.recovery_probability != null ? `${Math.round(diag.recovery_probability * 100)}%` : '—'} />
                    <KeyVal k="Auto-retriable" v={diag.is_auto_retriable ? 'Yes' : 'No'} />
                    <KeyVal k="Latency" v={decision.latencyMs != null ? `${decision.latencyMs}ms` : '—'} />
                    {diag.rationale && <div className="col-span-2 sm:col-span-4"><KeyVal k="Rationale" v={diag.rationale} /></div>}
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card
            title="Policy check"
            right={policyOutcome ? <Pill tone={policyOutcome === 'approved' ? 'emerald' : policyOutcome === 'blocked' ? 'rose' : 'amber'}>{titleCase(policyOutcome)}</Pill> : null}
          >
            {policyEval?.details?.notes && Array.isArray(policyEval.details.notes) && policyEval.details.notes.length ? (
              <ul className="space-y-1.5">
                {policyEval.details.notes.map((n: string, i: number) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-300">
                    <span className="text-slate-600">›</span>
                    {n}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No policy evaluation yet.</p>
            )}
          </Card>

          {lastAction && (
            <Card title="Action taken">
              <div className="flex flex-wrap items-center gap-3">
                <ActionBadge action={lastAction.actionType} />
                <Pill tone="slate">{lastAction.channel}</Pill>
                <Pill tone={lastAction.status === 'succeeded' ? 'emerald' : lastAction.status === 'blocked' ? 'rose' : 'sky'}>{titleCase(lastAction.status)}</Pill>
                {lastAction.deliveryStatus && <span className="text-xs text-slate-500">delivery: {lastAction.deliveryStatus}</span>}
                {lastAction.incentivePct > 0 && <Pill tone="amber">{lastAction.incentivePct}% incentive</Pill>}
              </div>
              {lastAction.paymentLinkUrl && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                  <span className="truncate text-xs text-sky-300">{lastAction.paymentLinkUrl}</span>
                  <Button variant="ghost" className="ml-auto" onClick={() => window.open(lastAction.paymentLinkUrl!, '_blank')}>Open ↗</Button>
                </div>
              )}
              {lastAction.messageContent && (
                <div className="mt-3">
                  <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">Drafted message</div>
                  <pre className="whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-300">{lastAction.messageContent}</pre>
                </div>
              )}
            </Card>
          )}
        </div>

        {/* Right: facts, outcome, audit */}
        <div className="space-y-5">
          {data.outcome?.status === 'recovered' ? (
            <Card title="Outcome">
              <div className="text-3xl font-bold text-emerald-300">{formatINR(data.outcome.recoveredAmount)}</div>
              <div className="mt-1 text-sm text-emerald-400/80">Recovered {data.outcome.recoveryMinutes != null ? `in ${data.outcome.recoveryMinutes} min` : ''}</div>
              {data.outcome.notes && <div className="mt-1 text-xs text-slate-500">{data.outcome.notes}</div>}
            </Card>
          ) : (
            <Card title="Outcome">
              <div className="text-sm text-slate-400">Not recovered yet · <StateBadge state={data.state} /></div>
            </Card>
          )}

          <Card title="Case facts">
            <dl className="grid grid-cols-2 gap-y-2.5 text-sm">
              <KeyVal k="Reason" v={titleCase(data.reasonTag)} />
              <KeyVal k="Method" v={data.event.method ?? '—'} />
              <KeyVal k="Channel" v={data.event.channel ?? '—'} />
              <KeyVal k="Attempts" v={data.attempts} />
              <KeyVal k="Risk" v={data.riskScore} />
              <KeyVal k="Urgency" v={data.urgencyScore} />
              <KeyVal k="Recovery prob." v={data.recoveryProbability != null ? `${Math.round(data.recoveryProbability * 100)}%` : '—'} />
              <KeyVal k="Opened" v={timeAgo(data.createdAt)} />
            </dl>
          </Card>

          <Card title="Customer">
            {data.customer ? (
              <dl className="grid grid-cols-2 gap-y-2.5 text-sm">
                <KeyVal k="Name" v={data.customer.name ?? '—'} />
                <KeyVal k="Opted out" v={data.customer.optedOut ? 'Yes' : 'No'} />
                <KeyVal k="Prior pays" v={data.customer.priorPayments} />
                <KeyVal k="Prior conv." v={data.customer.priorConversions} />
                <div className="col-span-2"><KeyVal k="Email" v={data.customer.email ?? '—'} /></div>
              </dl>
            ) : (
              <p className="text-sm text-slate-500">Guest checkout (no profile).</p>
            )}
          </Card>

          <Card title="Audit trail">
            <AuditTimeline logs={data.auditLogs} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function KeyVal({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{k}</dt>
      <dd className={cx('text-slate-200', typeof v === 'string' && v.length > 40 ? 'text-sm' : 'text-sm font-medium')}>{v}</dd>
    </div>
  );
}
