# Recoup — Setup

Everything runs locally with **no Docker and no cloud account** for the database. Real Razorpay + Claude are optional
add-ons that light up the "real" paths.

## 0. Prerequisites

- Node 20+ and npm
- (optional) A Razorpay account for test-mode keys, and an Anthropic API key

## 1. Install

```bash
cd server && npm install
cd ../web && npm install
```

## 2. Database (zero-setup local Postgres)

Recoup ships a real embedded PostgreSQL for local dev — no Docker needed.

```bash
cd server
cp .env.example .env          # then edit .env (see below)
npm run db:local              # starts embedded Postgres on :5432 (leave running)
```

In a second terminal:

```bash
cd server
npm run prisma:migrate        # create the schema
npm run db:seed               # load 120 synthetic cases (optional; the UI can also seed)
```

> Prefer Docker or a hosted DB? Set `DATABASE_URL` in `.env` to any Postgres URL (e.g. Neon/Supabase or
> `docker compose up -d`) and skip `npm run db:local`.

## 3. Configure `.env`

`server/.env` (copied from `.env.example`). The app runs fully on defaults; fill these in to activate real paths:

| Variable | What it does | Where |
|---|---|---|
| `ANTHROPIC_API_KEY` | Turns on the real **Claude** decisioner (otherwise deterministic fallback) | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Creates **real test-mode payment links** | Razorpay Dashboard → **Test Mode** → Settings → API Keys |
| `RAZORPAY_WEBHOOK_SECRET` | Verifies inbound webhooks (recovered-money proof) | set when you create the webhook (step 5) |

The API runs on **:8787** (`PORT`), the web app on **:5173**.

## 4. Run

```bash
cd server && npm run db:local     # terminal 1: database
cd server && npm run dev          # terminal 2: API on :8787
cd server && npm run worker       # terminal 3 (optional): retry/expiry worker
cd web    && npm run dev          # terminal 4: dashboard on http://localhost:5173
```

Open http://localhost:5173 → **Seed 120 cases → Run pipeline → Advance retries**.

## 5. Razorpay webhook (for the live recovered-money proof)

Real payment links work with just the keys. To have a **paid** link automatically flip a case to `recovered`, Razorpay
must be able to reach your webhook — expose it with a tunnel in dev:

```bash
# either
npx cloudflared tunnel --url http://localhost:8787
# or
ngrok http 8787
```

Then in the Razorpay Dashboard (Test Mode) → **Settings → Webhooks → Add New Webhook**:

- **URL**: `https://<your-tunnel>/api/webhooks/razorpay`
- **Secret**: any string — put the same value in `RAZORPAY_WEBHOOK_SECRET`
- **Active events**: `payment.failed`, `payment_link.paid`, `payment.captured`

Now: open a recovery case → **Open payment link** → pay with a [Razorpay test card](https://razorpay.com/docs/payments/payments/test-card-details/)
→ the webhook fires → the case flips to **recovered** on the dashboard.

> No tunnel handy? The simulated payment link (`/api/demo/pay/:id`) demonstrates the same flip without Razorpay.

## Troubleshooting

- **Port 8787 in use** → change `PORT` and `PUBLIC_BASE_URL` in `.env`, and the proxy in `web/vite.config.ts`.
- **`npm install` skipped install scripts** → this machine gates them; run `npx prisma generate` once by hand.
- **Encoding error storing ₹** → your Postgres must be UTF8 (the embedded one is; a custom `DATABASE_URL` must be too).
