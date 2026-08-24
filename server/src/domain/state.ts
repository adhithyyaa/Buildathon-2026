import { CaseState, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logAudit } from './audit';

/**
 * The case lifecycle as an explicit, allow-listed state machine. This is the
 * heart of "bounded, not an open-ended agent": a case can only ever move along
 * a known edge, and every move is written to the audit trail.
 */
export const TRANSITIONS: Record<CaseState, CaseState[]> = {
  new: ['at_risk'],
  at_risk: ['analyzed'],
  analyzed: ['action_selected'],
  action_selected: ['action_dispatched', 'manual_escalation'],
  action_dispatched: ['waiting_for_outcome'],
  waiting_for_outcome: ['recovered', 'expired', 'at_risk', 'manual_escalation'],
  manual_escalation: ['recovered', 'expired'],
  recovered: [],
  expired: [],
};

export class InvalidTransitionError extends Error {
  constructor(from: CaseState, to: CaseState, caseId: string) {
    super(`Invalid case transition ${from} -> ${to} (case ${caseId})`);
    this.name = 'InvalidTransitionError';
  }
}

export function canTransition(from: CaseState, to: CaseState): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Move a case to a new state, enforcing the allow-list and logging the transition.
 * Extra `data` lets callers persist related fields atomically with the move
 * (e.g. set `nextRetryAt` when going back to `at_risk`).
 */
export async function transition(
  caseId: string,
  to: CaseState,
  opts: {
    step: string;
    actor?: 'system' | 'ai' | 'policy' | 'executor' | 'webhook' | 'human';
    details?: Prisma.InputJsonValue;
    data?: Prisma.CaseUpdateInput;
  },
) {
  const existing = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
  const from = existing.state;

  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to, caseId);
  }

  const updated = await prisma.case.update({
    where: { id: caseId },
    data: { ...opts.data, state: to },
  });

  await logAudit({
    caseId,
    step: opts.step,
    actor: opts.actor ?? 'system',
    beforeState: from,
    afterState: to,
    details: opts.details,
  });

  return updated;
}
