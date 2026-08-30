import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';

/**
 * Money-path integration suite: proves EXACTLY-ONCE recovery through the real
 * signed-webhook route (HTTP -> HMAC verify -> ingest / markRecovered -> Postgres),
 * with DB-level invariants — not just HTTP status codes.
 *
 * The suite boots its OWN throwaway embedded Postgres on port 54329 with data dir
 * server/.pgdata-test (wiped on boot, deleted on stop). It must NEVER touch the
 * dev database on localhost:5432 (server/.pgdata) — a guard below aborts the run
 * if the Prisma client is somehow connected to any other port.
 */

const SERVER_DIR = path.resolve(__dirname, '../../..'); // server/
const TEST_DATA_DIR = path.join(SERVER_DIR, '.pgdata-test'); // never .pgdata — that is the live dev DB
const TEST_PG_PORT = 54329;
const TEST_DB_URL = `postgresql://sentinel:sentinel@localhost:${TEST_PG_PORT}/sentinel`;
const WEBHOOK_SECRET = 'whsec_test_suite';

// Booting a fresh Postgres cluster + pushing the schema takes a while on first run.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 200_000 });

let pg: InstanceType<typeof EmbeddedPostgres> | undefined;
let server: http.Server | undefined;
let baseUrl = '';

// Bound via dynamic import AFTER the test env is set — env.ts and lib/prisma.ts read
// process.env at import time, so a static top-level import would bind the dev DB.
let prisma: (typeof import('../../lib/prisma'))['prisma'];
let transition: (typeof import('../../domain/state'))['transition'];

beforeAll(async () => {
  // 1. Env FIRST. dotenv (loaded by env.ts) and Prisma's own .env loader never
  //    override pre-set values, so these presets win over server/.env.
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.NODE_ENV = 'test';

  // 2. Throwaway cluster: wipe any stale test data dir, then init + start.
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  pg = new EmbeddedPostgres({
    databaseDir: TEST_DATA_DIR,
    user: 'sentinel',
    password: 'sentinel',
    port: TEST_PG_PORT,
    persistent: false, // stop() deletes .pgdata-test — nothing survives the run
    // Force UTF8 so we can store ₹ and other Unicode (Windows initdb defaults to WIN1252).
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('sentinel');

  // 3. Apply the Prisma schema to the TEST database only (explicit env; no migrate,
  //    no reset — those belong to the dev workflow).
  execSync('npx prisma db push --skip-generate', {
    cwd: SERVER_DIR,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'pipe',
    timeout: 120_000,
  });

  // 4. Only now import the code under test, so its module-level env/client bind the test DB.
  ({ prisma } = await import('../../lib/prisma'));
  ({ transition } = await import('../../domain/state'));
  const { createApp } = await import('../../app');

  // 5. Safety interlock: prove the Prisma client is talking to the embedded test
  //    cluster before a single row is written. Anything else aborts the suite.
  const rows = await prisma.$queryRaw<Array<{ port: number }>>`SELECT inet_server_port()::int AS port`;
  if (rows[0]?.port !== TEST_PG_PORT) {
    throw new Error(`SAFETY ABORT: connected to Postgres on port ${rows[0]?.port}, expected ${TEST_PG_PORT}`);
  }

  // 6. Real HTTP server on an ephemeral port — the tests go through fetch, raw-body
  //    parsing and HMAC verification exactly like a Razorpay delivery would.
  const app = createApp();
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  if (prisma) await prisma.$disconnect();
  if (pg) {
    // persistent:false → stop() also deletes the data dir. On Windows the postmaster
    // can still hold file locks for a moment after shutdown, so the delete can throw
    // EBUSY — retry the wipe ourselves; the dir is throwaway and gitignored either way.
    try {
      await pg.stop();
    } catch {
      try {
        fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
      } catch (err) {
        console.warn(`[moneypath] could not remove ${TEST_DATA_DIR} (next boot wipes it):`, err);
      }
    }
  }
});

// ---------- helpers ----------

/** Sign exactly like Razorpay does: HMAC-SHA256 over the raw body, hex-encoded. */
function sign(raw: string): string {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
}

function flipLast(hex: string): string {
  return hex.slice(0, -1) + (hex.endsWith('a') ? 'b' : 'a');
}

async function postWebhook(
  payload: unknown,
  opts: { eventId?: string; tamper?: boolean; unsigned?: boolean } = {},
): Promise<{ status: number; json: Record<string, unknown> }> {
  const raw = JSON.stringify(payload);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (!opts.unsigned) headers['x-razorpay-signature'] = opts.tamper ? flipLast(sign(raw)) : sign(raw);
  if (opts.eventId) headers['x-razorpay-event-id'] = opts.eventId;
  const res = await fetch(`${baseUrl}/api/webhooks/razorpay`, { method: 'POST', headers, body: raw });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

/**
 * POST one delivery over its OWN socket (agent: false). Node's fetch (undici)
 * reuses a single keep-alive connection per origin, which SERIALIZES "parallel"
 * requests — the storm test needs the deliveries genuinely in flight together.
 */
function postWebhookRaw(payload: unknown, eventId: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const raw = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${baseUrl}/api/webhooks/razorpay`,
      {
        method: 'POST',
        agent: false,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(raw),
          'x-razorpay-signature': sign(raw),
          'x-razorpay-event-id': eventId,
        },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () => {
          let json: Record<string, unknown> = {};
          try {
            json = JSON.parse(body) as Record<string, unknown>;
          } catch {
            // non-JSON body — leave {}
          }
          resolve({ status: res.statusCode ?? 0, json });
        });
      },
    );
    req.on('error', reject);
    req.end(raw);
  });
}

function failedPayload(paymentId: string, amount: number) {
  return {
    event: 'payment.failed',
    payload: {
      payment: {
        entity: {
          id: paymentId,
          amount,
          currency: 'INR',
          method: 'card',
          email: 'moneypath@example.com',
          contact: '+919000000042',
          order_id: `order_${paymentId}`,
          error_code: 'BAD_REQUEST_ERROR',
          error_description: 'card declined by issuing bank',
          error_reason: 'card_declined',
        },
      },
    },
  };
}

function capturedPayload(caseId: string, paymentId: string, amount: number) {
  return {
    event: 'payment.captured',
    payload: { payment: { entity: { id: paymentId, amount, notes: { caseId: `case_${caseId}` } } } },
  };
}

/**
 * Walk a case from at_risk to waiting_for_outcome along the legit edges only.
 * The state machine is part of what this suite proves, so we never shortcut it
 * with raw prisma updates.
 */
async function walkToWaitingForOutcome(caseId: string) {
  await transition(caseId, 'analyzed', { step: 'scored', actor: 'system' });
  await transition(caseId, 'action_selected', { step: 'ml_decision', actor: 'system' });
  await transition(caseId, 'action_dispatched', { step: 'send_payment_link', actor: 'executor' });
  await transition(caseId, 'waiting_for_outcome', { step: 'awaiting_outcome', actor: 'system' });
}

const recoveredAudits = (caseId: string) => prisma.auditLog.count({ where: { caseId, step: 'recovered' } });

// ---------- fixtures shared across the ordered scenarios ----------

const PAY_A = 'pay_mp_alpha';
const PAY_B = 'pay_mp_beta';
const AMOUNT_A = 149_900; // ₹1,499.00 in paise
const AMOUNT_B = 259_900; // ₹2,599.00 in paise
const CAPTURE_EVENT_ID = 'evt_mp_cap_1';
let caseAId = '';
let caseBId = '';

describe('money path — signature gate', () => {
  it('rejects a tampered signature with 400 and writes NOTHING', async () => {
    const r = await postWebhook(failedPayload('pay_mp_tampered', 50_000), {
      tamper: true,
      eventId: 'evt_mp_tampered_1',
    });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('invalid_signature');

    // The DB stays pristine — even the event-id ledger must not record a forgery.
    expect(await prisma.event.count()).toBe(0);
    expect(await prisma.case.count()).toBe(0);
    expect(await prisma.processedWebhook.count()).toBe(0);
  });

  it('rejects a missing signature with 400', async () => {
    const r = await postWebhook(failedPayload('pay_mp_unsigned', 50_000), { unsigned: true });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('invalid_signature');
    expect(await prisma.event.count()).toBe(0);
    expect(await prisma.case.count()).toBe(0);
  });

  it('acknowledges a correctly signed unknown event type with 200 and ingests nothing', async () => {
    const r = await postWebhook({ event: 'refund.processed', payload: {} }, { eventId: 'evt_mp_unknown_1' });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(await prisma.event.count()).toBe(0);
    expect(await prisma.case.count()).toBe(0);
  });
});

describe('money path — ingest idempotency', () => {
  it('a signed payment.failed creates exactly one Event and one Case at at_risk', async () => {
    const r = await postWebhook(failedPayload(PAY_A, AMOUNT_A), { eventId: 'evt_mp_fail_1' });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);

    const events = await prisma.event.findMany({ where: { dedupeKey: `rzp_pay:${PAY_A}` }, include: { case: true } });
    expect(events).toHaveLength(1);
    expect(events[0]!.amount).toBe(AMOUNT_A);
    expect(events[0]!.case).toBeTruthy();
    expect(events[0]!.case!.state).toBe('at_risk'); // ingest walks new -> at_risk itself
    caseAId = events[0]!.case!.id;
    expect(await prisma.case.count()).toBe(1);
  });

  it('redelivering the SAME payment id under a fresh event id creates no second case', async () => {
    const r = await postWebhook(failedPayload(PAY_A, AMOUNT_A), { eventId: 'evt_mp_fail_2' });
    expect(r.status).toBe(200);
    expect(r.json.deduped).toBeUndefined(); // fresh event id → the dedupe happened at the dedupeKey level

    expect(await prisma.event.count({ where: { dedupeKey: `rzp_pay:${PAY_A}` } })).toBe(1);
    expect(await prisma.case.count()).toBe(1);
    // No side-writes either: the replayed ingest must not touch the audit trail.
    expect(await prisma.auditLog.count({ where: { caseId: caseAId } })).toBe(2); // ingested + normalized
  });

  it('a different payment id creates a second, independent case', async () => {
    const r = await postWebhook(failedPayload(PAY_B, AMOUNT_B), { eventId: 'evt_mp_fail_3' });
    expect(r.status).toBe(200);

    const events = await prisma.event.findMany({ where: { dedupeKey: `rzp_pay:${PAY_B}` }, include: { case: true } });
    expect(events).toHaveLength(1);
    caseBId = events[0]!.case!.id;
    expect(caseBId).not.toBe(caseAId);
    expect(await prisma.case.count()).toBe(2);
  });
});

describe('money path — the recovery moment', () => {
  it('a signed payment.captured recovers a waiting case with exactly one Outcome and one audit row', async () => {
    await walkToWaitingForOutcome(caseAId);

    const r = await postWebhook(capturedPayload(caseAId, `${PAY_A}_retry`, AMOUNT_A), { eventId: CAPTURE_EVENT_ID });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(r.json.deduped).toBeUndefined();

    const kase = await prisma.case.findUnique({ where: { id: caseAId } });
    expect(kase?.state).toBe('recovered');

    // Exactly one Outcome, carrying the money and the payment reference.
    const outcomes = await prisma.outcome.findMany({ where: { caseId: caseAId } });
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.status).toBe('recovered');
    expect(outcomes[0]!.recoveredAmount).toBe(AMOUNT_A);
    expect(outcomes[0]!.notes).toContain('webhook');
    expect(outcomes[0]!.notes).toContain(`${PAY_A}_retry`);

    // Exactly one 'recovered' audit row, attributed to the webhook actor.
    const audits = await prisma.auditLog.findMany({ where: { caseId: caseAId, step: 'recovered' } });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.actor).toBe('webhook');
    expect(audits[0]!.beforeState).toBe('waiting_for_outcome');
    expect(audits[0]!.afterState).toBe('recovered');

    // The delivery is recorded as processed only AFTER the work succeeded.
    const ledger = await prisma.processedWebhook.findUnique({ where: { eventId: CAPTURE_EVENT_ID } });
    expect(ledger?.eventType).toBe('payment.captured');
  });

  it('redelivering the SAME event id is acknowledged as deduped and changes nothing', async () => {
    const r = await postWebhook(capturedPayload(caseAId, `${PAY_A}_retry`, AMOUNT_A), { eventId: CAPTURE_EVENT_ID });
    expect(r.status).toBe(200);
    expect(r.json.deduped).toBe(true);

    expect(await prisma.outcome.count({ where: { caseId: caseAId } })).toBe(1);
    expect(await recoveredAudits(caseAId)).toBe(1);
    expect(await prisma.processedWebhook.count({ where: { eventId: CAPTURE_EVENT_ID } })).toBe(1);
  });

  it('a crash between processing and recording the event id stays exactly-once on retry', async () => {
    const before = await prisma.outcome.findUnique({ where: { caseId: caseAId } });

    // The route deliberately records the event id AFTER processing, so a crash in
    // between leaves real work done but no ledger row. Simulate exactly that window.
    await prisma.processedWebhook.delete({ where: { eventId: CAPTURE_EVENT_ID } });

    const r = await postWebhook(capturedPayload(caseAId, `${PAY_A}_retry`, AMOUNT_A), { eventId: CAPTURE_EVENT_ID });
    expect(r.status).toBe(200);
    expect(r.json.deduped).toBeUndefined(); // it really reprocessed — and must converge, not duplicate

    const after = await prisma.outcome.findUnique({ where: { caseId: caseAId } });
    expect(await prisma.outcome.count({ where: { caseId: caseAId } })).toBe(1);
    expect(after?.notes).toBe(before?.notes);
    expect(after?.recoveredAt?.toISOString()).toBe(before?.recoveredAt?.toISOString()); // markRecovered no-oped
    expect((await prisma.case.findUnique({ where: { id: caseAId } }))?.state).toBe('recovered');
    expect(await recoveredAudits(caseAId)).toBe(1);
    // The retry re-recorded the delivery, closing the crash window.
    expect(await prisma.processedWebhook.count({ where: { eventId: CAPTURE_EVENT_ID } })).toBe(1);
  });
});

describe('money path — concurrent redelivery storm', () => {
  it('six simultaneous captures for one case converge to exactly-once recovery, all 200', async () => {
    await walkToWaitingForOutcome(caseBId);

    // Six deliveries of the same capture under six DIFFERENT event ids — the ledger
    // cannot help here, so markRecovered itself must be race-safe.
    const stormIds = Array.from({ length: 6 }, (_, i) => `evt_mp_storm_${i}`);

    // Warm the Prisma pool first: the earlier (sequential) tests grow it to ~1
    // connection, and cold connection setup staggers the deliveries so much that
    // they stop overlapping inside markRecovered — the exact window under test.
    await Promise.all(Array.from({ length: 8 }, () => prisma.$queryRaw`SELECT 1`));

    const results = await Promise.all(
      stormIds.map((eventId) => postWebhookRaw(capturedPayload(caseBId, `${PAY_B}_retry`, AMOUNT_B), eventId)),
    );

    const statuses = results.map((r) => r.status);
    expect(statuses, `statuses were [${statuses.join(', ')}]`).toEqual([200, 200, 200, 200, 200, 200]);

    // DB-level exactly-once: one Outcome, one recovered state, ONE audit row.
    const kase = await prisma.case.findUnique({ where: { id: caseBId }, include: { outcome: true } });
    expect(kase?.state).toBe('recovered');
    const outcomes = await prisma.outcome.findMany({ where: { caseId: caseBId } });
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.status).toBe('recovered');
    expect(outcomes[0]!.recoveredAmount).toBe(AMOUNT_B);
    expect(await recoveredAudits(caseBId)).toBe(1);

    // Every successful delivery was recorded in the ledger (process-first, record-after).
    expect(await prisma.processedWebhook.count({ where: { eventId: { in: stormIds } } })).toBe(6);
  });
});
