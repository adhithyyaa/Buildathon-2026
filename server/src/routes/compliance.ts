import { Router } from 'express';
import { ah } from '../lib/asyncHandler';
import { runCompliance } from '../domain/compliance';
import { ATTACKS, getAttack } from '../domain/redteamAttacks';
import { messageSafetyDemo } from '../domain/messageValidator';
import { policyEnvelope } from '../pipeline/runCase';

export const complianceRouter = Router();

/** GET /api/compliance/attacks — the red-team catalog (metadata a judge picks from). */
complianceRouter.get(
  '/attacks',
  ah(async (_req, res) => {
    res.json({
      envelope: policyEnvelope(),
      attacks: ATTACKS.map((a) => ({ id: a.id, title: a.title, targets: a.targets, goal: a.goal, caseSummary: a.caseSummary })),
    });
  }),
);

/** POST /api/compliance/redteam { attackId } — fire one attack at the REAL policy, judge with the oracles. */
complianceRouter.post(
  '/redteam',
  ah(async (req, res) => {
    const attackId = String((req.body as { attackId?: unknown })?.attackId ?? '');
    const attack = getAttack(attackId);
    if (!attack) return void res.status(404).json({ error: 'unknown_attack', attackId });
    const env = policyEnvelope();
    const result = runCompliance(attack.build(env));
    res.json({
      attack: { id: attack.id, title: attack.title, targets: attack.targets, goal: attack.goal, caseSummary: attack.caseSummary },
      ...result,
    });
  }),
);

/** GET /api/compliance/audit — fire the whole catalog; the headline "N/N defended" for the console. */
complianceRouter.get(
  '/audit',
  ah(async (_req, res) => {
    const env = policyEnvelope();
    const results = ATTACKS.map((a) => {
      const r = runCompliance(a.build(env));
      return {
        attack: { id: a.id, title: a.title, targets: a.targets, goal: a.goal, caseSummary: a.caseSummary },
        decision: r.decision,
        findings: r.findings,
        verdict: r.verdict,
        violations: r.violations,
      };
    });
    const defended = results.filter((r) => r.verdict === 'defended').length;
    res.json({ total: results.length, defended, breached: results.length - defended, results });
  }),
);

/** GET /api/compliance/message-safety — fact-check battery over legit + hallucinated outbound messages. */
complianceRouter.get(
  '/message-safety',
  ah(async (_req, res) => {
    res.json(messageSafetyDemo());
  }),
);
