# Webhooks — the real recovered-money path

Recoup's numbers are only credible if "recovered" means Razorpay actually captured the
money. That proof arrives as a **signed Razorpay webhook**, verified with HMAC-SHA256 over
the raw request body. This is the one inbound surface that must be real, not simulated — so
it ships with a self-test that exercises the exact production code path.

## The two inbound events

`POST /api/webhooks/razorpay` (mounted with `express.raw` so the bytes are untouched before
signature verification):

| Event | What Recoup does |
|---|---|
| `payment.failed` | Normalize → `ingestEvent` → a new **at-risk** case enters the pipeline |
| `payment.captured` · `payment_link.paid` · `order.paid` | Resolve the referenced case (`reference_id` or `notes.caseId = case_<id>`) → `markRecovered(source: 'webhook')` → the case transitions to **recovered** with the captured amount |

Recovery is idempotent (a duplicate capture is a no-op) and the case id travels in the
payment-link `reference_id` / `notes`, so a capture always maps back to the exact case.

## Signature verification

```
expected = HMAC_SHA256(webhook_secret, raw_request_body)      // hex
accept if timingSafeEqual(expected, X-Razorpay-Signature)     // constant-time
```

`verifyWebhookSignature()` (in `server/src/integrations/razorpay.ts`) returns `false` on a
missing secret, a missing header, any body mutation, any signature mutation, or a length
mismatch. An unsigned or wrongly-signed request gets `400 invalid_signature` and never
touches the database.

## Prove it locally — the self-test

The self-test signs realistic payloads and drives them through the **running** server, then
asserts the database actually changed.

```bash
# 1. Start the API with a local signing secret (any throwaway string; NOT a Razorpay secret).
cd server
RAZORPAY_WEBHOOK_SECRET=whsec_local_selftest npm run dev

# 2. In a second shell, run the self-test against it with the SAME secret.
cd server
RAZORPAY_WEBHOOK_SECRET=whsec_local_selftest npm run selftest:webhook
```

Expected output — every check green:

```
— Part A: HMAC-SHA256 signature verification (pure function) —
  PASS  valid signature accepted
  PASS  tampered body rejected
  PASS  tampered signature rejected
  PASS  wrong secret rejected
  PASS  missing signature rejected

— Part B: live signed round-trip through the API —
  PASS  payment.failed accepted (200)
  PASS  case ingested from webhook            — state=at_risk
  PASS  ML pipeline attached a prediction     — catboost (v…) -> send_payment_link
  PASS  case reached a recoverable state      — state=waiting_for_outcome
  PASS  payment.captured accepted (200)
  PASS  case marked recovered via webhook     — state=recovered  recoveredAmount=459900
  PASS  tampered signature rejected (400)

✅ ALL CHECKS PASSED
```

Part A always runs (no server needed). Part B runs only when `RAZORPAY_WEBHOOK_SECRET` is set
and the API is reachable — otherwise it prints a clear `SKIP`.

> The local secret is an arbitrary shared HMAC key used only so the signer and the verifier
> agree. It is **not** a Razorpay-issued credential and grants no access to anything. In
> production, use the secret the Razorpay dashboard generates when you register the webhook.

## Wire a real Razorpay webhook

1. Expose the local API to the internet with a tunnel:
   ```bash
   cloudflared tunnel --url http://localhost:8787
   # or:  ngrok http 8787
   ```
   Copy the public HTTPS URL it prints (e.g. `https://recoup-demo.trycloudflare.com`).
2. Razorpay Dashboard → **Settings → Webhooks → Add New Webhook**:
   - **URL**: `<public-url>/api/webhooks/razorpay`
   - **Secret**: generate one, and put the same value in `server/.env` as `RAZORPAY_WEBHOOK_SECRET`.
   - **Active events**: `payment.failed`, `payment.captured`, `order.paid`, `payment_link.paid`.
3. Restart the API so it picks up the secret. Real failed payments now open cases, and real
   captures close them — the dashboard's "recovered" figure becomes settlement-backed.

## Capture vs. settlement — an honest note

`payment.captured` confirms Razorpay **captured** the payment (funds authorized and taken),
which is the point at which the merchant considers the sale recovered. Final **settlement**
(payout to the merchant's bank, T+n days) is a separate, later event Razorpay emits as
`settlement.processed`. Recoup measures recovery at capture — the industry-standard recovery
milestone — and the same signed-webhook plumbing would extend to `settlement.*` for a
settlement-accurate ledger without any change to the verification path.
