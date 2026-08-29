import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, type CaseDetail, type ChainVerdict } from '../lib/api';
import { formatINR, titleCase, timeAgo } from '../lib/format';
import { Card, Button, StateBadge, ActionBadge, Pill, cx } from '../components/ui';
import { useToast } from '../lib/toast';
import { AuditTimeline } from '../components/AuditTimeline';
import { StageTracker } from '../components/StageTracker';
import { MLPanel } from '../components/MLPanel';
import { ReasonCodes } from '../components/ReasonCodes';
import { AIAssist } from '../components/AIAssist';

function last<T>(arr: T[]): T | undefined {
  return arr.length ? arr[arr.length - 1] : undefined;
}

export function CasePage() {
  const { id } = useParams();
  const [data, setData] = useState<CaseDetail | null>(null);
  const [integrity, setIntegrity] = useState<ChainVerdict | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.caseDetail(id);
      setData(r.case);
      setIntegrity(r.auditIntegrity ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<unknown>, successMsg: string) {
    setBusy(true);
    try {
      await fn();
      toast(successMsg, 'success');
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      toast(m.includes('401') || m.includes('unauthorized') ? 'Unauthorized — set the operator token' : `Failed: ${m}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <div className="py-16 text-center text-slate-400">Loading case…</div>;
  if (error) return <div className="py-16 text-center text-rose-600 font-medium">Error: {error}</div>;
  if (!data || !id) return null;

  const prediction = last(data.predictions) ?? null;
  const decision = last(data.decisions) ?? null;
  const diag = decision?.rawOutput?.diagnosis as
    | { reason_category?: string; recovery_probability?: number; is_auto_retriable?: boolean; rationale?: string }
    | undefined;
  const lastAction = last(data.actions) ?? null;
  const linkAction = [...data.actions].reverse().find((a) => a.paymentLinkUrl);
  const policyEval = [...data.auditLogs].reverse().find((l) => l.step === 'policy_eval');
  const policyOutcome = policyEval?.details?.outcome as string | undefined;
  const recoveredPaymentId = data.outcome?.notes?.match(/pay_[A-Za-z0-9]+/)?.[0];

  return (
    <div className="space-y-6">
      <Link to="/app/queue" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors">
        ← Recovery queue
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{data.merchant.name}</h1>
            <StateBadge state={data.state} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
            <span className="text-base font-bold text-slate-900">{formatINR(data.amount)}</span>
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
            <Button variant="primary" disabled={busy} onClick={() => act(() => api.runCase(id), 'Pipeline run — decision generated')}>
              {busy ? 'Running…' : 'Run recovery'}
            </Button>
          )}
          {data.state === 'manual_escalation' && (
            <>
              <Button variant="primary" disabled={busy} onClick={() => act(() => api.approveCase(id), 'Approved — action dispatched')}>
                {busy ? 'Dispatching…' : 'Approve & dispatch'}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => act(() => api.rejectCase(id), 'Case rejected — expired')}>
                {busy ? '…' : 'Reject'}
              </Button>
            </>
          )}
          {linkAction?.paymentLinkUrl && data.state !== 'recovered' && (
            <Button onClick={() => window.open(linkAction.paymentLinkUrl!, '_blank')}>Open payment link ↗</Button>
          )}
          <Button variant="ghost" disabled={busy} onClick={load}>Refresh</Button>
        </div>
      </div>

      <StageTracker state={data.state} />

      <MLPanel prediction={prediction} />

      {(prediction || decision) && <ReasonCodes caseId={id} />}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: the decision story */}
        <div className="space-y-6 lg:col-span-2">
          <Card
            title="Recovery decision"
            right={decision ? <Pill tone={decision.usedFallback ? 'slate' : 'sky'}>{decision.usedFallback ? 'Deterministic fallback' : decision.model}</Pill> : null}
          >
            {!decision ? (
              <p className="text-sm text-slate-400 py-2">Not analyzed yet. Run the pipeline to generate a decision.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <ActionBadge action={decision.action} />
                  {decision.confidence != null && (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 rounded-full bg-slate-100">
                        <div className="h-1.5 rounded-full bg-sky-500" style={{ width: `${Math.round((decision.confidence ?? 0) * 100)}%` }} />
                      </div>
                      <span className="text-xs text-slate-500 font-medium">{Math.round((decision.confidence ?? 0) * 100)}% action confidence</span>
                    </div>
                  )}
                  {decision.requiresHumanApproval && <Pill tone="amber">Needs human approval</Pill>}
                </div>
                {decision.reason && <p className="text-sm text-slate-700 leading-relaxed font-medium">{decision.reason}</p>}
                {diag && (
                  <div className="grid grid-cols-2 gap-3.5 rounded-xl border border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-4">
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
              <ul className="space-y-2">
                {policyEval.details.notes.map((n: string, i: number) => (
                  <li key={i} className="flex gap-2 text-xs font-medium text-slate-700">
                    <span className="text-slate-400">›</span>
                    {n}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400 py-2">No policy evaluation yet.</p>
            )}
          </Card>

          {lastAction && (
            <Card title="Action taken">
              <div className="flex flex-wrap items-center gap-2.5">
                <ActionBadge action={lastAction.actionType} />
                <Pill tone="slate">{lastAction.channel}</Pill>
                <Pill tone={lastAction.status === 'succeeded' ? 'emerald' : lastAction.status === 'blocked' ? 'rose' : 'sky'}>{titleCase(lastAction.status)}</Pill>
                {lastAction.deliveryStatus && <span className="text-xs text-slate-400">delivery: {lastAction.deliveryStatus}</span>}
                {lastAction.incentivePct > 0 && <Pill tone="amber">{lastAction.incentivePct}% incentive</Pill>}
              </div>
              {lastAction.paymentLinkUrl && (
                <div className="mt-3.5 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5">
                  <span className="truncate text-xs text-sky-700 font-mono font-medium">{lastAction.paymentLinkUrl}</span>
                  <Button variant="ghost" className="ml-auto text-xs py-1" onClick={() => window.open(lastAction.paymentLinkUrl!, '_blank')}>Open ↗</Button>
                </div>
              )}
              {lastAction.messageContent && (
                <div className="mt-4">
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Drafted message</div>
                  <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 text-xs text-slate-800 font-mono shadow-2xs leading-relaxed">{lastAction.messageContent}</pre>
                </div>
              )}
            </Card>
          )}
          <AIAssist caseId={id} />
        </div>

        {/* Right: facts, outcome, audit */}
        <div className="space-y-6">
          {data.outcome?.status === 'recovered' ? (
            <Card title="Outcome">
              <div className="text-3xl font-black text-emerald-800 tabular-nums">{formatINR(data.outcome.recoveredAmount)}</div>
              <div className="mt-1 text-xs text-emerald-700 font-semibold">Recovered {data.outcome.recoveryMinutes != null ? `in ${data.outcome.recoveryMinutes} min` : ''}</div>
              {data.outcome.notes && (
                <div className="mt-2 text-xs text-slate-500">
                  {data.outcome.notes}
                  {recoveredPaymentId && (
                    <>
                      {' · '}
                      <a
                        href={`https://dashboard.razorpay.com/app/payments/${recoveredPaymentId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-700 hover:text-emerald-900 font-semibold underline"
                      >
                        Verify on Razorpay ↗
                      </a>
                    </>
                  )}
                </div>
              )}
            </Card>
          ) : (
            <Card title="Outcome">
              <div className="text-xs text-slate-500 font-medium">Not recovered yet · <StateBadge state={data.state} /></div>
            </Card>
          )}

          <Card title="Case facts">
            <dl className="grid grid-cols-2 gap-y-3 gap-x-2 text-xs">
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
              <dl className="grid grid-cols-2 gap-y-3 gap-x-2 text-xs">
                <KeyVal k="Name" v={data.customer.name ?? '—'} />
                <KeyVal k="Opted out" v={data.customer.optedOut ? 'Yes' : 'No'} />
                <KeyVal k="Prior pays" v={data.customer.priorPayments} />
                <KeyVal k="Prior conv." v={data.customer.priorConversions} />
                <div className="col-span-2"><KeyVal k="Email" v={data.customer.email ?? '—'} /></div>
              </dl>
            ) : (
              <p className="text-xs text-slate-400 py-2">Guest checkout (no profile).</p>
            )}
          </Card>

          <Card
            title="Audit trail"
            right={
              integrity ? (
                <Pill tone={integrity.valid ? 'emerald' : 'rose'}>
                  {integrity.valid ? `chain verified ✓ ${integrity.verified}` : 'chain broken ✗'}
                </Pill>
              ) : null
            }
          >
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
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k}</dt>
      <dd className={cx('mt-0.5 text-slate-800', typeof v === 'string' && v.length > 40 ? 'text-xs' : 'text-xs font-semibold')}>{v}</dd>
    </div>
  );
}
