// The recovery "journey" — the same stages shown in the standalone walkthrough,
// used by the per-case StageTracker and the dashboard pipeline flow.

export type Actor = 'det' | 'ai' | 'policy' | 'act';

export interface Stage {
  key: string;
  label: string;
  actor: Actor;
}

/** The linear journey a case travels (per-case tracker). */
export const JOURNEY: Stage[] = [
  { key: 'caught', label: 'Caught', actor: 'det' },
  { key: 'diagnosed', label: 'Diagnosed', actor: 'ai' },
  { key: 'decided', label: 'Decided', actor: 'ai' },
  { key: 'policy', label: 'Policy', actor: 'policy' },
  { key: 'actioned', label: 'Actioned', actor: 'act' },
  { key: 'recovered', label: 'Recovered', actor: 'act' },
];

/** How far along the journey a case's state has reached (0-based index into JOURNEY). */
export function caseStageIndex(state: string): number {
  switch (state) {
    case 'new':
    case 'at_risk':
      return 0;
    case 'analyzed':
      return 1;
    case 'action_selected':
      return 3;
    case 'action_dispatched':
    case 'waiting_for_outcome':
      return 4;
    case 'recovered':
      return 5;
    case 'manual_escalation':
      return 3; // branched to a human at the policy stage
    case 'expired':
      return 4; // acted, but the window closed
    default:
      return 0;
  }
}

export function caseTerminal(state: string): 'recovered' | 'escalated' | 'expired' | null {
  if (state === 'recovered') return 'recovered';
  if (state === 'manual_escalation') return 'escalated';
  if (state === 'expired') return 'expired';
  return null;
}

// Tailwind class maps by actor (kept as literals so the compiler can see them).
export const ACTOR_FILL: Record<Actor, string> = {
  det: 'bg-slate-400',
  ai: 'bg-sky-400',
  policy: 'bg-violet-400',
  act: 'bg-emerald-400',
};
export const ACTOR_RING: Record<Actor, string> = {
  det: 'border-slate-400 text-slate-300',
  ai: 'border-sky-400 text-sky-300',
  policy: 'border-violet-400 text-violet-300',
  act: 'border-emerald-400 text-emerald-300',
};
export const ACTOR_TEXT: Record<Actor, string> = {
  det: 'text-slate-300',
  ai: 'text-sky-300',
  policy: 'text-violet-300',
  act: 'text-emerald-300',
};

/** Bucket the batch's states into a simple operational funnel for the dashboard. */
export function pipelineBuckets(byState: Record<string, number>) {
  const g = (k: string) => byState[k] ?? 0;
  return {
    flow: [
      { key: 'at_risk', label: 'At risk', actor: 'det' as Actor, count: g('new') + g('at_risk') },
      { key: 'deciding', label: 'Deciding', actor: 'ai' as Actor, count: g('analyzed') + g('action_selected') },
      { key: 'acting', label: 'Acting', actor: 'act' as Actor, count: g('action_dispatched') + g('waiting_for_outcome') },
      { key: 'recovered', label: 'Recovered', actor: 'act' as Actor, count: g('recovered') },
    ],
    escalated: g('manual_escalation'),
    expired: g('expired'),
  };
}
