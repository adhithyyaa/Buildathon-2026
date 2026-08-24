import { JOURNEY, caseStageIndex, caseTerminal, ACTOR_FILL, ACTOR_RING, type Actor } from '../lib/stages';
import { cx } from './ui';

const GLOW: Record<Actor, string> = {
  det: 'ring-slate-400/25',
  ai: 'ring-sky-400/25',
  policy: 'ring-violet-400/25',
  act: 'ring-emerald-400/25',
};

/** A horizontal tracker showing where THIS case sits in the recovery journey. */
export function StageTracker({ state }: { state: string }) {
  const active = caseStageIndex(state);
  const terminal = caseTerminal(state);
  const n = JOURNEY.length;
  const doneThrough = terminal === 'recovered' ? n - 1 : active;
  const railInset = 100 / n / 2; // half a cell
  const fillPct = (doneThrough / (n - 1)) * (100 - 100 / n);

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Journey</h3>
        {terminal && <TerminalBadge terminal={terminal} />}
      </div>
      <div className="relative pt-1">
        <div className="absolute top-[9px] h-0.5 bg-slate-700" style={{ left: `${railInset}%`, right: `${railInset}%` }} />
        <div className="absolute top-[9px] h-0.5 bg-emerald-400/70 transition-[width] duration-500" style={{ left: `${railInset}%`, width: `${fillPct}%` }} />
        <div className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
          {JOURNEY.map((s, i) => {
            const done = i < active || (terminal === 'recovered' && i <= active);
            const current = i === active && terminal !== 'recovered';
            return (
              <div key={s.key} className="flex flex-col items-center gap-2 text-center">
                <span
                  className={cx(
                    'grid h-[19px] w-[19px] place-items-center rounded-full border-2 text-[10px] transition-colors',
                    done && `${ACTOR_FILL[s.actor]} border-transparent text-slate-950`,
                    current && `bg-slate-900 ring-4 ${ACTOR_RING[s.actor]} ${GLOW[s.actor]}`,
                    !done && !current && 'border-slate-700 bg-slate-900',
                  )}
                >
                  {done ? '✓' : ''}
                </span>
                <span
                  className={cx(
                    'text-[11px] leading-tight',
                    current ? 'font-semibold text-slate-200' : done ? 'text-slate-400' : 'text-slate-600',
                  )}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TerminalBadge({ terminal }: { terminal: 'recovered' | 'escalated' | 'expired' }) {
  const tone = {
    recovered: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
    escalated: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
    expired: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
  }[terminal];
  const label = { recovered: 'Recovered', escalated: 'Escalated to human', expired: 'Expired' }[terminal];
  return <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', tone)}>{label}</span>;
}
