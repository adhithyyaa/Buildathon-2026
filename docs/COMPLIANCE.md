# Compliance — encoded, not just mentioned

Indian payment-recovery rules are safety-critical, so Overwatch encodes them as **code in the money
path** (the deterministic policy engine + executor), not as prose. This maps each rule to where it
is enforced. "Encoded" = a code path enforces it; "Framed" = represented honestly in behaviour/docs
where a real send can't happen in test mode.

| Rule | What it requires | Status | Where |
|---|---|---|---|
| **RBI TAT auto-reversal** | A failed-but-*debited* payment auto-reverses by T+1 (₹100/day compensation). Never re-nudge / re-charge a customer whose debit is pending reversal (double-debit risk). | **Encoded** | `reasons.ts` classifies `debited_pending_reversal`; `policy.ts` rule 0c **blocks all action** and holds the case. Unit test in `policy.test.ts`. |
| **Deterministic hard-decline triage** | Only auto-retriable failures (bank downtime, UPI timeout, momentary NSF) should be retried; a hard decline needs a fresh link, not a retry. | **Encoded** | `policy.ts` rule 0d overrides `smart_retry`→`send_payment_link` when `!isAutoRetriable`. Tested. |
| **NPCI e-mandate retry cap** | 1 original attempt + at most 3 retries. | **Encoded** | `POLICY_MAX_RETRIES=3`; `policy.ts` rule 2 escalates at the cap. Tested. |
| **NPCI/RBI AFA ceiling** | An auto-debit ≥ ₹15,000 (higher for MF/insurance/card bills) needs an additional-factor-auth / human step, not a silent retry. | **Encoded** | `POLICY_AFA_THRESHOLD_PAISE=1,500,000`; `policy.ts` rule 2b forces human approval. Tested. |
| **Opt-out / DND** | An opted-out customer receives no outreach. | **Encoded** | `policy.ts` rule 1 hard-blocks outreach and switches to a non-contact path or escalates. Tested. |
| **Contact windows (RBI 8–7 / TRAI 10–9)** | Recovery contact is time-bounded. Note: the RBI 8AM–7PM window binds *lenders'* recovery agents, not merchants — so we treat quiet hours as a **self-imposed** policy, not a legal claim. | **Encoded (self-imposed)** | `policy.ts` rule 6 defers outreach during `POLICY_QUIET_HOURS` (21:00–08:00 IST). |
| **TRAI DLT registration** | SMS/WhatsApp require DLT entity/header/template registration + network-level scrubbing — the *binding* reason a demo can't actually send. | **Framed** | Channels are **mocked**: `executor.ts` records the rendered message and audit trail but performs no real send; DLT is the stated reason. |
| **No PAN/CVV (PCI / RBI PA Directions 2025)** | A merchant-side agent must never hold card PAN/CVV; use tokens / UPI mandates. | **Encoded (by absence)** | `schema.prisma` has **no** card-number/CVV fields anywhere; the money surface is Razorpay Payment Links (hosted) + webhooks. |
| **Money precision** | No floating-point currency drift. | **Encoded** | Integer paise everywhere (`lib/money.ts`, `schema.prisma`). |
| **Webhook idempotency** | 24h retries, no ordering guarantee → de-dup and act idempotently. | **Encoded** | HMAC-SHA256 on the raw body (`integrations/razorpay.ts`), `x-razorpay-event-id` dedup (`ProcessedWebhook`), state-idempotent `markRecovered`. |
| **Audit trail** | Every action logged and reviewable. | **Encoded** | **Hash-chained** `AuditLog` with a **PostgreSQL trigger** enforcing append-only *in the database* (a direct `UPDATE`/`DELETE` is rejected, not just discouraged), plus forensic tamper classification (`content_altered` vs `chain_relinked`) — `domain/audit.ts`, tested in `audit.chain.test.ts`, visible per case in the UI. |
| **Human control** | Approval gate + a stop-everything control. | **Encoded** | Approval **dispatches** the withheld action (`/api/cases/:id/approve`), `/reject` declines, and a global **kill switch** (`/api/admin/pause`) halts the executor + scheduler. |
| **Independent rule audit** | A single encoding of a rule can hide a single bug. | **Encoded** | `domain/compliance.ts` re-checks every decision against a **separately authored** set of regulatory oracles, so a violation must occur in *both* the policy engine and the oracle to slip through. Adversarial `redteamAttacks.ts` battery asserts each rule holds under attack (`compliance.redteam.test.ts`). Surfaced as an in-product **compliance console**. |
| **Truthful outreach** | A customer message must not misstate amount, discount, or reference. | **Encoded** | `domain/messageValidator.ts` fact-checks every outbound draft's factual tokens against the case (`amount_mismatch` / `discount_mismatch` / `fabricated_reference`) and **blocks** a mismatching message in the executor's outbound guard (`messageValidator.test.ts`). |

## DPDP Rules 2025 (partial — the honest gap)

Overwatch stores no card data and honours opt-out, but full DPDP data-fiduciary controls
(PII hashing, retention windows, erasure-on-opt-out, breach reporting) are **not yet implemented** —
customers are stored as coarse synthetic priors. This is the top compliance gap for a real
deployment and is called out rather than hidden.

## What is *not* claimed

Test mode cannot exercise real UPI AutoPay retries, real settlements, or real message delivery, so
the mandate/e-mandate leg is fixture/simulation-driven and messaging is mocked. Recovery is measured
at Razorpay **capture** (`payment.captured`), not final settlement — see [WEBHOOKS.md](WEBHOOKS.md).
