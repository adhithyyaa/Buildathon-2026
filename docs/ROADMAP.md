# Overwatch — ML v2 Design Record & Forward Roadmap

> **STATUS — this plan shipped.** This document was written as a forward plan to make Overwatch the
> strongest entry in the field on **every** axis (ML model, measurement rigor, code quality, docs). Its
> **Phase 1 and Phase 2 are now built and tested** — so read §1–§3 as the *design record of what was
> executed*, not a wishlist. The **shipped ledger** below maps each planned item to the file that
> implements it and the test that proves it. Genuinely-forward work is collected in **§5 "Still ahead"**.
>
> The design was validated against a later, wider code-level scan of the field (see the published
> competitive analysis linked from [`DEFENSE.md`](./DEFENSE.md)); Overwatch came out first, and the axes
> below are why.

## 0. Shipped ledger — plan → code → proof

| Planned capability | Shipped in | Proven by |
|---|---|---|
| Uplift / CATE engine (S/T/X-learner CatBoost) + benchmark | `ml/src/uplift.py` | `ml/uplift.json` |
| Qini / AUUC / uplift@decile | `ml/src/uplift.py` | `ml/uplift.json` |
| Per-head isotonic calibration + ECE/Brier/reliability | `ml/src/train.py` | `ml/metrics.json`, model card |
| SHAP per-case attribution → signed reason codes | `ml/src/serve.py` → `web` ReasonCodes | UI case drawer |
| Doubly-robust / IPS off-policy evaluation | `ml/src/uplift.py`, `ml/src/eval.py` | `ml/uplift.json`, `ml/eval*.json` |
| **Conformal prediction** (distribution-free coverage) | `ml/src/conformal.py` | `ml/conformal.json`, `ml.bands` test |
| **Real-RCT external validation** (Hillstrom) | `ml/src/rct_validate.py` | `ml/rct_validation.json` |
| Cross-world transfer (frozen model, independent world) | `ml/src/transfer.py` | `ml/transfer.json` |
| Thompson-sampling exploration | `ml/src/explore.py` | `ml/explore.json` |
| A/A null test (estimator unbiased) | `server` Lab | `lab.aa.test.ts` |
| Multi-strategy CI table (4 eval arms, both worlds) | `ml/src/eval.py` | `ml/eval.json`, `ml/eval_v2.json` |
| Hash-chained + **DB-enforced append-only** audit + forensics | `server/src/domain/audit.ts` | `audit.chain.test.ts` |
| Chaos / invariant suite (exactly-once, race, kill-switch, replay, tamper) | `server` | `policy.chaos.test.ts` |
| **Independent-oracle compliance console + red-team battery** | `server/src/domain/compliance.ts`, `redteamAttacks.ts` | `compliance.redteam.test.ts` |
| **Outbound-message factual-token validator** | `server/src/domain/messageValidator.ts` | `messageValidator.test.ts` |
| Artifact-locked claim numbers (docs can't drift from code) | `server` | `claims.docs.test.ts` |
| Model-health panel (calibration-over-time, PSI, latency) | `server/src/domain/modelHealth.ts` → `web` | UI Model page |
| README rewrite + reproduce + CI | `README.md`, `reproduce.sh`, `.github/workflows/ci.yml` | CI green |

The ML design is documented in depth in [`ARCHITECTURE.md`](./ARCHITECTURE.md) §7–§13 and this file §1–§3;
the panel-defense playbook and the governance/rigor rationale are in [`DEFENSE.md`](./DEFENSE.md). (The
originally-planned standalone `docs/ML_DESIGN.md` was folded into those three rather than duplicated.)

---

## 1. The ML crown — "Overwatch Uplift Engine v2"

### The insight

The field models the wrong quantity:

| What they model | Who | Weakness |
|---|---|---|
| **Propensity** `P(recover \| x, action)` | penball, sivan_rto, kirangunaga | Observational — biased by *who got which action*; answers "will it recover", not "does the action help" |
| **Online bandit** (LinUCB) | smit27ai, seagull_bandit | Cold-start, retry-only, and (their own finding) often loses to a good deterministic policy |
| **Nothing (LLM prompt)** | 18 of 22 | No trained model at all |

Our thesis is **incremental ₹** (treatment − control). The ML that *is* that thesis is **uplift /
causal treatment-effect modeling**: estimate, per case × per action, the **CATE**

```
τ_a(x) = P(recover | x, do(action a)) − P(recover | x, do(nothing))
```

We already run a randomized 20% no-action **control** holdout — the exact experimental data needed
to estimate τ causally. **No competitor models this.** It is the correct, defensible, strongest-in-
field choice.

### Architecture (7 layers)

```
                 features x (21+ schema)
                        │
   ┌────────────────────┼─────────────────────────────┐
   ▼                    ▼                               ▼
BASE p0(x)        UPLIFT τ_a(x)  per action        ANOMALY (IsolationForest)
no-action         X-learner / T-learner            escalation head
recovery          CatBoost base learners
prob (calibrated) benchmarked vs Causal Forest
   │                    │
   └─────► p_a = p0+τ_a ◄─── isotonic calibration per head (report ECE / Brier)
                        │
             EV DECISIONING:  a* = argmax_a [ τ_a(x)·amount − cost_a ]
                        │      cost-tuned operating threshold
                        ▼
             DETERMINISTIC POLICY GUARD (unchanged: caps, quiet hours, RBI TAT, AFA)
                        │
                        ▼
             SHAP per-case attribution ──► signed reason codes (UI)
```

**Layer 1 — Base + Uplift learners.** CatBoost base learners in an **X-learner** (Künzel et al.
2019) — robust when the control arm is small (ours is 20%), which is exactly our regime. Per-action
**T-learners** (one uplift head per action vs control) for clean, interpretable EV decisioning.
Benchmark T-learner vs X-learner vs S-learner vs **Causal Forest** (EconML) and pick by uplift
metric — the same "benchmark honestly and pick" discipline we already apply to CatBoost/XGB/LogReg.

**Layer 2 — Calibration.** Isotonic-calibrate every head; **report ECE + Brier + reliability
curve** per head (beats smit27ai's single ECE 0.024; nobody else calibrates at all).

**Layer 3 — EV decisioning.** Choose the action maximizing **expected incremental ₹ minus action
cost**, with a **cost-tuned operating threshold** (₹ of false-positive vs false-negative) — strictly
more general than sivan_rto's single threshold.

**Layer 4 — Explainability.** **SHAP** per-case on the chosen head → 3–5 signed, named reason codes
in the UI (matches sivan_rto's SHAP, exceeds everyone else's global-importance-only).

**Layer 5 — Off-policy evaluation.** Estimate the learned policy's incremental ₹ with **Inverse
Propensity Scoring (IPS)** and a **Doubly-Robust (DR)** estimator — the gold standard, variance-
reduced beyond smit27ai's pooled count-rate diff-in-means. Validate against the live control arm.

**Layer 6 — A/A null + rigor.** An **A/A test** proving the uplift/lift estimator reads ~0 when
treatment == control (unbiased) — matches smit27ai's load-bearing test. Time-ordered split, bootstrap
CIs, **Qini coefficient / AUUC / uplift@decile** (the correct uplift metrics — nobody reports them).
Keep **cross-world transfer** (freeze uplift model, score an independent world).

**Layer 7 — Online exploration (optional).** **Thompson sampling** over the uplift model's posterior
for principled continual exploration — subsumes the bandit crowd without their cold-start, and gives
us the "online learning" story on a roadmap slide even if left as a stub.

> Honesty note: clean *per-action* causal estimates ideally want per-action randomization. We start
> with T-learners on observational treatment data + the randomized control baseline, **IPS/DR-
> corrected** for action assignment, and state this assumption explicitly (the kind of candor that
> scores). A small per-action ε-random assignment can be added to harden it.

### The one-line panel claim

> "Everyone else predicts *whether* a payment recovers, or *tries* actions online. We model the
> *causal uplift* of each action from a randomized holdout — the exact incremental-₹ quantity our
> thesis claims — pick actions by expected incremental value, and prove the policy with doubly-robust
> off-policy estimates and a Qini curve."

### Why it beats each ranked ML model

| Competitor | Their ML | How v2 dominates |
|---|---|---|
| smit27ai | calibrated logreg + LinUCB, A/A, count-rate | Uplift > propensity; DR-OPE > count-rate diff; we keep A/A + add Qini + SHAP + transfer |
| sivan_rto | RF/XGB + CV + SHAP + cost threshold | We add uplift, calibration, anomaly, transfer, OPE — and we're on-brief (payments, not RTO) |
| seagull_bandit | disjoint LinUCB | Offline uplift (no cold-start) + optional Thompson = their exploration, principled |
| penball | XGB/LogReg select-by-AUC | We add causal uplift, calibration, time-split, SHAP, OPE, multi-output |
| kirangunaga | RandomForest cause classifier | Different (diagnosis only); we subsume it as one head |

### Metrics we will report (the scoreboard)

- **Uplift**: Qini coefficient, AUUC, uplift@decile
- **Calibration**: ECE, Brier, reliability curve (per head)
- **Ranking**: ROC-AUC with bootstrap 95% CI (recovery head)
- **Policy value**: DR / IPS off-policy incremental ₹, vs control arm
- **A/A**: null-lift |mean| < 0.01 (estimator unbiased)
- **Transfer**: frozen-model AUC on an independent world

---

## 2. Strengthening plan — every aspect

### 2.1 ML tier (`ml/`)
- Uplift engine (X/T-learner CatBoost) + benchmark harness
- Per-head isotonic calibration; ECE/Brier/reliability export
- SHAP per-case attribution export
- DR/IPS off-policy evaluation
- Cost-tuned EV decisioning + operating threshold
- PSI/drift + score-distribution monitoring export
- Keep XGB/LogReg baselines, IsolationForest, cross-world transfer
- (opt) Thompson-sampling exploration layer

### 2.2 Measurement & rigor
- **A/A null test** for the Recovery Lab estimator (highest-credibility-per-hour add)
- **Multi-strategy CI table** — surface the 4 eval arms (no-action / rules-only / ml-policy / oracle) we already compute in `ml/src/eval.py`
- Qini/uplift curve + calibration-over-time on the Model page

### 2.3 Backend & code quality (`server/`)
- Wire uplift τ_a + EV into `decide.ts`; persist per-action uplift + SHAP in `Prediction`
- **Hash-chain the AuditLog** (tamper-evident) + `verifyChain()` endpoint (matches smit27ai's ledger)
- **Chaos test suite** (invariant-first): exactly-once, race, kill-switch, webhook-replay, ledger-tamper
- Expand tests toward the field-leader's breadth; `mypy --strict` on `ml/`, ruff, property tests (fast-check already a dep)

### 2.4 Frontend (`web/`)
- **F5 reason codes** on case detail (SHAP-backed, signed factors, grouped)
- Per-action **EV / uplift bars** on case detail (show *why this action*)
- **F8 model-health panel** (calibration-over-time, PSI, latency)
- Qini/uplift curve on Model page; multi-strategy CI table on Lab page
- (P2) drill-down → prefiltered queue + CSV export; command palette

### 2.5 README & docs
- **README rewrite** — reflect the uplift engine + current dashboard (funnel, impact chart, incident strip) + honest metrics + Razorpay-stack positioning. Current README is stale (predates 3 feature waves).
- `docs/ML_DESIGN.md` — this uplift architecture in depth
- "What holds when things break" (chaos) section + a candor section ("bugs the numbers found")
- Model card with Qini/ECE; refresh DATA_CARD

### 2.6 Testing & CI
- A/A test, uplift-eval tests, calibration test, OPE-unbiasedness test
- CI runs pytest + mypy + ruff + vitest + (P2) chaos suite
- Coverage target on the money path

---

## 3. Module-wise roadmap

Priority: **P0** = wins the panel / closes the gap · **P1** = production depth · **P2** = polish.

### `ml/`
| Task | Pri | Effort | New file |
|---|---|---|---|
| Uplift engine (X/T-learner CatBoost) + benchmark | P0 | L | `ml/src/uplift.py` |
| Qini / AUUC / uplift@decile eval | P0 | M | `ml/src/uplift_eval.py` |
| Per-head isotonic calibration + ECE/Brier | P0 | M | extend `train.py` |
| SHAP per-case attribution export | P0 | M | `ml/src/explain.py` |
| Doubly-robust / IPS off-policy eval | P1 | L | `ml/src/ope.py` |
| Cost-tuned EV threshold | P1 | S | extend serve |
| PSI / drift monitor export | P1 | M | `ml/src/monitor.py` |
| Thompson-sampling exploration | P2 | L | `ml/src/explore.py` |

### `server/`
| Task | Pri | Effort |
|---|---|---|
| Consume τ_a + EV in `decide.ts`; persist uplift+SHAP in `Prediction` | P0 | M |
| A/A null test for Lab estimator | P0 | S |
| Multi-strategy CI endpoint (surface eval arms) | P0 | S |
| Hash-chained AuditLog + `verifyChain` + endpoint | P1 | M |
| Chaos/invariant test suite | P1 | L |
| Expand money-path + policy tests | P1 | M |

### `web/`
| Task | Pri | Effort |
|---|---|---|
| F5 SHAP reason codes on case detail | P0 | M |
| Per-action EV/uplift bars on case detail | P0 | M |
| Multi-strategy CI table (Lab) + Qini curve (Model) | P1 | M |
| F8 model-health panel (calibration/PSI/latency) | P1 | M |
| Drill-down → queue + CSV export; Cmd+K | P2 | M |

### `docs/` + `README.md`
| Task | Pri | Effort |
|---|---|---|
| README rewrite (uplift + current dashboard + honest metrics) | P0 | M |
| `docs/ML_DESIGN.md` (uplift architecture) | P0 | M |
| Chaos + candor sections; model card w/ Qini/ECE | P1 | S |

### CI / quality (cross-cutting)
| Task | Pri | Effort |
|---|---|---|
| A/A + uplift-eval + calibration tests in CI | P0 | S |
| `mypy --strict` on `ml/`, ruff, property tests | P1 | M |
| Chaos suite in CI | P2 | M |

---

## 4. Phasing — as executed

**Phase 1 — "Beat the field" (the panel-winning core). ✅ Shipped.**
Uplift engine + Qini/ECE + SHAP reason codes (ml + web) + A/A test + multi-strategy CI table +
README rewrite.

**Phase 2 — "Production depth." ✅ Shipped.**
DR off-policy eval + model-health panel + hash-chained audit + chaos suite + expanded tests. Went
*beyond* the original plan: conformal prediction, real-RCT (Hillstrom) external validation, an
independent-oracle compliance console with a red-team battery, an outbound-message factual-token
validator, DB-enforced append-only audit with forensic tamper classification, and an artifact-locked
claims test so the numbers in these docs can't silently drift from the code.

**Phase 3 — "Polish & optional." ✅ Mostly shipped.**
Thompson-sampling exploration shipped (`ml/src/explore.py`). Scheduled reports / command palette were
judged diminishing-returns and deliberately left out.

---

## 5. Still ahead (production, not buildathon)

The honest forward list — what a real merchant deployment needs that a 12-day build correctly did not:

- **Live merchant data** replacing the synthetic world — the whole point of the synthetic→real flywheel
  (ADR-012/015). Real signed `payment.captured` outcomes retrain the same feature schema in place.
- **Per-action randomization** (a small ε-random assignment) to harden the causal per-action estimates
  beyond today's T-learners-on-observational-data + randomized control baseline (§1 honesty note).
- **Durable retry queue** (BullMQ/Redis or a scheduled cloud function) replacing the in-process
  scheduler (ADR-008), and a **transactional outbox** for per-endpoint idempotency (ADR-018 follow-up).
- **Model registry + drift-triggered retraining** — modelHealth already exports PSI/calibration-over-time;
  the missing piece is the automated registry + promotion gate.
- **DPDP data-fiduciary controls** — PII hashing, retention windows, erasure-on-opt-out, breach reporting.
  The top compliance gap, owned openly ([`COMPLIANCE.md`](./COMPLIANCE.md), ADR-016).
- **Cross-merchant network intelligence** — deliberately deferred as off-thesis for a per-merchant
  decision layer; noted so the decision is a choice, not an oversight.
