# Recoup — Bounded AI Revenue Recovery for Razorpay

> Recover the revenue you already earned. Recoup detects failed payments and abandoned checkouts, uses AI to diagnose
> *why* they failed and decide the safest recovery move, executes it with **real Razorpay payment links** under hard
> policy limits, and proves — with a live webhook round-trip — exactly how much money it brought back.

**Razorpay AI Buildathon 2026 · Track: AI Revenue Recovery**

---

## The one-line thesis

Payment failure in India is usually *mechanical and recoverable* (UPI timeout, bank downtime, a momentary decline),
not a change of heart. The right recovery is **decisioning under constraints** — the right action, on the right channel,
at the right time — not blasting reminders. Recoup is that decisioning engine, with the AI kept on a short leash: it
**proposes**, a deterministic policy engine **disposes**, and a deterministic executor moves the money.

## What makes it credible (not just a demo)

- **Real Razorpay test-mode** Orders + Payment Links + Webhooks. Pay a recovery link with a test card → a webhook flips
  the case to `recovered` and the dashboard's recovered-₹ counter moves. That round-trip is the proof.
- **Controlled AI.** The LLM only diagnoses, proposes an action, and drafts the message. It never enforces policy, never
  moves money, never has the final say. Invalid AI output falls back to deterministic rules (and we track how often).
- **Honest metrics.** Recovery rate, blocked actions, escalations, and unrecovered cases are all shown — including a
  baseline-vs-Recoup before/after.
- **Full audit trail.** Every state transition is logged (`before → after`, actor, details).

## Architecture at a glance

```
Razorpay webhook / CSV / demo panel
        → normalize → risk-score → AI diagnose → AI decide → POLICY ENGINE (can override)
        → executor (real payment link / smart retry / message / escalate)
        → outcome tracker (payment.captured webhook) → metrics + audit dashboard
```

Full write-up (and panel-prep): [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ·
Decisions & trade-offs: [`docs/DECISIONS.md`](docs/DECISIONS.md)

## Tech

TypeScript everywhere · Node + Express + Prisma + PostgreSQL · React + Vite + Tailwind + shadcn · Anthropic Claude
(structured, validated output) · Razorpay test-mode APIs.

## Repo layout

```
server/   Node + Express API, Prisma schema, the recovery pipeline, the retry worker, seed data
web/      React dashboard (at-risk queue, case detail, metrics, audit trail)
docs/     ARCHITECTURE.md · DECISIONS.md · DEMO.md
```

## Quickstart

> Full setup (test keys, webhook tunnel, seeding) lives in [`docs/SETUP.md`](docs/SETUP.md) — added as the pieces land.

```bash
# 1. Database (local Postgres via Docker)
docker compose up -d

# 2. Server
cd server
cp .env.example .env      # then fill in Razorpay test keys + Anthropic key
npm install
npm run prisma:migrate
npm run db:seed
npm run dev

# 3. Web (in a second terminal)
cd web
npm install
npm run dev
```

## Status

🚧 Under active development for the buildathon. See the commit history for the build order.
