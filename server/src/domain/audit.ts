import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Tamper-EVIDENT audit ledger. Every meaningful thing that happens to a case — ingestion, AI
 * diagnosis, decision, policy block, action, recovery — appends one row. Each row carries a
 * SHA-256 `hash` over its canonical content chained to the previous row's hash for the same case
 * (`prevHash`). Re-walking the chain (verifyRows) detects ANY edit, deletion, reorder, or insertion:
 * a changed row no longer hashes to its stored value, and a moved/removed row breaks the prevHash
 * link. The ledger can prove, after the fact, exactly what happened — a console that could rewrite
 * history would destroy the property it exists to provide.
 */

const GENESIS = 'genesis';

export interface ChainRow {
  id: string;
  step: string;
  actor: string;
  beforeState: string | null;
  afterState: string | null;
  details: unknown;
  hash: string | null;
  prevHash: string | null;
}

/**
 * Deterministic JSON: sorted keys, undefined-valued keys dropped, and numbers canonicalized to 12
 * significant figures. That last part matters — Postgres jsonb round-trips a float through `numeric`,
 * which can change the ~16th significant digit (0.42947368421052627 → 0.4294736842105263), so hashing
 * the raw double would make write-time and verify-time (read-from-DB) hashes disagree. 12 sig figs
 * absorbs the sub-ULP drift while preserving every semantically meaningful value.
 */
function stableStringify(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return 'null';
    return JSON.stringify(Number.isInteger(v) ? v : Number(v.toPrecision(12)));
  }
  if (typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** The content a row commits to (everything semantic; NOT id/createdAt/hash). */
export function rowContent(r: Pick<ChainRow, 'step' | 'actor' | 'beforeState' | 'afterState' | 'details'>): string {
  return stableStringify({ step: r.step, actor: r.actor, beforeState: r.beforeState ?? null, afterState: r.afterState ?? null, details: r.details ?? null });
}

/** hash = SHA-256(prevHash ⧺ content). */
export function chainHash(prevHash: string, content: string): string {
  return createHash('sha256').update(prevHash).update('␟').update(content).digest('hex');
}

export interface ChainVerdict {
  valid: boolean;
  total: number;
  verified: number;
  brokenAt: string | null;
}

/** Pure verifier: re-walk an ordered array of chained rows and confirm every link. */
export function verifyRows(rows: ChainRow[]): ChainVerdict {
  let prev = GENESIS;
  let verified = 0;
  for (const r of rows) {
    const expected = chainHash(r.prevHash ?? GENESIS, rowContent(r));
    if ((r.prevHash ?? GENESIS) !== prev || r.hash !== expected) {
      return { valid: false, total: rows.length, verified, brokenAt: r.id };
    }
    prev = r.hash;
    verified++;
  }
  return { valid: true, total: rows.length, verified, brokenAt: null };
}

/**
 * Append a row to the audit trail, chained to the case's previous row. Reads the latest hash for the
 * case and links to it; per-case audit writes are effectively sequential (the pipeline runs a case's
 * steps in order, and the money path serializes per case), so the chain stays linear.
 */
export async function logAudit(params: {
  caseId: string;
  step: string;
  actor?: 'system' | 'ai' | 'policy' | 'executor' | 'webhook' | 'human';
  beforeState?: string | null;
  afterState?: string | null;
  details?: Prisma.InputJsonValue;
}) {
  const actor = params.actor ?? 'system';
  const beforeState = params.beforeState ?? null;
  const afterState = params.afterState ?? null;
  // Pick the previous row by the SAME (createdAt, id) ordering verifyCaseChain walks, so that when
  // several rows share a millisecond (rapid transitions) both sides agree on the chain order.
  const prev = await prisma.auditLog.findFirst({ where: { caseId: params.caseId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { hash: true } });
  const prevHash = prev?.hash ?? GENESIS;
  const hash = chainHash(prevHash, rowContent({ step: params.step, actor, beforeState, afterState, details: params.details ?? null }));

  return prisma.auditLog.create({
    data: {
      caseId: params.caseId,
      step: params.step,
      actor,
      beforeState,
      afterState,
      details: params.details,
      prevHash,
      hash,
    },
  });
}

/** Verify one case's audit chain (only rows that carry a hash). */
export async function verifyCaseChain(caseId: string): Promise<ChainVerdict> {
  const rows = await prisma.auditLog.findMany({
    where: { caseId, hash: { not: null } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, step: true, actor: true, beforeState: true, afterState: true, details: true, hash: true, prevHash: true },
  });
  return verifyRows(rows as ChainRow[]);
}

/** Verify every case's chain — the global ledger-integrity check. */
export async function verifyAllChains(): Promise<{ valid: boolean; cases: number; entries: number; brokenCases: string[] }> {
  const caseIds = (await prisma.auditLog.groupBy({ by: ['caseId'], where: { hash: { not: null } } })).map((r) => r.caseId);
  let entries = 0;
  const brokenCases: string[] = [];
  for (const caseId of caseIds) {
    const v = await verifyCaseChain(caseId);
    entries += v.total;
    if (!v.valid) brokenCases.push(caseId);
  }
  return { valid: brokenCases.length === 0, cases: caseIds.length, entries, brokenCases };
}
