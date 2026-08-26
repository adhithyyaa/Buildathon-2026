import { JOURNEY, caseStageIndex, caseTerminal, ACTOR_FILL, ACTOR_RING, type Actor } from '../lib/stages';
import { cx } from './ui';

const GLOW: Record<Actor, string> = {
  det: 'ring-slate-300',
  ai: 'ring-sky-300',
  policy: 'ring-violet-300',
  act: 'ring-emerald-300',
};

// Translucent fill for the pulsing ping ring behind the current node.
const PING: Record<Actor, string> = {
  det: 'bg-slate-300',
  ai: 'bg-sky-300',
  policy: 'bg-violet-300',
  act: 'bg-emerald-300',
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
    <div className="animate-rise rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">Recovery Journey</h3>
        {terminal && <TerminalBadge terminal={terminal} />}
      </div>
      <div className="relative pt-1">
        {/* base track */}
        <div className="absolute top-[9px] h-0.5 rounded-full bg-slate-200" style={{ left: `${railInset}%`, right: `${railInset}%` }} />
        {/* animated fill with a moving sheen */}
        <div
          className="animate-flow absolute top-[9px] h-0.5 rounded-full transition-[width] duration-700 ease-out"
          style={{
            left: `${railInset}%`,
            width: `${fillPct}%`,
            backgroundImage: 'linear-gradient(90deg, rgba(16,185,129,0.5) 0%, rgba(16,185,129,1) 50%, rgba(16,185,129,0.5) 100%)',
            backgroundSize: '200% 100%',
          }}
        />
        <div className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
          {JOURNEY.map((s, i) => {
            const done = i < active || (terminal === 'recovered' && i <= active);
            const current = i === active && terminal !== 'recovered';
            return (
              <div key={s.key} className="flex flex-col items-center gap-2 text-center">
                <span className="relative grid h-[20px] w-[20px] place-items-center">
                  {current && <span className={cx('absolute inline-flex h-full w-full animate-ping rounded-full', PING[s.actor])} />}
                  <span
                    className={cx(
                      'relative grid h-[20px] w-[20px] place-items-center rounded-full border-2 text-[10px] font-bold transition-colors duration-300 shadow-2xs',
                      done && `${ACTOR_FILL[s.actor]} border-transparent text-white`,
                      current && `bg-white ring-4 ${ACTOR_RING[s.actor]} ${GLOW[s.actor]} border-slate-900 text-slate-900`,
                      !done && !current && 'border-slate-300 bg-white text-transparent',
                    )}
                  >
                    {done && <span className="animate-pop">✓</span>}
                  </span>
                </span>
                <span
                  className={cx(
                    'text-[11px] leading-tight font-medium transition-colors',
                    current ? 'font-bold text-slate-900' : done ? 'text-slate-700' : 'text-slate-400',
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
    recovered: 'bg-emerald-50 text-emerald-700 ring-emerald-200/80',
    escalated: 'bg-rose-50 text-rose-700 ring-rose-200/80',
    expired: 'bg-slate-100 text-slate-700 ring-slate-200',
  }[terminal];
  const label = { recovered: 'Recovered', escalated: 'Escalated to human', expired: 'Expired' }[terminal];
  return <span className={cx('animate-pop rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', tone)}>{label}</span>;
}
