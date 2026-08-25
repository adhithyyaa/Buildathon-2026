# Recoup — Bounded, ML-First Revenue Recovery for Razorpay

> Recover the revenue you already earned. Recoup detects failed payments and abandoned checkouts, uses **calibrated
> machine-learning models** to decide the safest recovery move and how likely it is to work, executes it with **real
> Razorpay payment links** under hard policy limits, and proves — with a **signed webhook round-trip** — exactly how
> much money it brought back.

**Razorpay AI Buildathon 2026 · Track: AI Revenue Recovery**

---

## The one-line thesis

Payment failure in India is usually *mechanical and recoverable* (UPI timeout, bank downtime, a momentary decline),
not a change of heart. The right recovery is **decisioning under constraints** — the right action, on the right channel,
at the right time — which is a tabular ranking/classification problem, not a language problem. So in Recoup the
**machine-learning models decide**, a deterministic **policy engine disposes** (it can override or block any decision),
a deterministic **executor** moves the money, and an **LLM is used only to explain** — never to decide.

## Who it's for

**Mid-market Indian D2C / subscription merchants at ~₹50L–₹5Cr/month on Razorpay** — big enough that 1–2 recovery
points is ₹1–10L/month, too small to build a recovery/data-science team. Razorpay already ships real, capable recovery
products these merchants can turn on: **Agent Studio's Subscription Recovery and Abandoned Cart Conversion agents**
(early access since Mar 2026, built on Anthropic's Claude Agent SDK), the **Intelligent Retry Engine** (WhatsApp nudges
for failed autopay debits), the **RazorpayX Receivables Agent** (invoice follow-up, Jun 2026 beta), **Optimizer**
(enterprise ML routing) and **Vulcan** (the payments foundation model, Aug 2026). Recoup doesn't compete with any of
them — it's the **measurement-and-governance layer that plugs *under* them**: holdout-measured incremental recovery,
calibrated per-case probabilities, deterministic error-reason triage before any model, India policy-as-code, and an
append-only audit trail — the things none of those products publish. *(Doesn't Razorpay already do this?* — see
[ADR-014](docs/DECISIONS.md) and [Architecture §12](docs/ARCHITECTURE.md).)*

## What makes it credible (not just a demo)

- **ML that actually decides.** Every case is scored by CatBoost (benchmarked vs XGBoost + a LogReg baseline) over a
  shared 21-feature schema, producing six outputs: **calibrated** recovery probability, chosen action + per-action odds, escalation
  risk, anomaly score, action confidence, and reason. The dashboard shows a model card with the reliability curve.
- **Honest numbers.** Recovery ROC-AUC ≈ **0.76** (95% CI reported; CatBoost's edge over the baseline is real but small,
  so it's justified on *calibration + native categoricals*, not a headline gap). Action head ≈ **70%** accuracy on
  *deliberately noisy* labels (≈**84%** agreement with the EV-optimal action) — a real learning problem, stated as such.
  Failure-spike detection ≈ **87.5%**. Metrics are on synthetic data, and we say so.
- **Real Razorpay test-mode** Orders + Payment Links + Webhooks. Pay a recovery link with a test card → a **signed**
  webhook flips the case to `recovered` and the recovered-₹ counter moves. Ships with an all-green **signed self-test**
  (`npm run selftest:webhook`) — see [`docs/WEBHOOKS.md`](docs/WEBHOOKS.md).
- **Controlled AI.** No model touches money. The LLM only explains a decision, drafts the message, and summarizes
  escalations — off the money path, with template fallback.
- **Full audit trail.** Every state transition is logged (`before → after`, actor, details).

## Architecture at a glance

```
Razorpay webhook / CSV / demo panel
    → normalize → deterministic risk-score → 21-feature build
    → ML SERVICE (CatBoost · XGBoost · IsolationForest · calibration)  → decision + calibrated probabilities
    → POLICY ENGINE (deterministic, can override) → executor (real payment link / smart retry / message / escalate)
    → outcome tracker (signed payment.captured webhook) → metrics + model card + audit dashboard
                         └── LLM narrator (explain / draft / summarize) — on demand, off the money path
```

Full write-up (panel-prep): [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ·
Decisions & trade-offs: [`docs/DECISIONS.md`](docs/DECISIONS.md) ·
Webhook proof: [`docs/WEBHOOKS.md`](docs/WEBHOOKS.md)

## Tech

TypeScript money path — Node + Express + Prisma + **embedded PostgreSQL** (real PG 18, no Docker) · React + Vite +
Tailwind dashboard · **Python ML tier — FastAPI + CatBoost + XGBoost + scikit-learn** · provider-agnostic LLM
(Anthropic *or* any OpenAI-compatible provider) for narration only · Razorpay test-mode APIs.

## Repo layout

```
server/   Node + Express API, Prisma schema, the recovery pipeline, retry worker, seed data, webhook self-test
web/      React dashboard (at-risk queue, case detail, ML model card, metrics, audit trail)
ml/       Python ML tier — feature schema, synthetic world model, training, FastAPI serving, metrics.json
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

# 2. Run everything (separate terminals)
cd server && npm run db:local                                            # DB  :5432
ml/.venv/Scripts/python -m uvicorn serve:app --app-dir ml/src --port 8899 # ML   :8899
cd server && cp .env.example .env && npm run prisma:migrate && npm run dev # API  :8787
cd web && npm run dev                                                     # web  :5173
```

Open http://localhost:5173 → **Seed cases → Run pipeline → Advance retries**, and watch the ML model card + recovered-₹.

## Status

🚧 Built for the buildathon. See the commit history for the build order, and [`docs/DECISIONS.md`](docs/DECISIONS.md)
for the dated rationale behind every major choice.
