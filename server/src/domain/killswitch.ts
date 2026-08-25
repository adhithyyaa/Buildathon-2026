import { prisma } from '../lib/prisma';

/**
 * Global kill switch. When engaged, the executor refuses to dispatch ANY action and the retry
 * scheduler stops — a human "stop everything" control.
 *
 * Backed by the durable Setting table (NOT an in-memory flag) so it is shared across processes:
 * the dashboard/API and the separate `npm run worker` scheduler must both observe the same state,
 * or pausing from the UI would not actually stop the worker.
 */
const KEY = 'kill_switch';

interface KillState {
  paused: boolean;
  reason: string | null;
  since: string | null;
}

async function read(): Promise<KillState> {
  const s = await prisma.setting.findUnique({ where: { key: KEY } });
  if (!s?.value) return { paused: false, reason: null, since: null };
  try {
    const v = JSON.parse(s.value) as KillState;
    return { paused: v.paused === true, reason: v.reason ?? null, since: v.since ?? null };
  } catch {
    return { paused: false, reason: null, since: null };
  }
}

async function write(state: KillState): Promise<void> {
  const value = JSON.stringify(state);
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}

export async function isPaused(): Promise<boolean> {
  return (await read()).paused;
}

export async function killSwitchStatus(): Promise<KillState> {
  return read();
}

export async function engageKillSwitch(reason: string, now: Date = new Date()): Promise<void> {
  await write({ paused: true, reason: reason || 'manual pause', since: now.toISOString() });
}

export async function releaseKillSwitch(): Promise<void> {
  await write({ paused: false, reason: null, since: null });
}
