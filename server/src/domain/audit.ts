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

/**
 * How a broken chain was broken — the forensic distinction:
 *  • content_altered — a row's stored hash no longer matches its own content: a field was edited (or
 *    the hash itself was) without re-chaining. The tamper is IN this row.
 *  • chain_relinked — the row's content and hash are internally consistent, but its prevHash does not
 *    link to the actual previous row: a row was inserted, deleted, reordered, or an UPSTREAM row was
 *    edited and re-hashed without propagating downstream. The break surfaces AT the link.
 */
export type TamperKind = 'content_altered' | 'chain_relinked';

export interface ChainVerdict {
  valid: boolean;
  total: number;
  verified: number;
  brokenAt: string | null;
  tamper: TamperKind | null;
  detail: string | null;
}

/** Pure verifier: re-walk an ordered array of chained rows, confirm every link, and — if one breaks —
 *  classify HOW it broke (content vs linkage) and exactly where. */
export function verifyRows(rows: ChainRow[]): ChainVerdict {
  let prev = GENESIS;
  let verified = 0;
  for (const r of rows) {
    const rowPrev = r.prevHash ?? GENESIS;
    const contentOk = r.hash === chainHash(rowPrev, rowContent(r)); // row's own content ↔ hash consistent?
    const linkOk = rowPrev === prev; // row linked to the ACTUAL previous row?
    if (!contentOk || !linkOk) {
      const tamper: TamperKind = !contentOk ? 'content_altered' : 'chain_relinked';
      const at = `row ${verified + 1}/${rows.length} (${r.step})`;
      const detail = !contentOk
        ? `${at}: content does not match its stored hash — a field was edited without re-chaining.`
        : `${at}: row is self-consistent but its prevHash does not link to the previous row — a row was inserted, removed, reordered, or an upstream row changed.`;
      return { valid: false, total: rows.length, verified, brokenAt: r.id, tamper, detail };
    }
    prev = r.hash as string; // contentOk true ⇒ r.hash equals a hash string (never null)
    verified++;
  }
  return { valid: true, total: rows.length, verified, brokenAt: null, tamper: null, detail: null };
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

// ── Forensic demonstration ───────────────────────────────────────────────────────────────────────
// Prove the tamper-evidence property live, on a real case chain, WITHOUT ever writing bad data: each
// scenario deep-clones the rows, applies one attack to the clone, and re-verifies. The real ledger is
// never mutated. This is what makes "tamper-evident" checkable instead of merely asserted.

export interface ForensicScenario {
  id: string;
  label: string;
  attack: string;
  expected: TamperKind | 'valid';
  verdict: ChainVerdict;
  caught: boolean;
}

export interface ForensicReport {
  caseId: string | null;
  chainLength: number;
  scenarios: ForensicScenario[];
  allCaught: boolean;
}

const clone = (rows: ChainRow[]): ChainRow[] => rows.map((r) => ({ ...r, details: r.details === null || r.details === undefined ? r.details : (JSON.parse(JSON.stringify(r.details)) as unknown) }));

/** Run the tamper battery against a single untampered case chain (clones only — non-destructive). */
export function forensicDemo(rows: ChainRow[]): ForensicReport {
  const n = rows.length;
  if (n < 3) return { caseId: null, chainLength: n, scenarios: [], allCaught: false };
  const mid = Math.floor(n / 2); // a middle row: has both a predecessor and a successor
  const scenarios: ForensicScenario[] = [];

  // 0. Baseline — the untampered chain must verify.
  {
    const verdict = verifyRows(clone(rows));
    scenarios.push({ id: 'baseline', label: 'Untampered ledger', attack: 'No changes — the chain as written.', expected: 'valid', verdict, caught: verdict.valid });
  }

  // 1. Content edit — change a field, leave the stored hash. Caught IN that row as content_altered.
  {
    const c = clone(rows);
    const target = c[mid]!;
    c[mid] = { ...target, afterState: `${target.afterState ?? ''}~tampered` };
    const verdict = verifyRows(c);
    scenarios.push({
      id: 'content_altered',
      label: 'Silent field edit',
      attack: `Rewrite row ${mid + 1}'s outcome, leave its hash untouched.`,
      expected: 'content_altered',
      verdict,
      caught: verdict.tamper === 'content_altered' && verdict.brokenAt === target.id,
    });
  }

  // 2. Row deletion — drop a row. The successor's prevHash no longer links. Caught as chain_relinked.
  {
    const c = clone(rows).filter((_, i) => i !== mid);
    const verdict = verifyRows(c);
    scenarios.push({
      id: 'row_deleted',
      label: 'Deleted event',
      attack: `Remove row ${mid + 1} to hide that it ever happened.`,
      expected: 'chain_relinked',
      verdict,
      caught: verdict.tamper === 'chain_relinked',
    });
  }

  // 3. Cover-your-tracks edit — change a field AND recompute THIS row's hash so it is self-consistent,
  //    but don't re-hash the rest. The break simply moves to the next link: chain_relinked.
  {
    const c = clone(rows);
    const target = c[mid]!;
    const edited: ChainRow = { ...target, afterState: `${target.afterState ?? ''}~rehashed` };
    edited.hash = chainHash(edited.prevHash ?? GENESIS, rowContent(edited)); // attacker re-hashes the edited row
    c[mid] = edited;
    const verdict = verifyRows(c);
    scenarios.push({
      id: 'rehash_propagation',
      label: 'Edit + re-hash one row',
      attack: `Edit row ${mid + 1} and recompute its own hash — but not the chain after it.`,
      expected: 'chain_relinked',
      verdict,
      caught: verdict.tamper === 'chain_relinked',
    });
  }

  return { caseId: null, chainLength: n, scenarios, allCaught: scenarios.every((s) => s.caught) };
}

/** Pick the richest real case chain and run the forensic battery on it (for the console). */
export async function forensicReport(): Promise<ForensicReport> {
  const grouped = await prisma.auditLog.groupBy({ by: ['caseId'], where: { hash: { not: null } }, _count: { _all: true } });
  if (!grouped.length) return { caseId: null, chainLength: 0, scenarios: [], allCaught: false };
  const richest = grouped.sort((a, b) => b._count._all - a._count._all)[0]!.caseId;
  const rows = (await prisma.auditLog.findMany({
    where: { caseId: richest, hash: { not: null } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, step: true, actor: true, beforeState: true, afterState: true, details: true, hash: true, prevHash: true },
  })) as ChainRow[];
  return { ...forensicDemo(rows), caseId: richest };
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
