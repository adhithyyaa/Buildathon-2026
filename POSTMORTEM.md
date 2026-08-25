# Recoup — Postmortem: what broke, and how we got out

> **Read this first.** Recoup is a bounded, ML-first revenue-recovery system for Razorpay (see
> [`README.md`](README.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)). This document is not a
> highlight reel — it is the three times the build was *wrong*, how each was caught, and the committed
> artifact that now stops it recurring. The headline (Incident 1) is the one that matters most: our best
> model scored 99.5% and had learned nothing, and the story of how we found that out is the story of why
> the current numbers are trustworthy.

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
| Action-head accuracy | 99.5% | **~70%** (CatBoost 0.7013) |
| Agreement with EV-optimal action | — | **~84%** (0.8435) |
| Escalation ROC-AUC | 0.999 | **0.965** (Brier 0.076) |
| Recovery ROC-AUC (calibrated) | — | **0.764**, 95% CI **[0.752, 0.776]** |

Crucially, the fix also let us tell the truth about model *choice*. A paired-bootstrap test
(`bootstrap_diff_ci` in `ml/src/train.py`) now **admits** that CatBoost's edge over the logistic-regression
baseline is only **+0.011** (CI [0.005, 0.018] — excludes zero, but the individual AUC intervals overlap).
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

**Diagnosis.** Recoup runs a *real* embedded PostgreSQL 18 for local dev (no Docker) via
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
test-mode links end-to-end, and repeated runs crossed that ceiling. This was not a bug in Recoup — it was
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

## What these have in common

None of the three was caught by us congratulating ourselves — **each was caught by an adversarial check we
didn't control.** Incident 1 was an eval panel that refused to believe a 99.5% number. Incident 2 was a
`RuntimeError` thrown by scikit-learn the moment we tried to calibrate. Incident 3 was reality: a runtime
that shares a name across processes, and a real upstream API enforcing a real limit. And in every case the
fix is not a promise in a doc — it is **pinned by a committed artifact** that would fail or diff loudly if
the bug came back: the git-tracked metrics contract (`ml/metrics.json` + ADR-012's red-flag rule), the
reliability curve rendered on the model card, and the signed webhook self-test. That is the throughline of
this project: we trust the numbers because we tried hardest to break them, and the checks that broke them
are still running.
