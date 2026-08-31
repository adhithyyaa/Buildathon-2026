# Deploying Overwatch to Azure

A deploy kit for hosting the full stack. You're shipping three things — the **web** (Vite build behind
nginx), the **API** (Node/Express + Prisma), and **Postgres** — plus an **optional** ML service (the API
falls back to deterministic scoring when it's absent, so you can ship without it and add it later).

The web container's nginx reverse-proxies `/api` and `/health` to the API, so the browser talks to **one
origin** — no CORS, no build-time API URL. Migrations run automatically when the API boots.

Everything here is a verified-locally starting point; Azure specifics (names, regions, SKUs) are yours to fill in.

---

## Verify locally first (one command)

```bash
RAZORPAY_WEBHOOK_SECRET=whsec_sentinel docker compose -f docker-compose.deploy.yml up --build
```

Open **http://localhost:8080**. This is the exact image you'll host — if it works here, it works on Azure.

> **Needs a Linux Docker engine** (Docker Desktop with the WSL2 backend, or any Linux host). If this
> machine has no WSL2, skip local build entirely and use **`az acr build`** (Path B) — it builds the
> images *in Azure*, no local Docker required. The build steps themselves are verified: the API compiles
> and emits `dist/index.js`, the web app builds to `dist/`, and the ML train args are valid.

---

## Path A — Single Azure VM (fastest; recommended for the buildathon)

The least-friction way to be live today: one VM running the same compose file.

1. **Create the VM** (Ubuntu, ports 80 + 443 open):
   ```bash
   az vm create -g overwatch-rg -n overwatch-vm --image Ubuntu2204 \
     --admin-username azureuser --generate-ssh-keys --size Standard_B2s
   az vm open-port -g overwatch-rg -n overwatch-vm --port 80 --priority 900
   ```
2. **SSH in, install Docker, clone, run:**
   ```bash
   ssh azureuser@<vm-public-ip>
   curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker $USER && newgrp docker
   git clone https://github.com/adhithyyaa/Buildathon-2026.git && cd Buildathon-2026
   PUBLIC_URL=http://<vm-public-ip> WEB_PORT=80 RAZORPAY_WEBHOOK_SECRET=whsec_sentinel \
     RAZORPAY_KEY_ID=rzp_test_xxx RAZORPAY_KEY_SECRET=xxx \
     docker compose -f docker-compose.deploy.yml up -d --build
   ```
   `PUBLIC_URL` wires CORS + the payment-link callback to your host; `WEB_PORT=80` serves the site on the bare
   URL. Drop the `RAZORPAY_KEY_*` line to run with fully-functional simulated links.
3. Open **`http://<vm-public-ip>`** — you're live. For a DNS name + HTTPS, put [Caddy](https://caddyserver.com)
   in front (auto-TLS) or a TLS-terminating Azure Application Gateway, and set `PUBLIC_URL=https://your.domain`.

---

## Path B — Azure Container Apps (managed, scale-to-zero, budget-friendly)

Runs entirely from **Azure Cloud Shell** — no local Docker needed (`az acr build` builds the images in
Azure). The repo is already prepped for it: the API image bundles the `ml/*.json` evidence reports (so the
Intelligence panels work without the Python service), and nginx's upstream is set by the `API_UPSTREAM` env
var (no file edit on deploy).

### Cost — well under $50 for 2 months (uaenorth, education credits)

Postgres runs on **Supabase (free tier, $0)**, so Azure only pays for the registry and the two containers:

| Resource | Config | ~/month | 2 months |
|---|---|---|---|
| Container Registry | Basic | ~$5 | ~$10 |
| Container Apps (api + web) | Consumption, **min-replicas 0** | ~$0–3 | ~$0–6 |
| Log Analytics | default (first 5 GB/mo free) | ~$0 | ~$0 |
| PostgreSQL | **Supabase free tier** (external) | $0 | $0 |
| **Total** | | | **~$10–16** |

The apps scale to zero (a Consumption plan has no fixed environment fee, and light demo traffic fits inside
the monthly free grant), so the registry's ~$5/mo is effectively the only fixed cost.

### One-time deploy (paste into Cloud Shell, in the repo root after `git clone`)

```bash
# ---- variables ----
RG=overwatch-rg; LOC=uaenorth; ENVN=overwatch-env
ACR=overwatch$RANDOM                      # must be globally unique, lowercase alphanumeric
WEBHOOK_SECRET='whsec_overwatch'          # choose your own; use the same in the Razorpay dashboard
RZP_KEY_ID='rzp_test_xxx'                 # from your local server/.env (Razorpay Dashboard → API Keys, Test)
RZP_KEY_SECRET='xxx'                      # from your local server/.env — never commit it
# Supabase → Project Settings → Database → Connection string → "Session pooler" (IPv4, port 5432).
# Paste it verbatim and keep ?sslmode=require. Shape:
DATABASE_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require'

az group create -n $RG -l $LOC
az extension add -n containerapp --upgrade -y

# ---- 1. Container Registry + remote image builds (no local Docker) ----
az acr create -g $RG -n $ACR --sku Basic --admin-enabled true
az acr build -r $ACR -t overwatch-api:v1 -f server/Dockerfile .   # root context bundles ml/*.json
az acr build -r $ACR -t overwatch-web:v1 ./web

# ---- 2. Postgres: none to create — using your Supabase DATABASE_URL above.
#         (Use the SESSION POOLER string, port 5432 — it's IPv4 and supports Prisma's migrate-on-boot.
#          The direct db.<ref>.supabase.co host is IPv6-only on the free tier and won't reach from ACA.)

# ---- 3. Container Apps environment (Consumption; no fixed fee) ----
az containerapp env create -g $RG -n $ENVN -l $LOC

# ---- 4. ACR pull credentials ----
ACR_SERVER=$(az acr show -n $ACR --query loginServer -o tsv)
ACR_USER=$(az acr credential show -n $ACR --query username -o tsv)
ACR_PASS=$(az acr credential show -n $ACR --query 'passwords[0].value' -o tsv)

# ---- 5. API — internal ingress, scale-to-zero, secrets for the sensitive values ----
az containerapp create -g $RG -n overwatch-api --environment $ENVN \
  --image $ACR_SERVER/overwatch-api:v1 \
  --registry-server $ACR_SERVER --registry-username $ACR_USER --registry-password $ACR_PASS \
  --target-port 8787 --ingress internal --min-replicas 0 --max-replicas 1 --cpu 0.5 --memory 1.0Gi \
  --secrets db-url="$DATABASE_URL" rzp-secret="$RZP_KEY_SECRET" wh-secret="$WEBHOOK_SECRET" \
  --env-vars DATABASE_URL=secretref:db-url RAZORPAY_KEY_ID="$RZP_KEY_ID" \
             RAZORPAY_KEY_SECRET=secretref:rzp-secret RAZORPAY_WEBHOOK_SECRET=secretref:wh-secret \
             NODE_ENV=production
API_FQDN=$(az containerapp show -g $RG -n overwatch-api --query properties.configuration.ingress.fqdn -o tsv)

# ---- 6. WEB — external ingress; nginx proxies /api to the API's internal FQDN ----
az containerapp create -g $RG -n overwatch-web --environment $ENVN \
  --image $ACR_SERVER/overwatch-web:v1 \
  --registry-server $ACR_SERVER --registry-username $ACR_USER --registry-password $ACR_PASS \
  --target-port 80 --ingress external --min-replicas 0 --max-replicas 1 --cpu 0.25 --memory 0.5Gi \
  --env-vars API_UPSTREAM="https://$API_FQDN"
WEB_FQDN=$(az containerapp show -g $RG -n overwatch-web --query properties.configuration.ingress.fqdn -o tsv)

# ---- 7. Now the public URL is known — set it on the API (CORS + payment-link callback) ----
az containerapp update -g $RG -n overwatch-api \
  --set-env-vars WEB_ORIGIN="https://$WEB_FQDN" PUBLIC_BASE_URL="https://$WEB_FQDN"

echo "LIVE:    https://$WEB_FQDN"
echo "WEBHOOK: https://$WEB_FQDN/api/webhooks/razorpay"
```

Open the `LIVE` URL. (First hit after idle triggers a ~few-second cold start — scale-to-zero. Refresh once.)

### Getting the values you need (Cloud Shell)

```bash
az acr show -n $ACR --query loginServer -o tsv                                             # registry host
az acr credential show -n $ACR --query username -o tsv                                     # registry user
az acr credential show -n $ACR --query 'passwords[0].value' -o tsv                         # registry password
az containerapp show -g $RG -n overwatch-api --query properties.configuration.ingress.fqdn -o tsv  # API internal FQDN
az containerapp show -g $RG -n overwatch-web --query properties.configuration.ingress.fqdn -o tsv  # public site
```

Your **Razorpay keys are not in Azure** — copy them from your local `server/.env` (Razorpay Dashboard →
Settings → API Keys → **Test Mode**). Rotate a secret later with
`az containerapp secret set -g $RG -n overwatch-api --secrets rzp-secret="<new>"`.

### Webhook + smoke test

Register the webhook in the Razorpay dashboard → **`https://<WEB_FQDN>/api/webhooks/razorpay`**, same
`WEBHOOK_SECRET`, event `payment.captured`. Then verify the money path from Cloud Shell:

```bash
az containerapp exec -g $RG -n overwatch-api --command "npm run selftest:webhook"
```

### Keep it under budget

The container apps idle to zero on their own, and Supabase Postgres is free — so there's nothing to stop
between sessions. The registry (~$5/mo) is the only fixed cost. Tear everything Azure down after the
buildathon with `az group delete -n $RG --yes` (your Supabase project is separate and stays).

### Redeploying after a code change

```bash
az acr build -r $ACR -t overwatch-api:v2 -f server/Dockerfile .
az containerapp update -g $RG -n overwatch-api --image $ACR_SERVER/overwatch-api:v2
# (web: build overwatch-web:v2 from ./web, then update overwatch-web the same way)
```

---

## Environment variables (set on the API)

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Your managed Postgres URL (`sslmode=require` on Azure). |
| `RAZORPAY_WEBHOOK_SECRET` | ✅ for real webhooks | The secret you register in the Razorpay dashboard. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | optional | Test-mode keys — enables real payment links; without them, links are simulated. |
| `WEB_ORIGIN` / `PUBLIC_BASE_URL` | ✅ | Your public web URL (CORS + payment-link callback). |
| `ML_SERVICE_URL` | optional | Point at the ML app if you deploy it; otherwise the API uses deterministic scoring. |
| `ANTHROPIC_API_KEY` **or** `OPENAI_API_KEY`+`OPENAI_BASE_URL`+`OPENAI_MODEL` | optional | Enables LLM explanations/drafts; without them, the deterministic fallback is used. |

> **Compose path (A) shortcut:** set a single **`PUBLIC_URL`** (plus optional **`WEB_PORT`**, default `8080`) — the
> compose file maps it onto both `WEB_ORIGIN` and `PUBLIC_BASE_URL`. On the Container Apps path (B) you set
> `WEB_ORIGIN`/`PUBLIC_BASE_URL` directly on the API app.

Never bake secrets into the image — the `.dockerignore` files exclude `.env`; pass them at runtime.

---

## Razorpay webhook

Point the Razorpay dashboard webhook at **`https://<your-host>/api/webhooks/razorpay`** with the same
`RAZORPAY_WEBHOOK_SECRET`. The endpoint verifies HMAC-SHA256 over the raw body and is idempotent
(exactly-once recovery). Test it end-to-end with `npm run selftest:webhook` from `server/`.

---

## Optional — the ML service

Uncomment the `ml` service in `docker-compose.deploy.yml` (or build `./ml` and deploy it as a third
Container App with internal ingress on `8899`, then set `ML_SERVICE_URL` on the API). It trains its models
at image build (a few minutes). Skipping it is a valid, fully-functional deploy — the API's deterministic
scorer covers every decision path, flagged `source: fallback`.
