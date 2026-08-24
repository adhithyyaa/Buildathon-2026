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

### ADR-004 — AI proposes, deterministic code disposes
- **Context:** The core trust question for an autonomous money system.
- **Rationale:** The LLM only produces a *diagnosis*, a *proposed action*, and *message text*. A deterministic policy
  engine can override or block any proposal; a deterministic executor performs only allow-listed actions. The LLM never
  moves money and never has the final say. This is the difference between "a product" and "a chatbot that spends money."
- **Trade-off:** Less "magic," more guardrails — which is the correct trade-off for payments.

### ADR-005 — Structured LLM output, validated, with deterministic fallback
- **Context:** LLMs occasionally emit malformed or out-of-range output.
- **Rationale:** Every AI call must return JSON matching a Zod schema. On invalid output we log `valid=false` and fall
  back to a rule-based decision, so the pipeline never stalls. **JSON validity rate** is a tracked metric.
- **Trade-off:** Extra validation code; buys reliability and an honest reliability number to show judges.

### ADR-006 — PostgreSQL + Prisma
- **Context:** Need relational integrity across events→cases→decisions→actions→outcomes and an append-only audit log.
- **Rationale:** Postgres native enums + `Json` columns model the domain cleanly; Prisma's schema doubles as
  documentation and gives type-safe queries. Runs locally via Docker Compose, or against any hosted URL (Neon/Supabase)
  by changing one env var.
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
