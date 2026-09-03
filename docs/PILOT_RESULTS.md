# Pilot results — against the pre-registered protocol

> **Protocol:** [`PILOT_PROTOCOL.md`](./PILOT_PROTOCOL.md), git tag `pilot-preregistered-v1`, committed *before* this run.  
> **Run:** the deterministic protocol sequence, executed **once** on the hosted deployment (Azure Container Apps, UAE North). Numbers are pasted from the API read-outs, not retyped.  
> **Note:** this run reflects the corrected **intent-to-treat** measurement — an adversarial code review found the Lab was crediting escalated cases at the human-hand-off rate rather than the no-action baseline; the fix landed first, then the pre-registered protocol was re-run. The verdict is unchanged.

## Verdict: 6 of 7 gates met — G7 missed

| # | Gate | Threshold (fixed before the run) | Observed | Result |
|---|---|---|---|---|
| G1 | Lift is significant | 95% CI lower bound > 0 | lift +29pp, CI [+19.3, +37.9] | **met** |
| G2 | Control arm is real | 15–25% of 400 (≥ 60 cases) | 79/400 = 19.8% | **met** |
| G3 | ML actually decided | ≥ 95% model-served | 368/368 = 100% (0 fallbacks, avg 39 ms) | **met** |
| G4 | Reliability | 0 failed · 0 duplicate recoveries | 0 failed of 400 · 144 recovered cases = 144 counted | **met** |
| G5 | Integrity holds on the ledger | allCaught + append-only enforced | allCaught true · append-only enforced true (update+delete blocked) | **met** |
| G6 | The learning loop is honest | every large reason carries a CI; any treatment ≤ control reason is a suppression candidate | suppression candidates: card_declined, unknown; all large reasons carry a CI | **met** |
| G7 | Every large reason lifts | treatment lift > 0 for all reasons ≥ 20 resolved | not all: unknown -3.8pp, card_declined -6.4pp | **missed** |

## The run, verbatim

```
reset    → {"ok": true}
seed     → {"total": 400, "created": 400, "deduped": 0}
process  → {"processed": 400, "failed": 0}
tick     → {"dueRetries": 130, "recovered": 83, "reQueued": 47, "expired": 0}
resolve  → {"resolved": 317, "recovered": 61, "expired": 256, "suppressed": ["unknown", "card_declined"]}
```

## Read-outs

- **Overall lift:** treatment 134/321 (41.7%) vs control 10/79 (12.7%) → **+29pp**, 95% bootstrap CI [+19.3, +37.9], significant = true.
- **Money:** gross recovered ₹8,72,789 across 144 cases; Lab-incremental (vs the control's ₹-weighted rate) **₹7,64,022**.
- **ML:** 368/368 decisions model-served (100%), 0 fallbacks, avg 39 ms.
- **Ledger:** chain length 15 on the probed case; every tamper scenario caught; append-only trigger enforced (UPDATE + DELETE blocked).
- **Arms:** 79 control / 321 treatment of 400 (19.8% control).

### Per reason (resolved cases)

| Reason | Treatment | Control | Lift | 95% CI | Significant | Suppression candidate |
|---|---|---|---|---|---|---|
| `bank_downtime` | 49/58 (84.5%) | 5/16 (31.3%) | +53.2pp | [+25.4, +75.9] | yes | no |
| `upi_collect_timeout` | 37/56 (66.1%) | 1/13 (7.7%) | +58.4pp | [+38.2, +75.0] | yes | no |
| `card_declined` | 2/43 (4.7%) | 1/9 (11.1%) | -6.4pp | [-31.0, +9.3] | no | **yes** |
| `insufficient_funds` | 15/38 (39.5%) | 2/12 (16.7%) | +22.8pp | [-4.4, +47.4] | no | no |
| `abandoned` | 1/39 (2.6%) | 0/10 (0%) | +2.6pp | [+0.0, +7.7] | no | no |
| `authentication_failed` | 21/37 (56.8%) | 0/9 (0%) | +56.8pp | [+40.5, +73.0] | yes | no |
| `unknown` | 4/31 (12.9%) | 1/6 (16.7%) | -3.8pp | [-40.3, +19.4] | no | **yes** |
| `expired_card` | 5/19 (26.3%) | 0/4 (0%) | +26.3pp | [+10.5, +47.4] | yes | no |

## What this shows

- **G7 missed, exactly as the protocol warned it might.** unknown -3.8pp, card_declined -6.4pp — the treatment trailed control there. The Lab lists both as **suppression candidates** and the policy stops spending on them next cycle. A pilot that hid these lines would be worth less than one that reports them.
- **Met gates are system evidence, not market evidence.** The batch is synthetic (stamped as such). The gates test that measurement, integrity and reliability hold under a protocol fixed in advance — not that the uplift ranking transfers to a real payments book.
- **Ordering is provable in git:** the protocol tag `pilot-preregistered-v1` predates this file's commit.
