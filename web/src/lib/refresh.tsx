import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

/**
 * A tiny refresh bus. Demo actions (seed / run pipeline / resolve / reset) call `bump()`, and any
 * view that reads live data includes `version` in its fetch deps (or is remounted via `key`), so
 * the whole app re-reads after an operator action without prop-drilling a reload callback everywhere.
 */
const RefreshCtx = createContext<{ version: number; bump: () => void }>({ version: 0, bump: () => {} });

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  return <RefreshCtx.Provider value={{ version, bump }}>{children}</RefreshCtx.Provider>;
}

export function useRefresh() {
  return useContext(RefreshCtx);
}
