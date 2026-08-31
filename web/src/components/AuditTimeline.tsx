import type { AuditLog } from '../lib/api';
import { titleCase, timeAgo } from '../lib/format';
import { cx } from './ui';

const ACTOR_COLOR: Record<string, string> = {
  system: 'bg-slate-400',
  ai: 'bg-sky-500',
  policy: 'bg-amber-500',
  executor: 'bg-teal-500',
  webhook: 'bg-emerald-500',
  human: 'bg-rose-500',
};

export function AuditTimeline({ logs }: { logs: AuditLog[] }) {
  if (logs.length === 0) return <div className="text-sm text-slate-400 py-4 text-center">No activity yet.</div>;
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5">
      {logs.map((l) => (
        <li key={l.id} className="relative">
          <span className={cx('absolute -left-[1.42rem] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white shadow-2xs', ACTOR_COLOR[l.actor] ?? 'bg-slate-400')} />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-bold text-slate-900">{titleCase(l.step)}</span>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">{l.actor}</span>
            <span className="text-xs text-slate-400">{timeAgo(l.createdAt)}</span>
          </div>
          {(l.beforeState || l.afterState) && (
            <div className="mt-0.5 text-xs text-slate-500 font-medium">
              {titleCase(l.beforeState) || '—'} <span className="text-slate-400">→</span> {titleCase(l.afterState) || '—'}
            </div>
          )}
          <DetailLine details={l.details} />
        </li>
      ))}
    </ol>
  );
}

function DetailLine({ details }: { details: any }) {
  if (!details || typeof details !== 'object') return null;
  if (Array.isArray(details.notes) && details.notes.length) {
    return (
      <ul className="mt-1.5 space-y-1">
        {details.notes.map((n: string, i: number) => (
          <li key={i} className="text-xs text-slate-600 font-medium">• {n}</li>
        ))}
      </ul>
    );
  }
  const keys = ['action', 'source', 'paymentRef', 'outcome', 'finalAction', 'paymentLinkUrl', 'recoveredAmountPaise', 'confidence', 'lane', 'probability'];
  const parts = keys.filter((k) => details[k] !== undefined && details[k] !== null).map((k) => `${k}: ${details[k]}`);
  if (!parts.length) return null;
  return <div className="mt-1 text-xs text-slate-500 font-medium">{parts.join(' · ')}</div>;
}
