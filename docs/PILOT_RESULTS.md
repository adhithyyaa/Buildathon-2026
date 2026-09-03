# Pilot results — against the pre-registered protocol

> **Protocol:** [`PILOT_PROTOCOL.md`](./PILOT_PROTOCOL.md), git tag `pilot-preregistered-v1` (commit `6fc10b7`, 2026-09-03 18:22 IST).  
> **Run:** 2026-09-03 12:54 UTC on the hosted deployment (Azure Container Apps, UAE North), **once**, exactly the protocol's sequence. Nothing was re-run, reseeded or re-resolved. Numbers below are pasted from the API read-outs, not retyped.

## Verdict: 6 of 7 gates met — G7 missed

| # | Gate | Threshold (fixed before the run) | Observed | Result |
|---|---|---|---|---|
| G1 | Lift is significant | 95% CI lower bound > 0 | lift +29.6pp, CI [+18.6, +39.5] | **met** |
| G2 | Control arm is real | 15–25% of 400 (≥ 60 cases) | 79/400 = 19.8% | **met** |
| G3 | ML actually decided | ≥ 95% model-served | 347/347 = 100% (fallbacks 0, avg 29 ms) | **met** |
| G4 | Reliability | 0 failed in Run pipeline · 0 duplicate recoveries | failed 0 of 400 · recovered cases 161 distinct = 161 counted | **met** |
| G5 | Integrity holds on the resulting ledger | allCaught = true and append-only enforced = true | allCaught true (4 tamper scenarios) · append-only enforced true (update blocked true, delete blocked true) | **met** |
| G6 | The learning loop is honest | every reason ≥ 20 resolved has its own CI; any treatment ≤ control reason is a suppression candidate | all large reasons carry a CI; suppression candidates: card_declined | **met** |
| G7 | Every large reason lifts | treatment lift > 0 for all reasons ≥ 20 resolved | not all: card_declined -1.3pp | **missed** |

## The run, verbatim

```
reset    → {"ok": true}
seed     → {"total": 400, "created": 400, "deduped": 0}
process  → {"processed": 400, "failed": 0}
tick     → {"dueRetries": 106, "recovered": 80, "reQueued": 26, "expired": 0}
resolve  → {"resolved": 320, "recovered": 81, "expired": 239, "suppressed": ["card_declined"]}
```

## Read-outs

- **Overall lift:** treatment 148/321 (46.1%) vs control 13/79 (16.5%) → **+29.6pp**, 95% bootstrap CI [+18.6, +39.5], significant = true.
- **Money:** gross recovered ₹12,09,441 across 161 cases; Lab-incremental (vs the control's ₹-weighted rate) **₹7,79,829**.
- **ML:** 347/347 decisions model-served (100%), 0 fallbacks, average 29 ms per decision.
- **Ledger:** chain length 15 on the probed case; 4 tamper scenarios all caught; Postgres append-only trigger enforced (UPDATE and DELETE both blocked on a real row).
- **Arms:** 79 control / 321 treatment of 400 (19.8% control).

### Per reason (all reasons, resolved cases)

| Reason | Treatment | Control | Lift | 95% CI | Significant | ≥ 20 resolved | Suppression candidate |
|---|---|---|---|---|---|---|---|
| `bank_downtime` | 51/58 (87.9%) | 6/16 (37.5%) | +50.4pp | [+27.2, +74.8] | yes | yes | no |
| `upi_collect_timeout` | 41/56 (73.2%) | 3/13 (23.1%) | +50.1pp | [+22.9, +72.7] | yes | yes | no |
| `card_declined` | 9/43 (20.9%) | 2/9 (22.2%) | -1.3pp | [-30.5, +25.6] | no | yes | **yes** |
| `insufficient_funds` | 13/38 (34.2%) | 2/12 (16.7%) | +17.5pp | [-9.6, +42.1] | no | yes | no |
| `abandoned` | 8/39 (20.5%) | 0/10 (0%) | +20.5pp | [+10.3, +33.3] | yes | yes | no |
| `authentication_failed` | 16/37 (43.2%) | 0/9 (0%) | +43.2pp | [+27.0, +59.5] | yes | yes | no |
| `unknown` | 4/31 (12.9%) | 0/6 (0%) | +12.9pp | [+3.2, +25.8] | yes | yes | no |
| `expired_card` | 6/19 (31.6%) | 0/4 (0%) | +31.6pp | [+10.5, +52.6] | yes | yes | no |

## What this does and doesn't show

- **G7 was missed, as the protocol said it might be.** card_declined -1.3pp — the treatment trailed control there. The system's response is the right one: the Lab lists it as a suppression candidate and the policy stops spending on it. A pilot that hides this line would be worth less than one that reports it.
- **Met gates are system evidence, not market evidence.** The batch is synthetic (stamped as such). The gates test that measurement, integrity and reliability hold under a protocol fixed in advance — not that the uplift ranking transfers to a real payments book.
- **Why the ordering is provable:** the tag's commit predates this file's commit; `git log -1 --format=%cI pilot-preregistered-v1` and the commit that adds `PILOT_RESULTS.md` are both in the public history.
