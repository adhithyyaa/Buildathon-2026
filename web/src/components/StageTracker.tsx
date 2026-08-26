import { JOURNEY, caseStageIndex, caseTerminal, ACTOR_FILL, ACTOR_RING, type Actor } from '../lib/stages';
import { cx } from './ui';

const GLOW: Record<Actor, string> = {
  det: 'ring-slate-400/25',
  ai: 'ring-sky-400/25',
  policy: 'ring-violet-400/25',
  act: 'ring-emerald-400/25',
};

// Translucent fill for the pulsing ping ring behind the current node.
const PING: Record<Actor, string> = {
  det: 'bg-slate-400/40',
  ai: 'bg-sky-400/50',
  policy: 'bg-violet-400/50',
  act: 'bg-emerald-400/50',
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
    <div className="animate-rise rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Journey</h3>
        {terminal && <TerminalBadge terminal={terminal} />}
      </div>
      <div className="relative pt-1">
        {/* base track */}
        <div className="absolute top-[9px] h-0.5 rounded-full bg-slate-700" style={{ left: `${railInset}%`, right: `${railInset}%` }} />
        {/* animated fill with a moving sheen */}
        <div
          className="animate-flow absolute top-[9px] h-0.5 rounded-full transition-[width] duration-700 ease-out"
          style={{
            left: `${railInset}%`,
            width: `${fillPct}%`,
            backgroundImage: 'linear-gradient(90deg, rgba(16,185,129,0.35) 0%, rgba(110,231,183,0.95) 50%, rgba(16,185,129,0.35) 100%)',
            backgroundSize: '200% 100%',
          }}
        />
        <div className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
          {JOURNEY.map((s, i) => {
            const done = i < active || (terminal === 'recovered' && i <= active);
            const current = i === active && terminal !== 'recovered';
            return (
              <div key={s.key} className="flex flex-col items-center gap-2 text-center">
                <span className="relative grid h-[19px] w-[19px] place-items-center">
                  {current && <span className={cx('absolute inline-flex h-full w-full animate-ping rounded-full', PING[s.actor])} />}
                  <span
                    className={cx(
                      'relative grid h-[19px] w-[19px] place-items-center rounded-full border-2 text-[10px] transition-colors duration-300',
                      done && `${ACTOR_FILL[s.actor]} border-transparent text-slate-950`,
                      current && `bg-slate-900 ring-4 ${ACTOR_RING[s.actor]} ${GLOW[s.actor]}`,
                      !done && !current && 'border-slate-700 bg-slate-900',
                    )}
                  >
                    {done && <span className="animate-pop">✓</span>}
                  </span>
                </span>
                <span
                  className={cx(
                    'text-[11px] leading-tight transition-colors',
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
  return <span className={cx('animate-pop rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', tone)}>{label}</span>;
}
