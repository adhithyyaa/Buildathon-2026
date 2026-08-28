# Recoup — Panel Demo Runbook

A tight, click-by-click script for a live panel demo (≈ 5–7 min), plus crisp answers to the
questions a Razorpay hiring panel will actually ask. Everything below is verified against the
running dashboard.

> **One-line pitch to open with:** *"Recoup is the measurement-and-governance layer that sits under
> Razorpay's recovery — ML decides the safest recovery move, deterministic code disposes, and a
> signed webhook proves the incremental rupees we brought back."*

---

## 0. Pre-flight (do this before you present)

Bring the four processes up (separate terminals), then seed a fresh, realistic dataset.

```bash
cd server && npm run db:local                                             # DB   :5432
ml/.venv/Scripts/python -m uvicorn serve:app --app-dir ml/src --port 8899  # ML   :8899
cd server && RAZORPAY_WEBHOOK_SECRET=whsec_local_selftest npm run dev       # API  :8787
cd web && npm run dev                                                      # web  :5173
```

Then, in the dashboard's **Demo** menu (top bar), run this sequence to produce a full spread of
states + a populated Recovery Lab:

1. **Reset all data** → **Seed 120 cases** (creates ~120 `at_risk` cases)
2. **Run pipeline** (scores, decides, acts — produces treatment + control + escalated cases)
3. **Advance retries** → **Resolve outcomes** (drives outcomes, populates the Lab lift + CIs)

Finally, re-link the real-capture evidence (safe to run any time):

```bash
cd server && RAZORPAY_WEBHOOK_SECRET=whsec_local_selftest npm run replay:roundtrip   # → "✅ REPLAYED …"
```

Open **http://localhost:5173** and confirm the Overview shows a non-zero *Recovered ₹* and a
*+lift* on the Incremental card. You're ready.

> **If you have a token set** (`RECOUP_ADMIN_TOKEN`): open the shield icon in the top bar and paste
> it, or the guarded actions (Demo, approve/reject) and the case reads will return 401. In local dev
> (no token) everything is open.

---

## 1. The narrative arc (say this, in order)

1. **The problem is worth an engine.** In India a failed payment is usually *mechanical and
   recoverable* — a UPI timeout, a bank downtime, a momentary decline — not a change of heart. Each
   has a *different* right recovery move and timing. That's decisioning under constraints.
2. **ML decides, deterministic code disposes.** Models propose; a deterministic policy engine can
   override or block; an allow-listed executor acts; the LLM only narrates. No model touches money.
3. **We prove the incremental rupees.** A 20% control holdout + a signed-webhook round-trip turn
   "trust us" into a CI-bounded number and a real capture.

---

## 2. Click-by-click demo

### Overview  (`/`) — 45s
- Point at the **KPI strip**: *Recovered ₹*, *Recovery rate*, *At-risk exposure*, and the
  **Incremental ₹ Lift** card with its `+NNpp` chip. *"That last one is the number nobody publishes —
  recovered versus a live no-action control, not gross."*
- Sweep the **Platform Modules** grid: *"Eight capabilities — every card is clickable and lands on
  the view that proves it."* Click **ML Decisioning** → lands on the model card.

### ML Model  (`/model`) — 40s
- **ROC-AUC bars**: CatBoost 0.75 vs XGBoost vs Logistic Reg. *"CatBoost's edge over the baseline is
  real but small, so we justify it on calibration + native categoricals — stated honestly."*
- **Calibration curve**: *"On the dashed line = perfectly calibrated probabilities — safe to
  threshold and to put in EV math."* Point at the **feature importances**.

### Pipeline  (`/pipeline`) — 30s
- The **live flow** (At risk → Deciding → Acting → Recovered) with counts.
- The **"How a case is handled"** strip: six stages, colour-coded by actor (deterministic → AI →
  policy → executor). *"This is the bounded-agent design — every AI suggestion is policy-checked
  before any money moves."*

### Recovery Queue → Case detail — 60s  (the depth moment)
- On **Recovery Queue**, use **Filter → Escalated**, open a case. Walk the **case detail** top to
  bottom: **Journey** tracker, **ML prediction** (calibrated recovery prob, per-action odds),
  **Recovery decision**, **Policy check** (why it was held), **Action taken**, **Audit trail**.
- Click **AI assist → Explain the decision**: a plain-English rationale appears. *"The LLM explains;
  it never decides."*
- Click **Approve & dispatch** → the case moves to *waiting for outcome* and an action is dispatched.
  *(Or **Reject** → the case expires.)* Every transition lands in the audit trail.

### Recovery Lab  (`/lab`) — 45s  (the standout)
- The **Incremental recovered (vs control)** hero number with its **95% CI** and *significant* flag.
- **Treatment vs Control** recovery rates side by side; **per-reason lift** bars.
- *"Any reason where treatment doesn't beat control is auto-suppressed — the policy stops spending
  where it can't beat doing nothing. That's what makes this layer make Razorpay more efficient."*

### Evidence  (`/evidence`) — 40s  (the money shot)
- The two **real Razorpay test-mode captures** (₹1.00, Captured, card), with **Payment/Order IDs**.
- Click **Recovered case ·** on the linked capture → the exact case it closed.
- Click **Verify on Razorpay ↗** → *"Those ids are real in Razorpay's own dashboard — this isn't a
  flag we flipped."* Point at the **keys-free replay** command.
- **Live kicker** (optional): run `npm run replay:roundtrip` in a terminal → *"✅ REPLAYED"* — a real
  captured payment recovers a fresh case through the production signed-webhook path, on stage.

---

## 3. Anticipated questions → crisp answers

| They ask | You answer |
|---|---|
| *"What is the AI actually doing?"* | ML **decides** the action + calibrated probabilities; a deterministic **policy engine** can override/block; an allow-listed **executor** acts; the **LLM only explains/drafts/summarizes**. No model touches money. |
| *"Your numbers are on synthetic data."* | Correct, and we say so. Two answers: (1) the eval scores against the **world's independent ground truth**, never the model's own prediction; (2) **cross-world transfer** — a frozen model still ranks an *independently designed* world at **~0.68 AUC** in both directions. We ship the part that *doesn't* transfer too. |
| *"How do we know the recovery is real?"* | A **signed `payment.captured` webhook** (HMAC over the raw body) is the only way a case becomes `recovered` — verified before any DB write, idempotent, **exactly-once** under concurrency (a dedicated test suite proves it), and a **committed replay** of a real capture. |
| *"Doesn't Razorpay already do recovery?"* | Yes, well — and we **plug under** those agents. Recoup adds the **measurement + governance** they don't publish: holdout-measured incremental ₹, calibrated per-case certainty, deterministic error-reason triage, India policy-as-code, and an append-only audit trail. |
| *"Is it secure / multi-tenant?"* | The data model is multi-tenant (merchant-scoped); operator/destructive endpoints **and the case reads** are behind an operator token (open only in local dev). Per-merchant identity/scoping is the documented production upgrade. |
| *"How does it improve over time?"* | The always-on control holdout is a **live A/B / drift signal**; reasons with no proven lift are auto-suppressed; real recovery outcomes replace the synthetic bootstrap (the data flywheel). |

---

## 4. Known limitations (say these before they find them — it reads as maturity)

- **Training data is a synthetic world model**, not real merchant data — a documented bootstrap the
  data flywheel is built to replace. Metrics are labelled "synthetic" throughout.
- **Single-tenant operator console.** Reads are token-guarded, but there's no per-merchant identity
  yet; true tenant scoping (a signed merchant claim forcing `where:{merchantId}` server-side) is the
  next step.
- **In-process retry scheduler** (single-flight lease). A durable queue is the production upgrade.
- **CatBoost's AUC edge over the baseline is small** — the model earns its place on calibration,
  native categoricals, and governance, which we state rather than overclaim.

---

## 5. If something breaks mid-demo

- **A panel/number looks empty** → you likely landed on a **control-arm case** (deliberately held
  out, no ML decision). Say so — it's the holdout that makes the Lab honest — and open another case.
- **A view won't load / API down** → the dashboard degrades gracefully; re-run the API terminal. The
  pipeline also falls back to deterministic scoring if the ML service is unreachable (flagged
  `source: fallback`).
- **Guarded action returns 401** → a token is set on the server; paste it via the shield icon.

---

*Companion docs: [`ARCHITECTURE.md`](./ARCHITECTURE.md) · [`WEBHOOKS.md`](./WEBHOOKS.md) ·
[`DECISIONS.md`](./DECISIONS.md) · the full [`Recoup-Technical-Documentation.docx`](../Recoup-Technical-Documentation.docx).*
