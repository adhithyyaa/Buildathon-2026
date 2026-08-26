import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

const LIVE_INTERVAL_MS = 4000;

/**
 * Refresh bus + Live mode.
 * - `version` bumps on operator actions (demo, manual) — views that fully reload (incl. Model/Lab
 *   remounts) key off this.
 * - `poll` increments on a timer while `live` is on — the frequently-changing views (Overview,
 *   Queue, Pipeline, Evidence) add it to their fetch deps so the dashboard updates itself live.
 */
interface RefreshValue {
  version: number;
  poll: number;
  live: boolean;
  bump: () => void;
  setLive: (on: boolean) => void;
}

const RefreshCtx = createContext<RefreshValue>({ version: 0, poll: 0, live: false, bump: () => {}, setLive: () => {} });

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const [poll, setPoll] = useState(0);
  const [live, setLive] = useState(false);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setPoll((p) => p + 1), LIVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [live]);

  return <RefreshCtx.Provider value={{ version, poll, live, bump, setLive }}>{children}</RefreshCtx.Provider>;
}

export function useRefresh() {
  return useContext(RefreshCtx);
}
