# Deploying Sentinel AI to Azure

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
   az vm create -g sentinel-rg -n sentinel-vm --image Ubuntu2204 \
     --admin-username azureuser --generate-ssh-keys --size Standard_B2s
   az vm open-port -g sentinel-rg -n sentinel-vm --port 80 --priority 900
   ```
2. **SSH in, install Docker, clone, run:**
   ```bash
   ssh azureuser@<vm-public-ip>
   curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker $USER && newgrp docker
   git clone https://github.com/adhithyyaa/Buildathon-2026.git && cd Buildathon-2026
   RAZORPAY_KEY_ID=rzp_test_xxx RAZORPAY_KEY_SECRET=xxx RAZORPAY_WEBHOOK_SECRET=whsec_sentinel \
     docker compose -f docker-compose.deploy.yml up -d --build
   ```
3. Point a DNS name (or use the VM IP) at port 80. For HTTPS, put [Caddy](https://caddyserver.com) in front
   or add a TLS-terminating Azure Application Gateway. **You're live.**

---

## Path B — Azure Container Apps (managed, scalable)

1. **Managed Postgres** — Azure Database for PostgreSQL (Flexible Server). Grab the connection string:
   ```
   DATABASE_URL=postgresql://<user>:<pass>@<server>.postgres.database.azure.com:5432/sentinel?sslmode=require
   ```
2. **Build + push images** to Azure Container Registry (ACR builds remotely — no local Docker needed):
   ```bash
   az acr build -r <acr> -t sentinel-api:latest ./server
   az acr build -r <acr> -t sentinel-web:latest ./web
   ```
3. **Create the Container Apps environment**, then deploy:
   - **api** — internal ingress, target port `8787`. Set the env vars from the table below (`DATABASE_URL`,
     `RAZORPAY_*`, `RAZORPAY_WEBHOOK_SECRET`, `WEB_ORIGIN`/`PUBLIC_BASE_URL` = the web app's public URL).
     Migrations apply on boot.
   - **web** — external ingress, target port `80`. **One edit:** in [`web/nginx.conf`](../web/nginx.conf)
     replace `http://api:8787` with the API container app's **internal FQDN**
     (`https://sentinel-api.internal.<env>.<region>.azurecontainerapps.io`), then rebuild the web image.
     (Cross-app proxy on ACA needs the internal FQDN; on the single-VM path the service name `api` just works.)
4. Open the web app's public URL. Done.

---

## Environment variables (set on the API)

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Your managed Postgres URL (`sslmode=require` on Azure). |
| `RAZORPAY_WEBHOOK_SECRET` | ✅ for real webhooks | The secret you register in the Razorpay dashboard. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | optional | Test-mode keys — enables real payment links; without them, links are simulated. |
| `WEB_ORIGIN` / `PUBLIC_BASE_URL` | ✅ | Your public web URL (CORS + link generation). |
| `ML_SERVICE_URL` | optional | Point at the ML app if you deploy it; otherwise the API uses deterministic scoring. |
| `ANTHROPIC_API_KEY` **or** `OPENAI_API_KEY`+`OPENAI_BASE_URL`+`OPENAI_MODEL` | optional | Enables LLM explanations/drafts; without them, the deterministic fallback is used. |

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
