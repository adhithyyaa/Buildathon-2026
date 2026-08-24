import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, type HealthInfo } from '../lib/api';
import { Pill } from './ui';

export function Layout({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500 text-base font-black text-emerald-950">₹</div>
            <div>
              <div className="text-sm font-bold leading-none text-slate-100">Recoup</div>
              <div className="mt-0.5 text-[11px] leading-none text-slate-500">Bounded AI revenue recovery</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Pill tone={health?.integrations.ai ? 'emerald' : 'slate'}>
              AI:{' '}
              {health?.integrations.ai
                ? health.integrations.aiProvider === 'anthropic'
                  ? 'Claude live'
                  : 'LLM live'
                : 'fallback'}
            </Pill>
            <Pill tone={health?.integrations.razorpay ? 'emerald' : 'slate'}>Razorpay: {health?.integrations.razorpay ? 'test-mode' : 'simulated'}</Pill>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
