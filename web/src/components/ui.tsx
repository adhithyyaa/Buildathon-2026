import type { ReactNode, ButtonHTMLAttributes } from 'react';
import { titleCase } from '../lib/format';
import { Icon } from './icons';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const STATE_TONE: Record<string, string> = {
  recovered: 'bg-emerald-50 text-emerald-700 ring-emerald-200/80',
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200/80',
  waiting_for_outcome: 'bg-amber-50 text-amber-700 ring-amber-200/80',
  manual_escalation: 'bg-rose-50 text-rose-700 ring-rose-200/80',
  at_risk: 'bg-orange-50 text-orange-700 ring-orange-200/80',
  unpaid: 'bg-orange-50 text-orange-700 ring-orange-200/80',
  analyzed: 'bg-sky-50 text-sky-700 ring-sky-200/80',
  action_selected: 'bg-sky-50 text-sky-700 ring-sky-200/80',
  action_dispatched: 'bg-sky-50 text-sky-700 ring-sky-200/80',
  expired: 'bg-slate-100 text-slate-600 ring-slate-200',
  new: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export function StateBadge({ state }: { state: string }) {
  return (
    <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap', STATE_TONE[state] ?? STATE_TONE.new)}>
      {titleCase(state)}
    </span>
  );
}

const ACTION_TONE: Record<string, string> = {
  smart_retry: 'bg-sky-50 text-sky-700 ring-sky-200/80',
  send_payment_link: 'bg-violet-50 text-violet-700 ring-violet-200/80',
  send_reminder: 'bg-teal-50 text-teal-700 ring-teal-200/80',
  offer_incentive: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200/80',
  escalate_to_human: 'bg-rose-50 text-rose-700 ring-rose-200/80',
  no_action: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export function ActionBadge({ action }: { action?: string | null }) {
  if (!action) return <span className="text-slate-400">—</span>;
  return (
    <span className={cx('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap', ACTION_TONE[action] ?? ACTION_TONE.no_action)}>
      {titleCase(action)}
    </span>
  );
}

export function Pill({ tone = 'slate', children }: { tone?: 'slate' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet'; children: ReactNode }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200/80',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200/80',
    rose: 'bg-rose-50 text-rose-700 ring-rose-200/80',
    sky: 'bg-sky-50 text-sky-700 ring-sky-200/80',
    violet: 'bg-violet-50 text-violet-700 ring-violet-200/80',
  };
  return <span className={cx('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone])}>{children}</span>;
}

export function Card({ title, right, children, className }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx('animate-rise rounded-2xl border border-slate-200/80 bg-white shadow-xs', className)}>
      {(title || right) && (
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {right}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function Button({ variant = 'default', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'ghost' | 'danger' }) {
  const variants: Record<string, string> = {
    default: 'bg-white hover:bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-200 shadow-xs font-medium',
    primary: 'bg-slate-900 hover:bg-slate-800 text-white font-medium shadow-xs',
    ghost: 'bg-transparent hover:bg-slate-100 text-slate-600 font-medium',
    danger: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-100 font-medium',
  };
  return (
    <button
      className={cx('inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer', variants[variant], className)}
      {...props}
    />
  );
}

export function Stat({
  label,
  value,
  sub,
  trend,
  tone = 'slate',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** Optional real trend chip, e.g. "+40pp". Only render one when there's a genuine figure to show. */
  trend?: string;
  tone?: 'slate' | 'emerald' | 'amber' | 'rose' | 'sky';
}) {
  const valueTone: Record<string, string> = {
    slate: 'text-slate-900',
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    rose: 'text-rose-600',
    sky: 'text-sky-600',
  };
  return (
    <div className="animate-rise rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition-all hover:shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={cx('mt-2 text-2xl font-bold tracking-tight tabular-nums', valueTone[tone])}>{value}</div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="text-xs text-slate-500 truncate">{sub}</div>
        {trend && (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-600 ring-1 ring-inset ring-emerald-200/60 shrink-0">
            {trend} <Icon name="trendUp" className="h-3 w-3" />
          </span>
        )}
      </div>
    </div>
  );
}
