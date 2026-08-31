# Overwatch — Postmortem: what broke, and how we got out

> **Read this first.** Overwatch is a bounded, ML-first revenue-recovery system for Razorpay (see
> [`README.md`](README.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)). This document is not a
> highlight reel — it is the times the build was *wrong*, how each was caught, and the committed artifact
> that now stops it recurring. The headline (Incident 1) is the one that matters most: our best model
> scored 99.5% and had learned nothing, and the story of how we found that out is the story of why the
> current numbers are trustworthy.
>
> It answers the "**what broke, and what you did about it**" question directly — five real incidents, each
> with the committed regression that pins the fix — and then goes one further: a **failure-*prevention***
> layer of CI guards that make the classic failure of this field (a headline number that isn't true)
> structurally impossible to ship.

Every incident below is real. Each follows the same shape: **Symptom → Diagnosis → Root cause → Fix →
Regression** (the committed thing that stops it happening again). All metrics quoted are the *post-fix*
numbers in the git-tracked contract [`ml/metrics.json`](ml/metrics.json) unless stated otherwise.

---

## Incident 1 — The 99.5% model that had learned nothing

**Severity: critical (would have failed the panel's first question).**

### Symptom
The first "clean" training run looked spectacular. The action-head classifier scored **99.5% accuracy**
choosing the next-best recovery action, and the escalation head scored **0.999 ROC-AUC**. For a tabular
model on a six-way decision problem, those numbers are not "good" — they are a smell.

### Diagnosis (how we found it)
We ran the models past an **adversarial eval panel** whose only job was to disbelieve the numbers. They
flagged it in one sentence: *this is a tautology, not a model.* The trace was mechanical to follow once
named. In `ml/src/worldmodel.py`, the ground-truth `best_action` label was computed as the deterministic
`argmax` over a **clean** expected-value formula, `EV(a) = p(a) · collectable(a) − cost(a)`, where every
`p(a)` was itself a deterministic function of the row's features (`success_prob(...)`). The label was
therefore a closed-form function of the inputs. A gradient-boosted tree with enough depth doesn't *learn*
that — it *memorizes the equation*. The escalation label had the same defect: it was a clean threshold on
those same clean probabilities, so its 0.999 AUC was the model re-deriving an `if` statement.

### Root cause
**Label leakage by construction.** There was no irreducible uncertainty between features and label. When
`best_action = argmax_a EV(a, clean_p)` and `clean_p = f(features)`, the Bayes-optimal error is ~0, so any
sufficiently expressive model approaches 100%. The metric was measuring the model's capacity to fit an
algebraic identity, not its ability to decide under uncertainty — which is the actual job in production,
where outcomes are noisy.

### Fix
`ml/src/worldmodel.py` now injects irreducible noise **between** the clean world mechanism and the label.
Per action, we draw a multiplicative log-normal perturbation and label off the *noisy* draws, not the
clean expectation:

```python
# per-action multiplicative log-normal noise, sigma = 0.22
p_noisy = {a: clip(p_by_action[a] * exp(N(0.0, 0.22)), 0.01, 0.98) for a in ACTIONS}
best_action = max(ACTIONS, key=lambda a: ev(a, p_noisy))          # argmax over NOISY EV
automated_recoverable = int(max(p_noisy[a] for a in automated) >= 0.35)  # escalation label, also noisy
```

The model only ever sees the features (i.e. the clean *expectation*), so it learns the expected-best
action but is **genuinely wrong whenever noise flips which action won** — exactly the case near a
decision boundary. This turns the action and escalation heads into a real learning problem.

The numbers moved to where an honest model sits:

| Metric | Before (tautology) | After (noisy labels) |
|---|---|---|
| Action-head accuracy | 99.5% | **~70%** (CatBoost 0.704) |
| Agreement with EV-optimal action | — | **~84%** (0.838) |
| Escalation ROC-AUC | 0.999 | **0.965** (Brier 0.078) |
| Recovery ROC-AUC (calibrated) | — | **0.751**, 95% CI **[0.739, 0.765]** |

Crucially, the fix also let us tell the truth about model *choice*. A paired-bootstrap test
(`bootstrap_diff_ci` in `ml/src/train.py`) now **admits** that CatBoost's edge over the logistic-regression
baseline is only **+0.013** (CI [0.006, 0.020] — excludes zero, but the individual AUC intervals overlap).
So the model card justifies CatBoost on *calibration + native categorical handling*, not a headline AUC gap.
A 70% number we can defend beats a 99.5% number we can't.

### Regression (what stops it recurring)
- The **metrics contract** is git-tracked at [`ml/metrics.json`](ml/metrics.json). `ml/src/train.py` writes
  both `ml/artifacts/metrics.json` and this tracked copy on every run, so a change in the numbers shows up
  in a diff instead of being silently re-baselined.
- The **red-flag rule is written into [`docs/DECISIONS.md`](docs/DECISIONS.md) ADR-012**: an action-head
  accuracy back above ~0.95 is to be read as a *regression to the tautology*, not a win. The noisy-label
  caveat is surfaced on the dashboard model card next to the number, so a reviewer never sees the accuracy
  without the reason it isn't higher.

---

## Incident 2 — CatBoost won't clone (calibration)

**Severity: high (blocked the one probability that's allowed into EV math).**

### Symptom
`recovery_probability` is the number the pipeline thresholds and feeds into expected-value decisions, so it
must be **calibrated**. Wrapping the prefit CatBoost recovery model in scikit-learn's
`CalibratedClassifierCV` raised, immediately:

```
RuntimeError: cannot clone object <CatBoostClassifier ...>
```

### Diagnosis (how we found it)
The stack trace pointed straight at `sklearn.base.clone`. `CalibratedClassifierCV` internally *clones* its
base estimator before fitting the calibrator. `clone()` round-trips the estimator through
`get_params()`/`set_params()` and then asserts the clone is parameter-identical to the original. Our
CatBoost model is constructed with `cat_features=RECOVERY_CATEGORICAL` (native categorical handling — the
whole reason we picked CatBoost), and that parameter does not survive sklearn's clone-equality contract, so
the assertion throws before any calibration happens.

### Root cause
An **API contract mismatch**: sklearn's cross-validated calibration assumes a base estimator it is free to
re-clone and re-fit, but we specifically want to calibrate the *already-fitted* CatBoost without retraining
it (and its `cat_features` config is not clone-safe). The default `CalibratedClassifierCV` path is simply
the wrong tool for a prefit, categorically-configured model.

### Fix
Freeze the fitted estimator so it is never cloned or re-fit, and calibrate it on a dedicated held-out split
(`ml/src/train.py`). `FrozenEstimator` is the modern replacement for the old `cv='prefit'` idiom:

```python
# fit CatBoost on 80% of train, calibrate on the held-out 20% — the model is frozen, never re-cloned
cb_raw = CatBoostClassifier(..., cat_features=RECOVERY_CATEGORICAL)
cb_raw.fit(X_fit, y_fit)
cb_cal = CalibratedClassifierCV(FrozenEstimator(cb_raw), method="isotonic")
cb_cal.fit(X_cal, y_cal)
```

The recovery head calibrates with isotonic; the escalation head uses the same `FrozenEstimator` pattern
with `method="sigmoid"`. Calibrating on a *separate* split (not the training rows) is also the cleaner
story: the reliability we report is measured on data the base model never saw.

### Regression (what stops it recurring)
The **reliability curve shipped on the dashboard model card is the visible proof calibration is applied.**
`train.py`'s `reliability()` writes a predicted-vs-observed table into
`metrics["recovery"]["calibration_curve"]`, and the model card plots it. If the `FrozenEstimator`
wrapping ever regressed to raw uncalibrated scores, the curve would visibly bow off the diagonal on the
dashboard — the calibration isn't an internal claim, it's rendered where the panel can see it.

---

## Incident 3 — The kill that took down the database, and the 30-link cap

**Severity: medium (ops) + medium (integration) — a double, both caught by reality rather than by us.**

### 3a — A broad process-kill matching "tsx" killed the embedded Postgres

**Symptom.** While restarting dev servers, a broad "kill anything matching `tsx`" command took the whole
app down — including the database. Queries started failing against a Postgres that was no longer there.

**Diagnosis.** Overwatch runs a *real* embedded PostgreSQL 18 for local dev (no Docker) via
`npm run db:local`, which is `tsx src/scripts/localdb.ts` (see `server/package.json`). The dev API
(`tsx watch src/index.ts`), the retry worker (`tsx watch src/worker/index.ts`), and the DB supervisor
**all run under the `tsx` runtime.** A process filter matching the runtime name swept up the database
supervisor alongside the servers it was meant to stop.

**Root cause.** Identifying processes by **runtime name is ambiguous** — several unrelated processes share
`tsx`, and one of them owns durable state (the DB).

**Fix / lesson encoded as a rule.** Stop dev processes **by PORT only, never by matching the runtime
name**: API `:8787`, web `:5173`, ML `:8899`, and the DB on `:5432` is *never* a kill target. This is now
the standing rule for the project's dev-process management, so "restart the servers" can't reach the
database again.

### 3b — Real Razorpay test-mode returned RATE_LIMIT_EXCEEDED at the 30-link cap

**Symptom.** During the **signed webhook self-test**, driving the full path against the *real* Razorpay
**TEST** API, link creation started returning `RATE_LIMIT_EXCEEDED`.

**Diagnosis.** Razorpay test mode caps a business at **30 payment links**. The self-test creates *real*
test-mode links end-to-end, and repeated runs crossed that ceiling. This was not a bug in Overwatch — it was
a genuine upstream limit, hit for real.

**Root cause.** A hard upstream constraint on the test environment, surfaced under exactly the conditions
(repeated real link creation) the self-test is designed to exercise.

**Fix.** The executor already treats gateway failure as a first-class case, and this proved it under a real
limit. In `server/src/domain/executor.ts`, `makePaymentLink()` wraps the live `createPaymentLink` call in
try/catch; on failure it logs `razorpay.link_failed` and **degrades gracefully to a simulated link** rather
than crashing the recovery:

```ts
} catch (err) {
  // Gateway failure must not crash the recovery — degrade to a simulated link and log why.
  logger.warn('razorpay.link_failed', { caseId, amountPaise, error: toMessage(err) });
}
// ... falls through to a simulated link; the case still advances
```

The case still transitioned correctly to `waiting_for_outcome`. So the rate limit didn't break the demo —
it *demonstrated* the executor's failure handling against a real upstream ceiling, which is a stronger
result than a clean run would have been.

### Regression (what stops it recurring)
[`server/src/scripts/webhookSelftest.ts`](server/src/scripts/webhookSelftest.ts) (`npm run
selftest:webhook`) is the **committed, replayable scenario.** Part A verifies the production HMAC-SHA256
signature path as a pure function (valid accepted; tampered body, tampered signature, wrong secret, and
missing header all rejected). Part B drives the full *signed* round-trip through the live server —
`payment.failed` → case ingested → `runCase()` attaches a real ML decision → signed `payment.captured`
flips the case to `recovered` → a tampered signature is rejected with HTTP 400. Because the executor
degrades to a simulated link on upstream failure, the self-test stays green *through* a rate limit instead
of flaking on it — the graceful-degradation behavior is pinned by a test that runs the real path.

---

## Incident 4 — The tamper-evident ledger that flagged itself as tampered

**Severity: high (the audit trail is the trust anchor; if it can't verify a clean ledger, it's worthless).**

### Symptom
The SHA-256 hash-chained audit ledger is meant to prove nothing was altered — re-walk the chain, recompute
each row's hash, confirm every link. On an **untampered** ledger, `verifyAllChains()` started reporting
`valid: false`: the chain accused itself of tampering that never happened.

### Diagnosis (how we found it)
The write-time hash (computed in `logAudit` before insert) and the verify-time hash (recomputed after
reading the row back from Postgres) disagreed. Three distinct causes, each found by narrowing which rows and
which fields diverged:
1. **`jsonb` float drift.** Postgres round-trips a JSON number through `numeric`, which can change the ~16th
   significant digit (`0.42947368421052627` → `0.4294736842105263`). Hashing the raw double made write and
   read hashes differ on any row whose `details` held a probability.
2. **Same-millisecond ordering ties.** `logAudit` picked the previous row and `verifyCaseChain` walked the
   chain using *different* orderings; when several rows shared a `createdAt` millisecond (rapid transitions),
   the two sides disagreed on chain order and the links broke.
3. **Dropped `undefined` keys.** `undefined`-valued fields serialized inconsistently vs how `jsonb` stored them.

### Root cause
**Non-determinism between write-time and read-time canonicalization.** A hash chain is only sound if the
exact same bytes are hashed on both sides; three separate serialization/ordering mismatches violated that.

### Fix
In `server/src/domain/audit.ts`, `stableStringify` now canonicalizes numbers to **12 significant figures**
(absorbing the sub-ULP `jsonb` drift while preserving every semantically meaningful value), sorts keys, and
drops `undefined`. `logAudit` and `verifyCaseChain` were aligned to the **same** `[createdAt, id]` ordering
so same-millisecond rows chain identically on both sides.

### Regression (what stops it recurring)
[`audit.chain.test.ts`](server/src/domain/__tests__/audit.chain.test.ts) re-walks a chain and asserts a
clean ledger verifies — and that every tamper class (content edit, reorder, deletion, insertion) is caught
*and classified* (content-altered vs chain-relinked). We then went one better than "evident": a Postgres
**append-only trigger** now rejects any `UPDATE`/`DELETE` on a ledger row, and a live, non-destructive probe
on the Evidence page proves it. The ledger can no longer disagree with itself, and it can no longer be
rewritten at all.

---

## Incident 5 — The capture we refused to fake

**Severity: medium (integrity) — the failure was a temptation, and the recovery was saying no.**

### Symptom
Our strongest un-fakeable asset is **real, replayable Razorpay test-mode captures**. To widen the evidence
from card to UPI + netbanking, the plan needed to complete Razorpay's hosted Checkout for those rails
programmatically. It couldn't be done: the checkout renders in a **cross-origin iframe** that synthetic
keystrokes can't reach, and contact + OTP entry is mandatory. The feature was blocked.

### Diagnosis / the fork
There were two ways out. The easy one: hand-write UPI/netbanking capture payloads that *look* real and
commit them to the evidence fixture — nobody would diff them at a glance. The hard one: accept the block.

### Root cause
The whole point of the real-captures asset is that it is **the one thing the field can't fake** — every
rival simulates payments. Fabricating a "real" capture to fill a table would have destroyed exactly the
property the asset exists to provide, and quietly turned our credibility story into the thing we criticize.

### Fix
We refused to fabricate. We kept the genuine, API-fetched card captures, shipped
[`appendProof.ts`](server/src/scripts/appendProof.ts) — a one-command tool that records a genuinely
**captured** payment (fetched from the Razorpay API, `status === "captured"`) once a checkout is completed
by hand — and documented the limitation plainly rather than papering over it.

### Regression (what stops it recurring)
The evidence fixture only ever holds captures fetched from `GET /v1/payments/{id}`; `replayRoundtrip.ts`
asserts `status === "captured"` before it will replay one; and `appendProof` skips anything not genuinely
captured. There is no code path that writes a simulated payment into the real-capture evidence — the
integrity is structural, not a promise.

---

## Failure prevention: the classic hackathon failure, made impossible

The most common failure in this field isn't a crash — it's a **headline number that isn't true.** Several of
the strongest competitors caught theirs by hand and disclosed it (one walked back a "1790% uplift"; another
shrank +10pp to +5pp after finding a bug). That honesty is admirable — but we went one step further and made
that failure **structurally impossible to ship**, with three committed guards that turn "trust our numbers"
into "the build fails if a number is wrong":

- **Artifact-locked numbers** — [`claims.docs.test.ts`](server/src/domain/__tests__/claims.docs.test.ts)
  pins every headline figure in the README and demo runbook to the exact ML artifact that produced it. A
  retrain that moves a number, or a doc that quotes one the artifact doesn't support, turns **CI red**. You
  cannot commit an inflated number.
- **Confidence bands** — [`ml.bands.test.ts`](server/src/domain/__tests__/ml.bands.test.ts) fails the build
  if any committed artifact drifts outside its quality band, so a degraded retrain is caught before its
  number is ever quoted.
- **The A/A null test** — [`lab.aa.test.ts`](server/src/domain/__tests__/lab.aa.test.ts) proves the lift
  estimator reads ~0 on two identical arms *before* any lift number is believed; the incrementality claim
  can't be an artifact of the estimator.

Failure recovery is documenting what broke and fixing it. Failure *prevention* is a test that makes the
break impossible next time. We do both — and the "next time" guard is the one a panel can run.

---

## What these have in common

None of these was caught by us congratulating ourselves — **each was caught by an adversarial check we
didn't control, or by reality.** Incident 1 was an eval panel that refused to believe a 99.5% number.
Incident 2 was a `RuntimeError` thrown by scikit-learn the moment we tried to calibrate. Incident 3 was
reality: a runtime that shares a name across processes, and a real upstream API enforcing a real limit.
Incident 4 was the ledger's own verifier refusing to pass a clean chain. Incident 5 was a temptation — and
the recovery was declining to fake the one asset the field can't fake.

And in every case the fix is not a promise in a doc — it is **pinned by a committed artifact** that fails or
diffs loudly if the bug returns: the git-tracked metrics contract (`ml/metrics.json` + ADR-012's red-flag
rule), the reliability curve on the model card, the signed webhook self-test, the hash-chain + append-only
audit tests, and the integrity-by-construction of the evidence fixture. That is the throughline: we trust
the numbers because we tried hardest to break them, the checks that broke them are still running — and the
few failures we couldn't tolerate at all, we made **structurally impossible** rather than merely watched for.
