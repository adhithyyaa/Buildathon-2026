import { useNavigate } from 'react-router-dom';
import type { CaseRow } from '../lib/api';
import { formatINR, titleCase } from '../lib/format';
import { ActionBadge, StateBadge, cx } from './ui';

function riskTone(score: number): string {
  if (score >= 75) return 'bg-rose-50 text-rose-700 ring-rose-200/80';
  if (score >= 50) return 'bg-amber-50 text-amber-700 ring-amber-200/80';
  return 'bg-slate-100 text-slate-600 ring-slate-200';
}

// Real Razorpay captures carry a pay_ id in the outcome notes (e.g. "Recovered via webhook (pay_…)").
function payRef(notes?: string | null): string | null {
  return notes?.match(/pay_[A-Za-z0-9]+/)?.[0] ?? null;
}

export function CaseTable({ cases }: { cases: CaseRow[] }) {
  const nav = useNavigate();

  if (cases.length === 0) {
    return <div className="px-5 py-16 text-center text-sm text-slate-400">No cases in this view. Seed a batch and run the pipeline.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <th className="py-3 pl-6 pr-3 font-medium">Risk</th>
            <th className="px-3 py-3 font-medium">Merchant / Customer</th>
            <th className="px-3 py-3 text-right font-medium">Amount</th>
            <th className="px-3 py-3 font-medium">Reason</th>
            <th className="px-3 py-3 font-medium">Action</th>
            <th className="px-3 py-3 font-medium">State</th>
            <th className="py-3 pl-3 pr-6 text-right font-medium">Recovered</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {cases.map((c) => (
            <tr key={c.id} onClick={() => nav(`/cases/${c.id}`)} className="cursor-pointer transition-colors hover:bg-slate-50/70">
              <td className="py-3.5 pl-6 pr-3">
                <span className={cx('inline-flex min-w-[2.25rem] justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset', riskTone(c.riskScore))}>
                  {c.riskScore}
                </span>
              </td>
              <td className="px-3 py-3.5">
                <div className="font-semibold text-slate-900">{c.merchant.name}</div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  {c.customer?.name ?? 'Guest'}
                  {c.customer?.optedOut && <span className="text-rose-500">· opted out</span>}
                </div>
              </td>
              <td className="px-3 py-3.5 text-right font-semibold tabular-nums text-slate-900">{formatINR(c.amount)}</td>
              <td className="px-3 py-3.5">
                <span className="text-slate-700">{titleCase(c.reasonTag)}</span>
                <div className="text-xs text-slate-400">{c.event.method ?? c.event.eventType}</div>
              </td>
              <td className="px-3 py-3.5"><ActionBadge action={c.assignedAction} /></td>
              <td className="px-3 py-3.5"><StateBadge state={c.state} /></td>
              <td className="py-3.5 pl-3 pr-6 text-right tabular-nums">
                {c.outcome?.status === 'recovered' ? (
                  <>
                    <span className="font-semibold text-emerald-600">{formatINR(c.outcome.recoveredAmount)}</span>
                    {payRef(c.outcome.notes) && (
                      <div className="mt-1">
                        <span title="Real Razorpay capture" className="inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] leading-none text-emerald-700 ring-1 ring-inset ring-emerald-200/80 bg-emerald-50">
                          {payRef(c.outcome.notes)}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
