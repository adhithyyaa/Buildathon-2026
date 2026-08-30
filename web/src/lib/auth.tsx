import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface AuthUser {
  name: string;
  email: string;
  picture?: string;
  provider: 'google' | 'email';
}

interface AuthContextValue {
  user: AuthUser | null;
  /** False until the persisted session has been read — guards against a redirect flash on first paint. */
  ready: boolean;
  signIn: (user: AuthUser) => void;
  signOut: () => void;
}

const SESSION_KEY = 'sentinel.session';
const AuthCtx = createContext<AuthContextValue | null>(null);

function readSession(): AuthUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    if (parsed && typeof parsed.email === 'string' && typeof parsed.name === 'string') return parsed;
    return null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(readSession());
    setReady(true);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      signIn: (u: AuthUser) => {
        try {
          localStorage.setItem(SESSION_KEY, JSON.stringify(u));
        } catch {
          /* storage unavailable — keep the in-memory session */
        }
        setUser(u);
      },
      signOut: () => {
        try {
          localStorage.removeItem(SESSION_KEY);
        } catch {
          /* ignore */
        }
        try {
          window.google?.accounts.id.disableAutoSelect();
        } catch {
          /* GIS not loaded — nothing to reset */
        }
        setUser(null);
      },
    }),
    [user, ready],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

/** Two-letter initials for the avatar fallback when there's no Google picture. */
export function initials(user: AuthUser): string {
  const parts = user.name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return user.name.slice(0, 2).toUpperCase();
}
