# Overwatch — The Evidence Stack

> Every headline claim in this repo, bound to the artifact that produced it, the command that
> regenerates it, the test that guards it, and the live endpoint that shows it. If a row here can't
> be reproduced, treat the claim as false. Nothing on this page is a number chosen after seeing the
> outcome: `claims.docs` asserts each README/demo figure matches its source artifact, and `ml.bands`
> asserts each artifact sits inside its committed quality band — both run in CI on every push.

**One command reproduces everything:** `./reproduce.sh` (installs, typechecks, trains, runs every suite).

## Money path

| Claim | Evidence | Regenerate / verify | Guarded by |
|---|---|---|---|
| **Real Razorpay captures** — two genuine test-mode payments, created via the API, paid through hosted Checkout + 3DS, captured | `server/fixtures/razorpay/live-captures.json` (`pay_TTxufNdQ8rLAvB`, `pay_TTyBx4OQoIQFkj`, fetched back from the Razorpay API) | `npm run replay:roundtrip` — replays the signed `payment.captured` through the production webhook path; no keys or tunnel needed. Against the hosted API: `SELFTEST_BASE=<url> RAZORPAY_WEBHOOK_SECRET=<its secret> npm run replay:roundtrip` | replay checks (fixture is a genuine capture → case recovered) |
| **Exactly-once recovery** under concurrent webhook redelivery | six simultaneous deliveries of one capture converge to exactly one recovery, all 200 | `npm test` → `webhooks.moneypath.test.ts` | the test |
| **HMAC-verified, constant-time signature check** on every webhook | `server/src/routes/webhook.ts` | `npm run selftest:webhook` (all-green signed self-test) | selftest |
| **Live:** Evidence page | `/app/evidence` · `GET /api/evidence/roundtrip` | — | — |

## Causal ML

| Claim | Value | Regenerate | Artifact | Guarded by |
|---|---|---|---|---|
| Causal uplift ranks cases by *incremental* effect (S- vs T-learner, selected by Qini) | Qini ≈ **0.93**, ECE ≈ **0.008**, uplift policy captures ~**99%** of the oracle's incremental ₹ | `ml/.venv/Scripts/python ml/src/uplift.py` | `ml/uplift.json` | `claims.docs`, `ml.bands` |
| Doubly-robust off-policy value, from the log alone | DR **₹3,276**/case vs logging **₹2,442**; within ~**6%** of ground truth | same | `ml/uplift.json` | `claims.docs` |
| External validity on a real public RCT (Hillstrom e-mail RCT, **64,000** randomised customers) | ground-truth ATE **+6.1pp** recovered within **1.9%**; best learner **x-learner** | `ml/.venv/Scripts/python ml/src/rct_validate.py` | `ml/rct_validation.json` | `claims.docs` |
| Uplift **ranking** on real data (same RCT) | targeting the best learner's top-30% yields **+2.0pp** more uplift than treating everyone (x-learner; S-learner **+2.5pp**) over the +6.1pp ATE; all learners' Qini > 0 | same | `ml/rct_validation.json` → `uplift_learners` | `claims.docs` |
| Per-case certainty with a distribution-free guarantee (split conformal) | target **90%**, empirical **90.7%** on a fresh split | `ml/.venv/Scripts/python ml/src/conformal.py` | `ml/conformal.json` | `claims.docs`, `ml.bands` |
| Cross-world transfer (frozen model on an independently designed world) | ROC-AUC ≈ 0.68 both directions (chance 0.50) | `ml/.venv/Scripts/python ml/src/transfer.py` | `ml/transfer.json` | `ml.bands` |
| Online exploration (contextual Thompson sampling) | ~93% of oracle, learned online | `ml/.venv/Scripts/python ml/src/explore.py` | `ml/explore.json` | `claims.docs` (demo) |
| Recovery model card (CatBoost vs XGBoost vs logistic regression, calibration curve) | ROC-AUC ≈ 0.75 with 95% CI; edge over logreg small and stated | `ml/.venv/Scripts/python ml/src/train.py` | `ml/metrics.json` | `ml.bands` |
| **Live:** ML Model page | `/app/model` · `GET /api/ml/{uplift,rct,conformal,monitor,metrics}` | — | — |

## Measurement

| Claim | Evidence | Verify | Guarded by |
|---|---|---|---|
| **Incremental ₹, not gross** — a randomised 20% no-action control arm, treatment−control with a 95% bootstrap CI, per reason | Recovery Lab | Demo menu: Seed → Run pipeline → Advance retries → **Resolve outcomes**; `GET /api/lab` | `lab.aa.test.ts` |
| The lift estimator is **A/A-tested** — on two identical arms it reads ~0 with a CI spanning zero, and it *does* detect a real effect | `server/src/domain/__tests__/lab.aa.test.ts` | `npm test` | the test |
| Auto-suppression: a reason whose treatment can't beat control is pruned next cycle | `GET /api/lab` → `suppressionCandidates` | run Resolve twice | — |
| "Projected incremental ₹" is a **projection** (measured lift rate × at-risk ₹ book), labelled as such; the impact chart counts only banked cash | Overview KPI + footnote | `/app` | — |

## Governance

| Claim | Evidence | Verify | Guarded by |
|---|---|---|---|
| **Red-team compliance:** 8 adversarial attacks on India-payments rules (RBI harmonised TAT, NPCI retry cap, AFA ceiling, DND/opt-out, quiet hours, discount cap, pursuit floor, allow-list), judged by *independent* oracles that re-derive each regulation | Compliance console | `/app/compliance` → **Re-run all attacks**; `GET /api/compliance/audit` | `compliance.redteam.test.ts` (oracles proven non-vacuous: a deliberately non-compliant decision makes every oracle fire) |
| **Outbound message fact-check:** every amount, discount and reference in an LLM draft is checked against ground truth before send; hallucinations are blocked and escalated | 4/4 handled | `GET /api/compliance/message-safety` | `messageValidator.test.ts` |
| **Policy invariants as properties** (opt-out never contacted, RBI-TAT always held, retry cap respected, decisions deterministic…) fuzzed over thousands of generated inputs | `policy.chaos.test.ts` | `npm test` | the test |
| **The LLM never decides or moves money** — it explains, drafts and summarises, with template fallback | `server/src/ai/` | any case → *AI assist* | architecture |

## Integrity

| Claim | Evidence | Verify | Guarded by |
|---|---|---|---|
| **Tamper-evident ledger** — every state transition SHA-256 hash-chained per case; content edits, deletions and re-links are caught and *classified* | Evidence page → forensics (4/4) | `GET /api/audit/forensics` (attacks run on clones; the live ledger is never mutated) | `audit.chain.test.ts` |
| **Append-only at the database** — a Postgres trigger rejects any `UPDATE`/`DELETE` on the ledger; not even the app can rewrite a row | live probe attempts both inside a rolled-back transaction | `GET /api/audit/forensics` → `appendOnly.enforced: true` | live probe |
| Per-case "chain verified ✓" badge | every case page | `/app/cases/:id` → `auditIntegrity` | — |

## Honesty guards (meta)

| Guard | What it asserts | Where |
|---|---|---|
| `claims.docs` | every headline number in `README.md` / `docs/DEMO.md` equals the value in its source artifact (recomputed and rendered the way the prose rounds it) | `server/src/domain/__tests__/claims.docs.test.ts` |
| `ml.bands` | every committed ML artifact sits inside its quality band (so a bad retrain can't ship quietly) | `server/src/domain/__tests__/ml.bands.test.ts` |
| synthetic provenance | every ML payload and report is stamped `"synthetic": true` where it applies | `ml/*.json` |

See also: [`docs/DEFENSE.md`](./DEFENSE.md) (the hard questions, answered) · [`DATA_CARD.md`](../DATA_CARD.md) (what the synthetic world is and isn't) · [`docs/COMPLIANCE.md`](./COMPLIANCE.md) (the rules, and the DPDP gap we own).

## One command

`cd server && npm run prove` re-derives every row above in-process and prints PASS / FAIL with the observed values; `SELFTEST_BASE=https://<host> npm run prove` adds the live checks (health, forensics + append-only on real rows, the control-measured lift, the ML-served rate). Exit code is non-zero on any FAIL.

## Pre-registered pilot — ordering you can verify in git

| Claim | Evidence | How to check |
|---|---|---|
| The gates were fixed **before** the run | tag `pilot-preregistered-v1` on the protocol commit | `git log -1 --format=%cI pilot-preregistered-v1` vs the commit adding `docs/PILOT_RESULTS.md` |
| The run is reported gate by gate, misses included | [`PILOT_RESULTS.md`](./PILOT_RESULTS.md): 6 of 7 met, G7 missed | read the Observed column; every number is an API read-out |
| The miss is the system working | the trailing reason is a Lab suppression candidate and the policy stops spending on it | Recovery Lab page → suppression candidates |
