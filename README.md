# Sentinel AI — Where Nothing Slips Through

> **Bounded, ML-first revenue recovery for Razorpay.** Recover the revenue you already earned. Sentinel detects failed payments and abandoned checkouts, uses **calibrated
> machine-learning models** to decide the safest recovery move and how likely it is to work, executes it with **real
> Razorpay payment links** under hard policy limits, and proves — with a **signed webhook round-trip** — exactly how
> much money it brought back.

**Razorpay AI Buildathon 2026 · Track: AI Revenue Recovery**

---

## The one-line thesis

Payment failure in India is usually *mechanical and recoverable* (UPI timeout, bank downtime, a momentary decline),
not a change of heart. The right recovery is **decisioning under constraints** — the right action, on the right channel,
at the right time — which is a tabular ranking/classification problem, not a language problem. So in Sentinel the
**machine-learning models decide**, a deterministic **policy engine disposes** (it can override or block any decision),
a deterministic **executor** moves the money, and an **LLM is used only to explain** — never to decide.

## Who it's for

**Mid-market Indian D2C / subscription merchants at ~₹50L–₹5Cr/month on Razorpay** — big enough that 1–2 recovery
points is ₹1–10L/month, too small to build a recovery/data-science team. Razorpay already ships real, capable recovery
products these merchants can turn on: **Agent Studio's Subscription Recovery and Abandoned Cart Conversion agents**
(early access since Mar 2026, built on Anthropic's Claude Agent SDK), the **Intelligent Retry Engine** (WhatsApp nudges
for failed autopay debits), the **RazorpayX Receivables Agent** (invoice follow-up, Jun 2026 beta), **Optimizer**
(enterprise ML routing) and **Vulcan** (the payments foundation model, Aug 2026). Sentinel doesn't compete with any of
them — it's the **measurement-and-governance layer that plugs *under* them**: holdout-measured incremental recovery,
calibrated per-case probabilities, deterministic error-reason triage before any model, India policy-as-code, and an
append-only audit trail — the things none of those products publish. *(Doesn't Razorpay already do this?* — see
[ADR-014](docs/DECISIONS.md) and [Architecture §12](docs/ARCHITECTURE.md).)*

## The standout: a live Recovery Lab (incremental ₹, not gross)

Every recovery tool claims "we recovered ₹X". The number that actually matters — and that neither Razorpay nor the
vendors publish — is **₹X *more* than would have happened anyway**. Sentinel runs an always-on **holdout**: a random 20%
of cases are a no-action **control** arm, and the dashboard shows the **incremental** recovered ₹ (treatment − control)
with a **95% bootstrap CI**, sliced per failure reason. In the demo the treatment arm recovers **~48%** vs a much lower
control — a large, **significant** lift. It doubles as a live A/B / drift signal on the model, and it closes the loop:
any reason where treatment doesn't beat control is flagged for **auto-suppression** (stop wasting actions there). The
lift estimator itself is **A/A-tested** — on two statistically identical arms it must read ~0 lift with a CI spanning
zero (`server/src/domain/__tests__/lab.aa.test.ts`), so the headline number can't be an artifact of the estimator. This
is the measurement-and-governance layer that turns Razorpay's recovery from "trust us" into "here's the proven, CI-bounded
incremental value" — see [`docs/ARCHITECTURE.md` §13](docs/ARCHITECTURE.md).

## What makes it credible (not just a demo)

- **Causal uplift, not just propensity.** The field predicts *whether* a payment recovers. Sentinel models the
  **uplift** — `τ_a(x) = P(recover | do action a) − P(recover | do nothing)` — the *incremental* recovery each action
  **causes**, which is exactly the ₹ our thesis claims and which no competitor models. An S-learner (action-as-feature
  CatBoost) is benchmarked against a T-learner (per-action CatBoost on a randomised RCT arm) and selected by Qini.
  Because the synthetic world exposes its ground-truth mechanism, uplift is checked against **known truth**: **Qini
  ≈ 0.93**, **ECE ≈ 0.008**, and an uplift-optimal policy that captures **~99% of the oracle's incremental ₹** (beating
  a rules-only baseline +5.4%, always-retry +39%). See [`docs/ROADMAP.md`](docs/ROADMAP.md) and `ml/src/uplift.py`.
- **Proven from the log alone (doubly-robust off-policy eval).** Beyond the ground-truth check, the deployed policy's
  value is estimated the way you'd have to in production — from the historical log, with **IPS** (reweight by the
  behaviour propensity) and a **doubly-robust** estimator (adds a reward-model control variate to cut variance). DR
  estimates **₹3,276/case vs the logging policy's ₹2,442**, and — because ground truth is available here — lands within
  **~6%** of it. Stronger than a raw treatment−control mean (`ml/src/uplift.py`).
- **Externally validated on a real public RCT.** The synthetic-world critique cuts both ways, so the *same* uplift +
  doubly-robust machinery is re-run on the real **Hillstrom** e-mail RCT (**64,000** randomised customers): our DR
  estimator recovers the trial's ground-truth ATE (**+6.1pp**) to within **1.9%**, with the **x-learner** ranking best
  by Qini. External validity, not just the world we built (`ml/src/rct_validate.py` → [`ml/rct_validation.json`](ml/rct_validation.json)).
- **Per-case certainty with a coverage guarantee.** Split **conformal prediction** turns each recovery probability into a
  prediction *set* with a distribution-free, finite-sample guarantee — target **90%**, empirical **90.7%** on a fresh
  split. Every case resolves to *confidently recoverable*, *confidently not*, or *uncertain → route to a human* — the
  uncertain ones are an honest hand-off, not a forced guess (`ml/src/conformal.py` → [`ml/conformal.json`](ml/conformal.json)).
- **Production model-health monitoring.** A live drift panel answers *"does the model still work on live traffic?"* —
  per-feature **PSI** vs training (0.1 watch / 0.25 shift), the score distribution, and real inference latency (p95 ≈ 85ms).
  Trigger a failure spike and the reason PSI visibly moves watch → shift; it's a live instrument, not a green light.
- **ML that actually decides.** Every case is scored by CatBoost (benchmarked vs XGBoost + a LogReg baseline) over a
  shared 21-feature schema, producing six outputs: **calibrated** recovery probability, chosen action + per-action odds, escalation
  risk, anomaly score, action confidence, and reason. The dashboard shows a model card with the reliability curve.
- **Honest numbers.** Recovery ROC-AUC ≈ **0.76** (95% CI reported; CatBoost's edge over the baseline is real but small,
  so it's justified on *calibration + native categoricals*, not a headline gap). Action head ≈ **70%** accuracy on
  *deliberately noisy* labels (≈**84%** agreement with the EV-optimal action) — a real learning problem, stated as such.
  Failure-spike detection ≈ **87.5%**. Metrics are on synthetic data, and we say so.
- **Cross-world transfer** ([`ml/transfer.json`](ml/transfer.json)). A recovery model trained on one synthetic world and
  **frozen** still ranks the *independently designed* other world's recoveries at ROC-AUC ≈ **0.68 in both directions**
  (chance 0.50, in-world ceiling ≈ 0.80) — while the action-policy edge does **not** transfer (rules-parity A→B, below
  rules B→A). Shared payment-recovery structure generalizes; world-specific policy does not — both results ship
  unfiltered (`python ml/src/transfer.py`).
- **Real Razorpay test-mode** Orders + Payment Links + Webhooks. Pay a recovery link with a test card → a **signed**
  webhook flips the case to `recovered` and the recovered-₹ counter moves. Ships with an all-green **signed self-test**
  (`npm run selftest:webhook`) — see [`docs/WEBHOOKS.md`](docs/WEBHOOKS.md).
- **Controlled AI.** No model touches money. The LLM only explains a decision, drafts the message, and summarizes
  escalations — off the money path, with template fallback.
- **Tamper-evident audit ledger.** Every state transition is logged (`before → after`, actor, details) *and*
  **SHA-256 hash-chained** per case, so any edit, reorder, or deletion is detectable by re-walking the chain
  (`/api/audit/verify`; a "chain verified ✓" badge on each case). A ledger that could be rewritten would defeat its own
  purpose.
- **Tested where it matters.** The money path (exactly-once recovery under concurrent webhook redelivery), the policy
  guardrails as **property-based invariants** (fast-check — opt-out never contacted, RBI-TAT always held, retry cap
  respected, decisions deterministic, over thousands of randomised inputs), the incremental-lift estimator's **A/A null
  test**, and the audit chain's tamper detection — **39 tests**.

### Real captured round-trip (not just a self-test)

Beyond the signed self-test above, **two REAL Razorpay test-mode payments** were captured through Razorpay's hosted
**Checkout + 3DS** flow and recovered real cases via the **production signed-webhook path** — the same code that runs
in the demo, exercised end-to-end by an actual payment. The captured payments (as fetched back from the Razorpay API)
are committed at [`server/fixtures/razorpay/live-captures.json`](server/fixtures/razorpay/live-captures.json), with the
real payment ids `pay_TTxufNdQ8rLAvB` and `pay_TTyBx4OQoIQFkj`.

You can replay that exact round-trip against a local server — **no keys, no tunnel, no dashboard**:

```bash
# terminal A
cd server && RAZORPAY_WEBHOOK_SECRET=whsec_local_selftest npm run dev
# terminal B
cd server && RAZORPAY_WEBHOOK_SECRET=whsec_local_selftest npm run replay:roundtrip   # → prints "✅ REPLAYED …"
```

Full write-up: [`docs/WEBHOOKS.md`](docs/WEBHOOKS.md).

## Architecture at a glance

```
Razorpay webhook / CSV / demo panel
    → normalize → deterministic risk-score → 21-feature build
    → ML SERVICE (CatBoost · XGBoost · Uplift/CATE · IsolationForest · calibration)  → decision + per-action uplift + calibrated probabilities
    → POLICY ENGINE (deterministic, can override) → executor (real payment link / smart retry / message / escalate)
    → outcome tracker (signed payment.captured webhook) → metrics + model card + audit dashboard
                         └── LLM narrator (explain / draft / summarize) — on demand, off the money path
```

Full write-up (panel-prep): [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ·
Decisions & trade-offs: [`docs/DECISIONS.md`](docs/DECISIONS.md) ·
Webhook proof: [`docs/WEBHOOKS.md`](docs/WEBHOOKS.md) ·
ML v2 design & roadmap: [`docs/ROADMAP.md`](docs/ROADMAP.md)

## What the dashboard shows

A single role-scoped React console, built to read as a real product:

- **Overview** — recovered ₹, recovery rate, at-risk exposure, and the incremental-₹ lift; a **measured-impact chart**
  (cumulative recovered ₹ vs a dotted "without Sentinel" baseline computed from the control arm — *measured*, not
  estimated like Stripe/Checkout.com); a **recovery funnel** (Detected → Decided → Attempted → tri-state tail); and
  **failure reasons** in Razorpay's own Customer/Bank/Business/Other taxonomy, each tagged with the recovery path policy
  allows (auto-retry / fresh link / RBI-TAT no-action).
- **Live incident strip** — the IsolationForest's failure-spike detector, surfaced: while a reason is spiking, retries
  for it are deferred (don't retry into an outage), in the idiom of Razorpay's own downtime feed.
- **ML Model** — the **causal uplift engine** (Qini, ECE, per-action uplift, a strategy comparison vs oracle, and the
  **doubly-robust off-policy** estimate); a **model-health** panel (PSI drift, score distribution, latency); the recovery
  model card (AUC benchmark, calibration curve, feature importances); and an **online-exploration** panel (contextual
  Thompson sampling reaching ~93% of oracle, learned online).
- **Case detail** — the decision story with **per-case SHAP reason codes** (which factors pushed the recovery probability
  up or down) and the case's tamper-evident audit chain.
- **Recovery Lab** — incremental ₹ vs the control holdout, with bootstrap CIs sliced per reason.
- **Evidence** — the real Razorpay test-mode round-trip, HMAC-verified and replayable.
- **Everywhere** — a ⌘K command palette (jump to any page, fire demo actions), drill-down from any KPI/reason into the
  pre-filtered queue, and CSV export.

## Tech

TypeScript money path — Node + Express + Prisma + **embedded PostgreSQL** (real PG 18, no Docker) · React + Vite +
Tailwind dashboard · **Python ML tier — FastAPI + CatBoost + XGBoost + scikit-learn** · provider-agnostic LLM
(Anthropic *or* any OpenAI-compatible provider) for narration only · Razorpay test-mode APIs.

## Repo layout

```
server/   Node + Express API, Prisma schema, the recovery pipeline, retry worker, seed data, webhook self-test
web/      React dashboard (at-risk queue, case detail, ML model card, metrics, audit trail)
ml/       Python ML tier — feature schema, synthetic world model, training, uplift engine (uplift.py), FastAPI serving, metrics
docs/     ARCHITECTURE.md · DECISIONS.md · SETUP.md · WEBHOOKS.md
```

## Quickstart

> Full setup (test keys, ML tier, webhook tunnel, seeding) lives in [`docs/SETUP.md`](docs/SETUP.md). No Docker, no
> cloud account needed for the database.

```bash
# 0. Install
cd server && npm install && cd ../web && npm install && cd ..
cd ml && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt && cd ..

# 1. Train the models (writes ml/artifacts + ml/metrics.json)
ml/.venv/Scripts/python ml/src/worldmodel.py
ml/.venv/Scripts/python ml/src/train.py
ml/.venv/Scripts/python ml/src/uplift.py    # causal uplift engine → ml/uplift.json (Qini, ECE, policy value, DR-OPE)
ml/.venv/Scripts/python ml/src/explore.py   # online Thompson-sampling exploration → ml/explore.json

# 2. Run everything (separate terminals)
cd server && npm run db:local                                            # DB  :5432
ml/.venv/Scripts/python -m uvicorn serve:app --app-dir ml/src --port 8899 # ML   :8899
cd server && cp .env.example .env && npm run prisma:migrate && npm run dev # API  :8787
cd web && npm run dev                                                     # web  :5173
```

Open http://localhost:5173 → **Seed cases → Run pipeline → Advance retries**, and watch the ML model card + recovered-₹.

### Reproduce the results

```bash
./reproduce.sh   # installs, typechecks, and runs the full server + web suites (Git Bash on Windows)
```

One command reproduces every verifiable claim: the real money path (signed webhooks, exactly-once
recovery over an embedded Postgres it provisions itself), the append-only + tamper-evident audit
ledger, the policy invariants, the red-team compliance oracles, the outbound-message fact-check, and
the two honesty guards — `claims.docs` (every headline number matches its source ML artifact) and
`ml.bands` (every artifact sits inside its quality confidence band). The same steps run in CI
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) on every push.

## Status

🚧 Built for the buildathon. See the commit history for the build order, and [`docs/DECISIONS.md`](docs/DECISIONS.md)
for the dated rationale behind every major choice.
