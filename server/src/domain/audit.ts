import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Append a row to the immutable audit trail. Every meaningful thing that happens
 * to a case — ingestion, AI diagnosis, decision, policy block, action, recovery —
 * writes one of these. The dashboard renders them as the case timeline.
 */
export async function logAudit(params: {
  caseId: string;
  step: string;
  actor?: 'system' | 'ai' | 'policy' | 'executor' | 'webhook' | 'human';
  beforeState?: string | null;
  afterState?: string | null;
  details?: Prisma.InputJsonValue;
}) {
  return prisma.auditLog.create({
    data: {
      caseId: params.caseId,
      step: params.step,
      actor: params.actor ?? 'system',
      beforeState: params.beforeState ?? null,
      afterState: params.afterState ?? null,
      details: params.details,
    },
  });
}
