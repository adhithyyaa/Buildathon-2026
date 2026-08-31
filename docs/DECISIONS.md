# Architecture Decision Records

Short, dated records of *why* the build is the way it is. These are the answers to defend in the panel.

Format: **Decision → Context → Rationale → Trade-off / what we'd change at scale.**

---

### ADR-001 — Track: AI Revenue Recovery, scoped to failed payments + abandoned checkout
- **Context:** Five tracks; recovery is measurable and demoable, and maps to a real Razorpay product surface.
- **Rationale:** One narrow loop solved deeply beats four shallow ones. Failed-payment + checkout-abandonment give
  visible ₹ impact and a clean before/after story with test-mode data.
- **Trade-off:** We *don't* build subscriptions/receivables in v1. They're a documented v2 extension behind the same
  pipeline, so adding a lane is a new event type + reason tags, not a rewrite.

### ADR-002 — TypeScript end-to-end (Node/Express API + React/Vite web)
- **Context:** Solo build, ~12 days, must be explainable in a panel.
- **Rationale:** One language removes context-switching; Razorpay's Node SDK is first-class; webhooks are trivial in
  Express. Clear API/DB/UI separation reads well to reviewers.
- **Trade-off:** Not using a batteries-included framework (Next.js) — we keep the API and UI as separate, legible
  deployables. Slightly more wiring, much clearer architecture story.

### ADR-003 — Money is integer paise, never floats
- **Context:** All amounts (at-risk, recovered, discounts).
- **Rationale:** Floating point silently corrupts currency math. Razorpay itself uses paise. `₹1,499.00 → 149900`.
- **Trade-off:** Must format for display; worth it for correctness.

### ADR-004 — The model proposes, deterministic code disposes
- **Context:** The core trust question for an autonomous money system. *(Umbrella invariant; the proposer is now the ML
  tier — see ADR-010 — not the LLM.)*
- **Rationale:** The decision models produce a *proposed action* and *calibrated probabilities*; a deterministic policy
  engine can override or block any proposal; a deterministic executor performs only allow-listed actions. No model —
  tabular or language — moves money or has the final say. This is the difference between "a product" and "a model that
  spends money."
- **Trade-off:** Less "magic," more guardrails — which is the correct trade-off for payments.

### ADR-005 — Structured, validated model output with deterministic fallback
- **Context:** Any inference service can be unreachable or return out-of-range output.
- **Rationale:** The ML service returns a typed contract; if it is unreachable, `decideCase` falls back to a rule-based
  plan flagged `source: 'fallback'`, so the pipeline never stalls. *(The earlier form of this ADR validated LLM JSON
  against a Zod schema and tracked a JSON-validity rate; that still guards the narration calls, but it is no longer on
  the money path — superseded for decisioning by ADR-010/011.)*
- **Trade-off:** Extra validation + a fallback branch; buys reliability and an honest source-attribution number.

### ADR-006 — PostgreSQL + Prisma
- **Context:** Need relational integrity across events→cases→decisions→actions→outcomes and an append-only audit log.
- **Rationale:** Postgres native enums + `Json` columns model the domain cleanly; Prisma's schema doubles as
  documentation and gives type-safe queries. Runs locally via an **embedded PostgreSQL** (real PG 18, no Docker
  required), or against any hosted URL (Neon/Supabase) by changing one env var.
- **Trade-off:** A DB dependency vs SQLite; chosen for production-credibility and clean modeling.

### ADR-007 — Real Razorpay test-mode integration (not a simulator)
- **Context:** The judges are Razorpay engineers.
- **Rationale:** Using real Orders + Payment Links + Webhooks in test mode is the credibility multiplier — the
  pay-link→webhook→`recovered` round-trip is expensive to fake and signals "I can build on your platform."
- **Trade-off:** Requires test keys + a public webhook tunnel for local dev (documented). Worth it.

### ADR-008 — In-process scheduler for retries (v1)
- **Context:** `smart_retry` needs to fire actions at a future time.
- **Rationale:** A single in-process interval worker that scans for due cases is enough to demo correct behavior and
  keeps infra to zero.
- **Trade-off:** Not durable across restarts / not horizontally scalable. **Production upgrade:** a durable queue
  (BullMQ/Redis) or a scheduled cloud function. Called out explicitly so the limitation is owned, not hidden.

### ADR-009 — CommonJS build for the server
- **Context:** Mixed CJS/ESM dependencies (Razorpay SDK is CJS).
- **Rationale:** CommonJS avoids ESM interop and import-extension friction under time pressure; `tsx` for dev, `tsc`
  for build. Zero runtime-import surprises.
- **Trade-off:** Slightly less "modern" than ESM; irrelevant to correctness and removes a class of bugs.

### ADR-010 — ML-first decisioning; the LLM is demoted to narration *(2026-08-24)*
- **Context:** The decision — which recovery action, at what timing — is a tabular ranking/classification problem over
  structured signals (reason × amount × history × timing × channel). Early builds used an LLM for this.
- **Rationale:** A calibrated tabular model is the right tool: it is cheap, fast, deterministic to serve, quantifies its
  own uncertainty, and improves as real outcomes arrive — none of which an LLM prompt gives you on the money path. So
  **CatBoost owns the decision** (benchmarked against XGBoost + a LogisticRegression baseline), and the LLM is used only
  to *explain / draft / summarize*, off the money path. "AI" here means ML that decides, not a chatbot that decides.
- **Trade-off:** A separate model tier to train, calibrate, and version — but the decision becomes measurable,
  reproducible, and defensible with numbers instead of a prompt.

### ADR-011 — Calibrate the number that matters, and name confidence honestly *(2026-08-24)*
- **Context:** A "confidence" that isn't a real probability is a trap — someone will threshold it or put it in EV math.
- **Rationale:** `recovery_probability` is **isotonic-calibrated** (reliability curve shown on the model card), so it is
  safe to threshold and to feed expected-value decisions. The action head's softmax is **not** calibrated, so it is
  named `action_confidence` — not "calibrated confidence" — everywhere: the ML response, the Prisma column (migrated
  via a `RENAME`), and the UI. A reviewer reading the code never finds an uncalibrated value in a "calibrated" field.
- **Trade-off:** More words and a migration; buys the difference between honest and misleading metrics under a panel
  that reads code.

### ADR-012 — Synthetic "world model" training data, with the limitation owned *(2026-08-24)*
- **Context:** There is no real recovery-outcome dataset at build time.
- **Rationale:** `ml/src/worldmodel.py` generates 30k cases from a reason×action fit matrix with EV-based labels,
  **deliberately noisy** per-action outcomes, and injected incident windows — so the action/escalation heads face a
  genuine learning problem (≈70% action accuracy, ≈84% EV-agreement) rather than a tautology (which clean formulaic
  labels would produce, and did in an earlier version at 99.5%). It is documented as a bootstrap, not real data.
- **Trade-off:** Metrics are on synthetic data — stated plainly. The pipeline is built so real merchant outcomes drop
  straight into the same feature schema and retrain the same models; that is the data moat, once live.

### ADR-013 — A separate Python/FastAPI ML service *(2026-08-24)*
- **Context:** The decision models want the Python ML ecosystem; the money path wants typed TypeScript.
- **Rationale:** Train + serve CatBoost/XGBoost/scikit-learn in Python (FastAPI on `:8899`), keep ingestion, policy,
  executor, webhooks, and audit in TypeScript. A shared feature schema (`ml/src/features.py`) is the single source of
  truth for train and serve, so there is no train/serve skew. The TS side degrades to a deterministic fallback if the
  service is down.
- **Trade-off:** Two runtimes to run locally; the boundary is clean and each side uses its best tools.

### ADR-014 — We are the measurement-and-governance layer *under* Razorpay's recovery agents, not a competitor to them *(2026-08-24)*
- **Context:** "Doesn't Razorpay already do this?" — the first skeptical question, and a fair one. By 2026 Razorpay ships
  first-party recovery products: **Agent Studio's Subscription Recovery and Abandoned Cart Conversion agents** (early
  access since Mar 2026, on Anthropic's Claude Agent SDK), the **Intelligent Retry Engine** (WhatsApp nudges for failed
  autopay debits), the **RazorpayX Receivables Agent** (invoice follow-up, Jun 2026 beta), **Optimizer** (enterprise ML
  routing) and **Vulcan** (the payments foundation model, Aug 2026). They are real and good.
- **Rationale:** So we do **not** clone or compete with them — Overwatch *uses* Razorpay's Payment Links, retries and
  webhooks as execution primitives and is designed to **plug under** those agents. The value we add is the layer none of
  them publish: **holdout-measured incremental recovery** (net of cost), **calibrated per-case probabilities**,
  **deterministic error-reason triage before any model**, **India policy-as-code** (retry caps, quiet hours, opt-out,
  ₹-threshold approvals) and an **append-only audit trail** — plus live failure-spike (anomaly) awareness and
  signed-webhook proof. Target user unchanged: **mid-market Indian D2C / subscription merchants at ~₹50L–₹5Cr/month** —
  big enough that 1–2 recovery points is ₹1–10L/month, too small to staff this in-house. Agent Studio and the Intelligent
  Retry Engine intervene; they don't publish measured, governed, auditable proof — which is exactly the gap Overwatch owns.
- **Trade-off:** We depend on Razorpay's primitives and don't own the rails — which is the point: a thin measurement-and-
  governance layer is adoptable in a day and complements the shipped agents, where a rails or agent replacement would
  compete head-on with the panel's own products.

### ADR-015 — Measure recovery counterfactually, and publish the tie *(2026-08-25)*
- **Context:** The track bar is "measured money recovered across a batch", and the weakest way to claim it is a gross
  number from a simulator you wrote. Two failure modes to avoid: temporal leakage, and the model grading itself.
- **Rationale:** `ml/src/eval.py` evaluates on the **time-ordered** holdout and scores four arms — do-nothing,
  rules-only triage, ML+policy (deployed), and an oracle — with the **world's independent ground-truth** mechanism, not
  the model's own prediction, reporting **incremental lift with 95% bootstrap CIs**. To prove the eval isn't flattering
  itself, it runs against **two independently-authored worlds**. On **World A** (reason-dominated) the deployed decision
  captures ~99% of the oracle headroom but only **ties** a rules baseline — we publish the tie rather than tune the world
  until ML "wins". On **World B** (`worldmodel2.py`, context-driven: the best action depends on a latent customer
  archetype, not the reason) the same pipeline **beats rules by +₹5.49M, CI [5.1M, 5.8M], significant**. Together they
  make the claim testable and honest: **the ML's edge over rules scales with how much the optimal action depends on
  context beyond the failure reason** — and real merchant data is context-driven.
- **Trade-off:** The headline is less flashy than a fabricated "ML beats rules by 20%", but it is defensible under a
  panel that reads code, and the second world makes the synthetic→real flywheel (ADR-012) a demonstrated mechanism, not
  a promise. Still synthetic — real merchant outcomes remain the real fix.

### ADR-016 — India compliance is code in the money path, and there's a human kill switch *(2026-08-25)*
- **Context:** Indian payment-recovery rules are safety-critical; "we thought about compliance" in a slide is not the
  same as enforcing it. And any autonomous money system needs a stop button.
- **Rationale:** The rules are enforced in the deterministic policy engine and unit-tested (`policy.test.ts`): a
  **failed-but-debited case is held** pending the RBI TAT auto-reversal (never re-nudged), hard declines are **never
  retried**, the **NPCI 1+3 retry cap** and **₹15k AFA ceiling** bound auto-debits, opt-out hard-blocks outreach, and a
  live **failure-spike defers retries**. Governance is real: the approval gate **dispatches** the withheld action
  (it doesn't fake-book recovery), `/reject` declines, and a global **kill switch** halts the executor and scheduler.
  Webhooks are idempotent on `x-razorpay-event-id`. Mapped rule-by-rule in [`COMPLIANCE.md`](COMPLIANCE.md).
- **Trade-off:** DPDP data-fiduciary controls (PII hashing, retention, erasure) are **not yet** implemented and are
  called out as the top gap — encoded where it matters most, honest about what's left.

### ADR-017 — Measure INCREMENTAL recovery live (the Recovery Lab), not gross *(2026-08-25)*
- **Context:** Gross "recovered ₹" is the weakest evidence class — some customers pay anyway. The dossier names
  holdout-measured incremental lift as the one differentiator nobody in India publishes; our counterfactual eval proved
  it offline, but the *running product* still showed the naive gross number.
- **Rationale:** Bring the holdout into the product. Each case is assigned `treatment` or a ~20% no-action `control` at
  ingest; the dashboard's **Recovery Lab** shows `treatment_rate − control_rate` (₹-weighted) with a 95% bootstrap CI,
  per reason. It is simultaneously the accountability layer (provable incremental value), a live A/B / drift signal on
  the model (closing a production-ML gap), and a self-optimizing efficiency loop (reasons that don't beat control are
  flagged for auto-suppression). This is the layer that makes Razorpay's recovery *measurably* more efficient rather
  than another dunning bot.
- **Trade-off:** A control arm forgoes recovery on ~20% of cases (the standard cost of a holdout) — worth it for a
  provable, CI-bounded lift number and continuous model validation. Demo outcomes are world-simulated; production uses
  real signed webhooks.

### ADR-018 — Hardening from a strict self-audit (train/serve skew + money-path correctness) *(2026-08-25)*
- **Context:** A 6-agent adversarial audit found real defects behind the polish — the kind that separate "looks
  production-grade" from "is".
- **Rationale:** Fixed them rather than hiding them. **Train/serve skew:** `prior_failed_attempts` was being fed the
  current retry count (now the customer's historical failed count), `urgency_score` and `past_recovery_rate` were
  computed differently at serve than in training (now mirror `worldmodel.py`), and the windowed anomaly detector queried
  1-hour counts against a 4-hour-trained baseline (now aligned). **Money-path correctness:** the webhook idempotency row
  now commits *after* processing (a crash no longer loses the event); the scheduler single-flights via an atomic
  conditional-UPDATE lease on a `Setting` row (with a TTL, so a crashed tick self-heals) so overlapping ticks can't
  double-fire retries; the kill switch is DB-backed so the separate worker process actually observes it; and `/approve`
  no longer books fictional recovery on a hand-off case.
- **Trade-off:** Some remaining gaps are documented, not yet built — owned openly as the production roadmap. *(Follow-up:
  a bearer-token guard (`OVERWATCH_ADMIN_TOKEN`) now protects the operator/destructive endpoints — enforced when set,
  open for the zero-config demo — and the metrics endpoint was moved to SQL-side aggregation (groupBy/aggregate) so it
  no longer loads whole tables into memory. Still on the roadmap: a real model registry + drift monitoring, a
  transactional-outbox for per-endpoint idempotency, and order-level out-of-order reconciliation.)*

### ADR-019 — Model the *causal uplift* of each action, not propensity *(2026-08-26)*
- **Context:** Our whole thesis is **incremental** ₹ (treatment − control). The field models the wrong quantity:
  propensity `P(recover | x, action)` (observational, biased by who got which action) or online bandits (cold-start).
  Predicting *whether* a case recovers is not the same as knowing whether *the action helped*.
- **Rationale:** We already run a randomized ~20% no-action control (ADR-017) — the exact experimental data to estimate
  the per-case, per-action **CATE** `τ_a(x) = P(recover | x, do a) − P(recover | x, do nothing)`. `ml/src/uplift.py`
  fits S-/T-/X-learners (CatBoost base learners), picks by uplift metric, and reports **Qini / AUUC / uplift@decile** plus
  a **doubly-robust** off-policy value — the metrics nobody else in the field publishes. Two honesty notes on *where* this
  sits: (1) the **live** `/predict` selects the action by EV over calibrated per-action recovery probabilities
  `argmax_a [p_a·amount − cost_a]`; because the do-nothing baseline `p_0(x)` is action-independent it cancels in the
  argmax, so this selects the **same** action as `argmax_a [τ_a·amount − cost_a]` — the served choice is uplift-consistent
  by construction. (2) The uplift *magnitudes* (τ_a) are what prove the incremental-₹ thesis, decide *whether acting beats
  doing nothing at all* per reason (the Recovery Lab suppression loop, ADR-017), and **validate the deployed policy
  off-policy** (Qini, DR-OPE) — these run **offline** in `ml/` and are surfaced read-only via `/api/ml/uplift`, not on the
  money path. SHAP (`ml/src/serve.py` `/explain`) *is* live, turning the chosen head into signed reason codes.
- **Trade-off:** Clean *per-action* causal estimates ideally want per-action randomization; we start with T-learners on
  observational treatment data + the randomized control baseline, DR-corrected, and state the assumption openly (§5 of
  [`ROADMAP.md`](ROADMAP.md)). A small ε-random per-action assignment is the documented hardening. Feeding τ_a directly
  into the serve-time score (rather than the equivalent-argmax p_a form) is a cosmetic wiring change, not a behavior one.

### ADR-020 — Conformal prediction for a distribution-free coverage guarantee *(2026-08-26)*
- **Context:** Isotonic calibration (ADR-011) makes `recovery_probability` *marginally* honest, but a panel can still
  ask "what's the guarantee on any *single* prediction?" A point probability doesn't answer that.
- **Rationale:** `ml/src/conformal.py` wraps the recovery head in split-conformal prediction: on a held-out calibration
  set it produces prediction sets/intervals with a **finite-sample, distribution-free coverage guarantee** (target
  coverage is met regardless of whether the model is well-specified). Empirical coverage is exported to
  `ml/conformal.json` and asserted by `ml.bands.test.ts`, and surfaced in the UI rigor panel.
- **Trade-off:** Conformal intervals are wider than a naive point estimate — which is the honest picture. It buys a
  guarantee that survives model misspecification, which calibration alone does not.

### ADR-021 — Validate on a *real* randomized trial, not only synthetic worlds *(2026-08-26)*
- **Context:** Every offline number we compute is on synthetic worlds (ADR-012/015). The strongest possible rebuttal to
  "it's all synthetic" is to run the *same* uplift machinery on a real, public randomized experiment.
- **Rationale:** `ml/src/rct_validate.py` runs the uplift/Qini pipeline against the **Hillstrom email RCT** (a genuine
  randomized marketing trial) and exports `ml/rct_validation.json`. It shows the causal method recovers a sensible,
  significant treatment effect on real randomized data — external validity for the *technique*, independent of our world
  generator.
- **Trade-off:** Hillstrom is marketing email, not payment recovery, so it validates the *method* and not the domain
  numbers — stated plainly. It is still far stronger evidence than any synthetic-only claim.

### ADR-022 — Compliance as independent oracles + a red-team battery, separate from the policy it checks *(2026-08-27)*
- **Context:** The policy engine (ADR-016) enforces India rules, and `policy.test.ts` tests it. But a test written by the
  same author against the same code can share the same blind spot. "We enforce compliance" needs an *adversarial*, code-
  independent check to be credible.
- **Rationale:** `server/src/domain/compliance.ts` implements **independent regulatory oracles** — a second, separately
  authored encoding of each rule (RBI TAT, NPCI cap, AFA ceiling, opt-out, quiet hours) that audits a decision the policy
  engine already made, so a bug has to occur in *both* to pass. `redteamAttacks.ts` fires a battery of adversarial cases
  (a debited-pending-reversal nudge, an over-cap retry, an AFA-ceiling silent debit, an opted-out contact, …) at the money
  path; `compliance.redteam.test.ts` asserts every one is caught. Exposed as an in-product **compliance console**.
- **Trade-off:** Two encodings of the rules to maintain — deliberate redundancy, the same reason avionics runs dissimilar
  implementations. The duplication *is* the safety property.

### ADR-023 — Fact-check every outbound message against the case before it can send *(2026-08-27)*
- **Context:** The LLM drafts customer-facing messages (ADR-010). Even off the money path, a hallucinated amount, a wrong
  discount, or an invented reference number in a message to a real customer is a compliance and trust failure.
- **Rationale:** `server/src/domain/messageValidator.ts` (`validateMessageFacts`) parses the drafted message and checks
  every factual token — amount, discount %, order/reference id — against the case's real fields, flagging
  `amount_mismatch` / `discount_mismatch` / `fabricated_reference`. It is wired into `executor.ts`'s outbound guard, so a
  message that fails validation is **blocked, not sent**. Tested in `messageValidator.test.ts`.
- **Trade-off:** A drafted message can be rejected and fall back to a template — the correct failure mode. We constrain
  the LLM's output rather than trusting it.

### ADR-024 — Enforce append-only in the *database*, and classify tampering forensically *(2026-08-27)*
- **Context:** A hash-chained audit log (ADR/ROADMAP) is tamper-*evident*, but application-level "append-only" is only a
  convention — a direct `UPDATE`/`DELETE` on the table bypasses it. And "the chain broke" is less useful than "*how* it
  broke."
- **Rationale:** `server/src/domain/audit.ts` installs a **PostgreSQL trigger** (`ensureAuditAppendOnly`) that rejects any
  `UPDATE`/`DELETE` on the audit table at the DB layer, verified live by a rolled-back probe. `verifyRows` returns a
  forensic classification — **`content_altered`** (a row's payload changed) vs **`chain_relinked`** (rows reordered/spliced)
  — and `forensicDemo()` runs a non-destructive tamper battery proving each is detected. Numbers are canonicalized to 12
  significant figures before hashing so jsonb float round-trips can't cause false tamper alarms. Tested in `audit.chain.test.ts`.
- **Trade-off:** The trigger makes the audit table genuinely immutable in-place (schema migrations must drop/recreate it
  deliberately) — which is exactly the guarantee an auditor wants.

### ADR-025 — Refuse to fabricate "real" captures; ship only genuine ones *(2026-08-28)*
- **Context:** The most impressive proof is a real hosted-Checkout payment captured end-to-end. Automating Razorpay's
  hosted Checkout proved infeasible (cross-origin iframe blocks scripted keystrokes; contact + OTP are mandatory), and
  test mode caps payment links. The tempting shortcut was to synthesize "real"-looking capture receipts.
- **Rationale:** We did **not**. Integrity is the entire value proposition of a money system — a single fabricated receipt
  would poison every real number. We kept only genuine test-card captures, shipped `appendProof.ts` to record real
  captures honestly, and descoped hands-free hosted-Checkout automation rather than fake it. The signed-webhook round-trip
  we *do* demonstrate is real.
- **Trade-off:** Fewer captures in the demo than a fabricated set would show — and that honesty is the point under a panel
  that reads code and can tell.

### ADR-026 — Lock the claim numbers to the code, and rebrand Recoup → Overwatch *(2026-08-28)*
- **Context:** Docs drift from code — a metric quoted in a README goes stale after a retrain and quietly becomes a lie.
  Separately, the project was renamed from "Recoup" to **Overwatch** ("Where nothing slips through").
- **Rationale:** `claims.docs.test.ts` is an **artifact-locked-numbers test**: every headline metric asserted in the docs
  is re-read from the actual ML artifacts / eval JSON at test time, so a number that drifts from the code **fails CI**.
  The rebrand was a mechanical sweep (133 occurrences / 53 files); intentionally preserved were external competitor refs
  (`smit27ai/recoup`), the historical live-capture receipt ids, and the DB function name `recoup_audit_append_only`
  (renaming a live trigger is a needless migration risk).
- **Trade-off:** The claims test is one more gate to keep green — which is the entire point: the docs cannot lie about the
  numbers without breaking the build.
