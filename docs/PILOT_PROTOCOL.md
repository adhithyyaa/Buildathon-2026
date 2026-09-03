# Pilot protocol — pre-registered

> **Status: pre-registered.** This protocol is committed and git-tagged (`pilot-preregistered-v1`) *before*
> the run it describes. The results go in [`PILOT_RESULTS.md`](./PILOT_RESULTS.md), committed *after*, gate by
> gate, met or missed, verbatim — never tuned. The tag's timestamp is the proof of ordering.

## Why this exists

Our other honesty guards (`claims.docs`, `ml.bands`) stop a number from *drifting* after the fact. They do not
stop a design from being chosen after seeing results. This protocol closes that gap for one concrete run: the
questions, the batch, the sequence and the pass/fail lines below are fixed here, first.

## The run (exactly this, once)

- **Where:** the hosted deployment (Azure Container Apps · UAE North), API + ML + Supabase as deployed at the tag.
- **Batch:** the deterministic demo dataset, `count = 400` (`generateSyntheticCases(400)`), after a full reset.
- **Sequence, in order, once each:** Reset all data → Seed 400 → Run pipeline → Advance retries (fast-forward) →
  Resolve outcomes. No re-runs, no reseeding, no second Resolve. Whatever the Lab reports after that is the result.
- **Read-out:** `GET /api/lab` (lift, CI, arms, per-reason), `GET /api/metrics` (ML-served share, process failures,
  recovered), `GET /api/audit/forensics` (tamper battery + append-only probe), and the Recovery Lab page.

## The gates (decided now)

| # | Gate | Passes if | Why it can fail |
|---|---|---|---|
| G1 | **Lift is significant** | 95% bootstrap CI lower bound of the treatment−control lift is **> 0** | a small control arm or a weak batch widens the CI past zero |
| G2 | **Control arm is real** | realized control share is **15–25%** of the 400 (≥ 60 cases) | the arm split regresses |
| G3 | **ML actually decided** | **≥ 95%** of decisions are model-served (not deterministic fallback) | ML tier cold or unreachable → fallback |
| G4 | **Reliability** | **0** failed cases in Run pipeline; **0** duplicate recoveries | pool exhaustion, ML timeouts, idempotency bugs |
| G5 | **Integrity holds on the resulting ledger** | forensics `allCaught = true` **and** append-only probe `enforced = true` | a migration or trigger regression |
| G6 | **The learning loop is honest** | every reason with ≥ 20 resolved cases reports its own lift; any reason with treatment ≤ control appears in `suppressionCandidates` (not hidden) | suppression logic regresses |
| G7 | **Every large reason lifts** *(the gate we may miss)* | for **all** reasons with ≥ 20 resolved cases, treatment lift > 0 | `abandoned` / `unknown` routinely trail control — reporting a miss here is the point |

Point estimates to record alongside the gates: lift (pp), CI, n per arm, recovered ₹ (gross and Lab-incremental),
ML-served %, process failures, forensics verdicts, and any suppression candidates.

## What we will and won't conclude

- A **met** G1–G6 with G7 missed is the *expected* honest outcome and is reported as such.
- Nothing here is evidence that the uplift ranking transfers to a real payments book — the batch is synthetic
  (stamped as such); this pilot tests the *system* (measurement, integrity, reliability) under a fixed protocol.
