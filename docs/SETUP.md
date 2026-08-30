# Sentinel — Setup

Everything runs locally with **no Docker and no cloud account** for the database. Real Razorpay + Claude are optional
add-ons that light up the "real" paths.

## 0. Prerequisites

- Node 20+ and npm
- **Python 3.11+** (for the ML decision tier)
- (optional) A Razorpay account for test-mode keys, and an LLM key (Anthropic or any OpenAI-compatible provider)

## 1. Install

```bash
cd server && npm install
cd ../web && npm install
```

### ML tier (the decision models)

The decision is made by tabular models served from a small Python/FastAPI service. Set it up once:

```bash
cd ml
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # Windows;  macOS/Linux: .venv/bin/pip install -r requirements.txt
```

Then (from the repo root) generate data + train — this writes `ml/artifacts/*` and `ml/metrics.json`:

```bash
ml/.venv/Scripts/python ml/src/worldmodel.py    # 30k-case synthetic "world model"
ml/.venv/Scripts/python ml/src/train.py         # train + calibrate CatBoost/XGBoost/LogReg + anomaly
```

## 2. Database (zero-setup local Postgres)

Sentinel ships a real embedded PostgreSQL for local dev — no Docker needed.

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
| `ANTHROPIC_API_KEY` *or* `LLM_API_KEY`/`LLM_BASE_URL` | Turns on the LLM **narrator** (explanations, drafted messages). The **decision is ML** either way; without a key, narration falls back to templates. | [console.anthropic.com](https://console.anthropic.com/settings/keys) or any OpenAI-compatible provider |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Creates **real test-mode payment links** | Razorpay Dashboard → **Test Mode** → Settings → API Keys |
| `RAZORPAY_WEBHOOK_SECRET` | Verifies inbound webhooks (recovered-money proof) | set when you create the webhook (step 5) |

The API runs on **:8787** (`PORT`), the ML service on **:8899**, the web app on **:5173**.

## 4. Run

```bash
cd server && npm run db:local     # terminal 1: database on :5432
ml/.venv/Scripts/python -m uvicorn serve:app --app-dir ml/src --port 8899   # terminal 2: ML service on :8899
cd server && npm run dev          # terminal 3: API on :8787
cd server && npm run worker       # terminal 4 (optional): retry/expiry worker
cd web    && npm run dev          # terminal 5: dashboard on http://localhost:5173
```

Open http://localhost:5173 → **Seed 120 cases → Run pipeline → Advance retries**. The header shows three live
integrations — **ML** (decision service), **LLM notes** (narrator), and **Razorpay** — so you can see what's wired.

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

> **Prove the signed-webhook path in one command** (no tunnel, no dashboard) — see [`WEBHOOKS.md`](./WEBHOOKS.md):
> ```bash
> cd server
> RAZORPAY_WEBHOOK_SECRET=whsec_local_selftest npm run dev          # terminal A
> RAZORPAY_WEBHOOK_SECRET=whsec_local_selftest npm run selftest:webhook   # terminal B → all green
> ```

> **Replay the REAL captured round-trip** — two actual Razorpay test-mode payments (`pay_TTxufNdQ8rLAvB`,
> `pay_TTyBx4OQoIQFkj`, committed at `server/fixtures/razorpay/live-captures.json`) recovered via the signed-webhook
> path, no keys or tunnel needed:
> ```bash
> cd server
> RAZORPAY_WEBHOOK_SECRET=whsec_local_selftest npm run dev                 # terminal A
> RAZORPAY_WEBHOOK_SECRET=whsec_local_selftest npm run replay:roundtrip    # terminal B → "✅ REPLAYED …"
> ```
> See [`WEBHOOKS.md`](./WEBHOOKS.md) for the full write-up.

## Troubleshooting

- **Port 8787 in use** → change `PORT` and `PUBLIC_BASE_URL` in `.env`, and the proxy in `web/vite.config.ts`.
- **`npm install` skipped install scripts** → this machine gates them; run `npx prisma generate` once by hand.
- **Encoding error storing ₹** → your Postgres must be UTF8 (the embedded one is; a custom `DATABASE_URL` must be too).
