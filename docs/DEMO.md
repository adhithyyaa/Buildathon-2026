# Sentinel — Panel Demo Runbook

A click-by-click script for a live panel demo (~9–11 min), verified end-to-end against the running
dashboard. Everything here was dry-run tested; every beat lands.

> **Open with:** *"In India a failed payment is usually mechanical and recoverable — a UPI timeout, a
> bank downtime, a momentary decline — not a change of heart. Sentinel is the ML-first recovery layer
> that decides the safest move, bounds it with deterministic policy, and — uniquely — proves the
> incremental rupees against a live control arm."*

---

## 0. Pre-flight

Bring up the four processes, then prep a clean, rich demo state.

```bash
cd server && npm run db:local                                                # DB   :5432
ml/.venv/Scripts/python -m uvicorn serve:app --app-dir ml/src --port 8899    # ML   :8899
cd server && RAZORPAY_WEBHOOK_SECRET=whsec_sentinel_local_selftest npm run dev  # API  :8787
cd web && npm run dev                                                         # web  :5173
```

Prep the data — either from the dashboard **Demo** menu or the command palette (⌘K), in order:
**Reset all data → Seed 120 cases → Run pipeline → Advance retries → Resolve outcomes.** Then re-link
the real-capture evidence (safe any time; sign with the SAME secret the API is running):

```bash
cd server && RAZORPAY_WEBHOOK_SECRET=whsec_sentinel_local_selftest npm run replay:roundtrip   # → "✅ REPLAYED …"
```

Sign in at **http://localhost:5173** (any email + 6-char password, or Google if configured) → lands on
`/app`. Confirm the Overview shows a non-zero *Recovered ₹*, a *+lift* chip, and model-health resting
at **watch**. You're ready. *(Do NOT trigger a failure spike yet — that's the finale.)*

---

## 1. The one sentence

**"ML decides, deterministic policy disposes, and a real control arm proves the incremental rupees."**
Everything in the demo is one of those three.

---

## 2. Click-by-click

### Overview (`/app`) — 75s
- **KPI strip**: Recovered ₹, Recovery rate, At-risk exposure, and **Incremental ₹ Lift** with its
  `+NNpp` chip. *"That last one is the number nobody publishes — recovered versus a live no-action
  control, not gross."*
- **Measured-impact chart** (the flagship): cumulative recovered ₹ (solid) vs a dotted "without
  Sentinel" baseline. **"Stripe and Checkout.com estimate that dotted line. Ours is measured from a
  randomised 20% control holdout."**
- **Recovery funnel**: Detected → Decided → Attempted → Recovered, with the control-held drop-off
  labelled ("that's the experiment"). **Failure reasons** in Razorpay's own Customer/Bank/Business/
  Other taxonomy, each tagged auto-retry / fresh link / RBI-TAT no-action.
- **Drill-down**: click any failure reason → the queue opens pre-filtered to it (URL is shareable);
  hit **CSV** to export. *"Every number is a link into the cases behind it."*

### Case detail — 75s (the depth moment)
- From the queue, open any analysed case. Walk it: **Journey** tracker → **ML prediction** (calibrated
  recovery prob + per-action odds) → **Recovery decision** → **Policy check** (why it was allowed /
  held).
- **Why this decision — model reason codes**: per-case **SHAP** factors, signed ↑/↓. *"Not global
  importance — this case's actual drivers, from the same CatBoost that scored it."*
- **Audit trail** with a **chain verified ✓** badge. *"Every row is SHA-256 hash-chained to the last —
  edit, reorder, or delete one and the chain breaks. And it's append-only at the database level, so it
  can't be quietly rewritten — we'll prove both on the Evidence page."*
- **AI assist → Explain the decision**: a plain-English rationale. *"The LLM explains; it never
  decides or moves money."*

### ML Model (`/app/model`) — 100s (the ML case)
- **Causal uplift engine** — *"The field predicts whether a payment recovers. We model the causal
  uplift of each action — the incremental quantity our thesis claims. No competitor does this."*
  **Qini 0.93, ECE 0.008** (beats the field), and a strategy comparison where the **uplift policy
  captures ~99% of the oracle**.
- **Doubly-robust off-policy eval** — *"Estimated from the logged data alone, the way you must in
  production: DR ≈ ₹3.3k/case vs the logging policy's ₹2.4k, validated within ~6% of ground truth."*
- **External validity & per-case certainty** — *"The same machinery on a real public RCT (Hillstrom,
  64,000 randomised): our DR estimate recovers the ground-truth ATE of +6.1pp to within 1.9%,
  x-learner best. And conformal prediction gives each case a coverage-guaranteed set — target 90%,
  empirical 90.7% — so uncertain cases are routed to a human, not guessed."*
- **Model health** — per-feature **PSI drift** (0.1/0.25 thresholds), score distribution, real
  inference **latency (p95 ≈ 85ms)**. *"Production monitoring — remember this panel for the finale."*
- (Scroll) **Model card** (CatBoost vs XGB vs LogReg AUC, calibration curve) and the **online
  exploration** panel (contextual Thompson sampling reaching ~93% of oracle, learned online).

### Recovery Lab (`/app/lab`) — 45s (the standout)
- **Incremental recovered (vs control)** with its **95% CI** and *significant* flag; **treatment vs
  control** rates; **per-reason lift**. *"Any reason that can't beat control is auto-suppressed — the
  system stops spending where it can't beat doing nothing."* Note: the estimator itself is **A/A-
  tested** (reads ~0 on identical arms), so the number isn't an artifact.

### Evidence (`/app/evidence`) — 60s (the money shot)
- The **real Razorpay test-mode capture** with its **Payment/Order IDs** (`pay_TTyBx4OQoIQFkj`).
  Click **Recovered case ·** → the exact case it closed. **Verify on Razorpay ↗** → *"Real in
  Razorpay's own dashboard — not a flag we flipped."* Point at the **keys-free replay** command.
- **Tamper-evidence forensics**: *"We attack a real 15-row ledger chain — on clones, the live ledger is
  never touched — and the verifier catches AND classifies every tamper: a silent field edit as
  content-altered, a deletion or re-hash as chain-relinked."* Then the **Append-only — enforced by
  Postgres** badge: *"We just tried an UPDATE and a DELETE on a real ledger row inside a rolled-back
  transaction — the database trigger rejected both. Not even our app can rewrite a row."*

### Governance — Rigor & red-team (`/app/rigor`, `/app/compliance`) — 60s (the trust case)
- **Rigor scorecard** (`/app/rigor`): *"Most demos ask you to trust the headline. Here's every
  independent check in one place — 15/15 green — from the A/A null test to the real-RCT to the
  append-only ledger, each linking to where it's proven."*
- **Red-team compliance** (`/app/compliance`): *"Attack our India-payments guardrails — re-debiting a
  stuck payment, a 4th silent retry, a ₹20k auto-debit with no AFA, messaging an opted-out customer.
  8/8 defended — and judged by INDEPENDENT regulatory oracles, separate code from the policy, so a
  silent regression is caught even when the policy would pass itself."* Hit **Run attack** on one live.
- **Outbound message fact-check** (same page): *"The LLM drafts customer copy, but a validator checks
  every amount, discount, and reference against ground truth before send — watch it catch a
  hallucinated ₹8,400 and a 30%-off it was never approved to offer, and block them."*

### 🎬 The finale — live incident loop — 45s
- Open **⌘K → Trigger failure spike** (or Demo menu). Within a second:
  - a **"Failure spike active · UPI collect timeout"** strip appears across the top — *"retries for
    that reason are now deferred; we don't retry into an outage"*;
  - flip to **Model → Model health**: **failure_reason PSI jumps watch → shift** live.
- *"That's the IsolationForest, the policy engine, and the executor closing the loop on stage — detect
  the outage, defer the retries, and the drift monitor catches it in real time."*

---

## 3. Anticipated questions → crisp answers

| They ask | You answer |
|---|---|
| *"What is the AI actually doing?"* | ML **decides** the action + calibrated probabilities and the **causal uplift** per action; a deterministic **policy engine** can override/block; an allow-listed **executor** acts; the **LLM only explains**. No model touches money. |
| *"How do you know your lift number is real?"* | Three ways: a **randomised 20% control** holdout; the lift **estimator is A/A-tested** (unbiased on identical arms); and a **doubly-robust off-policy** estimate validated within ~6% of ground truth. Not a gross "we recovered ₹X". |
| *"Your ML is just propensity / retries."* | No — we model **uplift (CATE)**, benchmarked S- vs T-learner, selected by **Qini 0.93**, calibrated to **ECE 0.008**. The uplift-optimal policy captures ~99% of the oracle's incremental ₹. |
| *"Does the model still work on live traffic?"* | The **model-health panel**: per-feature **PSI** vs training (0.1/0.25), score-distribution, latency. Trigger a spike and the reason PSI moves watch → shift live. |
| *"How do we trust the recovery / audit?"* | Recovery only ever happens on a **signed `payment.captured` webhook** (HMAC, idempotent, exactly-once under concurrency — a test suite proves it) + a committed **real-capture replay**. The audit trail is **SHA-256 hash-chained** (tamper-evident, and the verifier classifies *how* a chain broke) **and append-only at the database level** — a Postgres trigger rejects any UPDATE/DELETE, proven live on the Evidence page. |
| *"How do you enforce compliance / can we break it?"* | Try it: the **red-team console** (`/app/compliance`) lets you attack the RBI-TAT, NPCI retry-cap, AFA, consent/DND, and quiet-hours guardrails — all defended, and judged by **independent regulatory oracles** (separate code from the policy). The policy's core invariants are also **property-tested** with fuzzed inputs. |
| *"Can the LLM send a customer a wrong number?"* | No — a deterministic **fact-checker** validates every amount, discount, and reference in an outbound message against ground truth before dispatch; a hallucinated figure or unapproved discount **blocks the send and escalates to a human** (and is logged to the ledger). |
| *"Numbers are on synthetic data."* | The *headline* eval is, and labelled so — but the **same uplift + doubly-robust machinery is re-run on a real public RCT** (Hillstrom, 64,000 randomised) and recovers the ground-truth ATE (+6.1pp) to within **1.9%**. It also scores against the synthetic world's **independent ground truth**, and a **frozen model transfers** to an independently designed world at ~0.68 AUC. External validity, not just the world we built. |
| *"Doesn't Razorpay already do recovery?"* | Yes — we **plug under** those agents as the **measurement + governance** they don't publish: holdout-measured incremental ₹, causal uplift, PSI monitoring, tamper-evident audit, India policy-as-code. |

---

## 4. Known limitations (say these first — it reads as maturity)

- **Training data is a synthetic world model**, labelled "synthetic" throughout — the data flywheel is
  built to replace it with real outcomes.
- **Single-tenant operator console** — reads are token-guarded, but per-merchant identity is the
  documented next step.
- **In-process retry scheduler** (single-flight DB lease); a durable queue (or Temporal) is the
  production upgrade. Contextual Thompson-sampling exploration is a simulation of online learning,
  not yet wired into the live decision path.
- **CatBoost's AUC edge over the baseline is small** — it earns its place on calibration + native
  categoricals + the uplift/governance layer, which we state rather than overclaim.

---

## 5. If something breaks mid-demo

- **A panel/number looks empty** → you likely opened a **control-arm case** (deliberately held out, no
  ML decision). Say so — it's the holdout that makes the Lab honest — and open another case.
- **A view won't load / API down** → the dashboard degrades gracefully; the pipeline falls back to
  deterministic scoring if ML is unreachable (flagged `source: fallback`). Re-run the API terminal.
- **A guarded action returns 401** → a `SENTINEL_ADMIN_TOKEN` is set; paste it via the shield icon.

---

*Companion docs: [`DEFENSE.md`](./DEFENSE.md) (panel Q&A) · [`ARCHITECTURE.md`](./ARCHITECTURE.md) ·
[`ROADMAP.md`](./ROADMAP.md) · [`WEBHOOKS.md`](./WEBHOOKS.md) · [`DECISIONS.md`](./DECISIONS.md).*
