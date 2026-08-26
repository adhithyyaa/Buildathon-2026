import type { ReactNode, ButtonHTMLAttributes } from 'react';
import { titleCase } from '../lib/format';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const STATE_TONE: Record<string, string> = {
  recovered: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  waiting_for_outcome: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  manual_escalation: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  at_risk: 'bg-orange-500/15 text-orange-300 ring-orange-500/30',
  analyzed: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  action_selected: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  action_dispatched: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  expired: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
  new: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
};

export function StateBadge({ state }: { state: string }) {
  return (
    <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap', STATE_TONE[state] ?? STATE_TONE.new)}>
      {titleCase(state)}
    </span>
  );
}

const ACTION_TONE: Record<string, string> = {
  smart_retry: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  send_payment_link: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
  send_reminder: 'bg-teal-500/15 text-teal-300 ring-teal-500/30',
  offer_incentive: 'bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/30',
  escalate_to_human: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  no_action: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
};

export function ActionBadge({ action }: { action?: string | null }) {
  if (!action) return <span className="text-slate-500">—</span>;
  return (
    <span className={cx('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap', ACTION_TONE[action] ?? ACTION_TONE.no_action)}>
      {titleCase(action)}
    </span>
  );
}

export function Pill({ tone = 'slate', children }: { tone?: 'slate' | 'emerald' | 'amber' | 'rose' | 'sky'; children: ReactNode }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
    emerald: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
    amber: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
    rose: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
    sky: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  };
  return <span className={cx('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone])}>{children}</span>;
}

export function Card({ title, right, children, className }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx('animate-rise rounded-2xl border border-slate-800/80 bg-slate-900/50 backdrop-blur', className)}>
      {(title || right) && (
        <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
          {right}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function Button({ variant = 'default', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'ghost' | 'danger' }) {
  const variants: Record<string, string> = {
    default: 'bg-slate-800 hover:bg-slate-700 text-slate-100 ring-1 ring-inset ring-slate-700',
    primary: 'bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-semibold',
    ghost: 'bg-transparent hover:bg-slate-800 text-slate-300',
    danger: 'bg-rose-500/90 hover:bg-rose-500 text-white',
  };
  return (
    <button
      className={cx('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50', variants[variant], className)}
      {...props}
    />
  );
}

export function Stat({ label, value, sub, tone = 'slate' }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'slate' | 'emerald' | 'amber' | 'rose' | 'sky' }) {
  const valueTone: Record<string, string> = {
    slate: 'text-slate-100',
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
    rose: 'text-rose-300',
    sky: 'text-sky-300',
  };
  return (
    <div className="animate-rise rounded-2xl border border-slate-800/80 bg-slate-900/50 px-5 py-4 backdrop-blur">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className={cx('mt-1 text-2xl font-bold tabular-nums', valueTone[tone])}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
