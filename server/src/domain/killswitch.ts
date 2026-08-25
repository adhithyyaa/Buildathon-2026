/**
 * Global kill switch. When engaged, the executor refuses to dispatch ANY action and the
 * scheduler stops firing retries — a human "stop everything" control. In-memory by design
 * (resets on restart to the safe default of NOT paused); a durable flag is the prod upgrade.
 */
let paused = false;
let pausedReason: string | null = null;
let pausedAt: Date | null = null;

export function isPaused(): boolean {
  return paused;
}

export function killSwitchStatus(): { paused: boolean; reason: string | null; since: string | null } {
  return { paused, reason: pausedReason, since: pausedAt?.toISOString() ?? null };
}

export function engageKillSwitch(reason: string, now: Date = new Date()): void {
  paused = true;
  pausedReason = reason || 'manual pause';
  pausedAt = now;
}

export function releaseKillSwitch(): void {
  paused = false;
  pausedReason = null;
  pausedAt = null;
}
