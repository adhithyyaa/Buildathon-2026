import { useNavigate } from 'react-router-dom';
import type { CaseRow } from '../lib/api';
import { formatINR, titleCase } from '../lib/format';
import { ActionBadge, StateBadge, cx } from './ui';

function riskTone(score: number): string {
  if (score >= 75) return 'bg-rose-500/15 text-rose-300 ring-rose-500/30';
  if (score >= 50) return 'bg-amber-500/15 text-amber-300 ring-amber-500/30';
  return 'bg-slate-500/15 text-slate-300 ring-slate-500/30';
}

// Real Razorpay captures carry a pay_ id in the outcome notes (e.g. "Recovered via webhook (pay_…)").
function payRef(notes?: string | null): string | null {
  return notes?.match(/pay_[A-Za-z0-9]+/)?.[0] ?? null;
}

export function CaseTable({ cases }: { cases: CaseRow[] }) {
  const nav = useNavigate();

  if (cases.length === 0) {
    return <div className="px-5 py-12 text-center text-sm text-slate-500">No cases here yet. Seed a batch and run the pipeline.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2.5 font-medium">Risk</th>
            <th className="px-4 py-2.5 font-medium">Merchant / Customer</th>
            <th className="px-4 py-2.5 font-medium text-right">Amount</th>
            <th className="px-4 py-2.5 font-medium">Reason</th>
            <th className="px-4 py-2.5 font-medium">Action</th>
            <th className="px-4 py-2.5 font-medium">State</th>
            <th className="px-4 py-2.5 font-medium text-right">Recovered</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {cases.map((c) => (
            <tr key={c.id} onClick={() => nav(`/cases/${c.id}`)} className="cursor-pointer transition-colors hover:bg-slate-800/40">
              <td className="px-4 py-3">
                <span className={cx('inline-flex min-w-[2.25rem] justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset', riskTone(c.riskScore))}>
                  {c.riskScore}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="font-medium text-slate-200">{c.merchant.name}</div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  {c.customer?.name ?? 'Guest'}
                  {c.customer?.optedOut && <span className="text-rose-400">· opted out</span>}
                </div>
              </td>
              <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-200">{formatINR(c.amount)}</td>
              <td className="px-4 py-3">
                <span className="text-slate-300">{titleCase(c.reasonTag)}</span>
                <div className="text-xs text-slate-500">{c.event.method ?? c.event.eventType}</div>
              </td>
              <td className="px-4 py-3"><ActionBadge action={c.assignedAction} /></td>
              <td className="px-4 py-3"><StateBadge state={c.state} /></td>
              <td className="px-4 py-3 text-right tabular-nums">
                {c.outcome?.status === 'recovered' ? (
                  <span className="font-semibold text-emerald-300">{formatINR(c.outcome.recoveredAmount)}</span>
                ) : (
                  <span className="text-slate-600">—</span>
                )}
                {payRef(c.outcome?.notes) && (
                  <div className="mt-1 flex justify-end">
                    <span
                      title="Real Razorpay capture"
                      className="inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] leading-none text-emerald-300/90 ring-1 ring-inset ring-emerald-500/30 bg-emerald-500/10"
                    >
                      {payRef(c.outcome?.notes)}
                    </span>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
