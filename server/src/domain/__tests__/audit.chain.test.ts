import { describe, it, expect } from 'vitest';
import { chainHash, rowContent, verifyRows, forensicDemo, type ChainRow } from '../audit';

/**
 * Tamper-evidence tests for the audit hash chain. A ledger that can be edited without detection is
 * worthless as proof, so these assert the chain catches every class of tampering: content edits,
 * reorders, deletions, and insertions.
 */

/** Build a valid chain the way logAudit does: each row links to the previous row's hash. */
function buildChain(entries: Array<Pick<ChainRow, 'id' | 'step' | 'actor' | 'beforeState' | 'afterState' | 'details'>>): ChainRow[] {
  let prev = 'genesis';
  return entries.map((e) => {
    const hash = chainHash(prev, rowContent(e));
    const row: ChainRow = { ...e, prevHash: prev, hash };
    prev = hash;
    return row;
  });
}

const SAMPLE = [
  { id: 'a', step: 'ingested', actor: 'system', beforeState: null, afterState: 'new', details: { source: 'demo' } },
  { id: 'b', step: 'scored', actor: 'system', beforeState: 'at_risk', afterState: 'analyzed', details: { lane: 'retry' } },
  { id: 'c', step: 'ai_decision', actor: 'ai', beforeState: 'analyzed', afterState: 'action_selected', details: { action: 'smart_retry', confidence: 0.77 } },
  { id: 'd', step: 'recovered', actor: 'webhook', beforeState: 'waiting_for_outcome', afterState: 'recovered', details: { paymentRef: 'pay_TT123', paise: 1433800 } },
];

describe('audit hash chain', () => {
  it('verifies an untampered chain', () => {
    const v = verifyRows(buildChain(SAMPLE));
    expect(v.valid).toBe(true);
    expect(v.verified).toBe(4);
    expect(v.brokenAt).toBeNull();
  });

  it('detects an edited row and classifies it as content_altered', () => {
    const chain = buildChain(SAMPLE);
    // Attacker rewrites the recovered amount but can't recompute the whole downstream chain.
    chain[3] = { ...chain[3]!, details: { paymentRef: 'pay_TT123', paise: 99999900 } };
    const v = verifyRows(chain);
    expect(v.valid).toBe(false);
    expect(v.brokenAt).toBe('d');
    expect(v.tamper).toBe('content_altered');
  });

  it('detects a reordered chain and classifies it as chain_relinked', () => {
    const chain = buildChain(SAMPLE);
    const tmp = chain[1]!;
    chain[1] = chain[2]!;
    chain[2] = tmp; // swap two rows — each row is self-consistent, but the links no longer match
    const v = verifyRows(chain);
    expect(v.valid).toBe(false);
    expect(v.tamper).toBe('chain_relinked');
  });

  it('detects a deleted row and classifies it as chain_relinked', () => {
    const chain = buildChain(SAMPLE);
    chain.splice(2, 1); // remove the ai_decision row
    const v = verifyRows(chain);
    expect(v.valid).toBe(false);
    expect(v.brokenAt).toBe('d'); // the next row's prevHash no longer matches
    expect(v.tamper).toBe('chain_relinked');
  });

  it('detects an inserted forged row', () => {
    const chain = buildChain(SAMPLE);
    const forged: ChainRow = { id: 'x', step: 'recovered', actor: 'human', beforeState: 'analyzed', afterState: 'recovered', details: { paise: 5000000 }, prevHash: chain[1]!.hash, hash: 'deadbeef' };
    chain.splice(2, 0, forged);
    expect(verifyRows(chain).valid).toBe(false);
  });

  it('forensic demo catches every tamper class on a real chain, non-destructively', () => {
    const rows = buildChain(SAMPLE);
    const rep = forensicDemo(rows);
    expect(rep.chainLength).toBe(4);
    expect(rep.allCaught).toBe(true);
    const byId = Object.fromEntries(rep.scenarios.map((s) => [s.id, s]));
    expect(byId.baseline!.verdict.valid).toBe(true);
    expect(byId.content_altered!.verdict.tamper).toBe('content_altered');
    expect(byId.row_deleted!.verdict.tamper).toBe('chain_relinked');
    expect(byId.rehash_propagation!.verdict.tamper).toBe('chain_relinked');
    // The battery mutates clones only — the original chain still verifies afterwards.
    expect(verifyRows(rows).valid).toBe(true);
  });
});
