import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { api, type HealthInfo } from '../lib/api';
import { NAV, pageForPath } from '../lib/nav';
import { Icon } from './icons';
import { DemoMenu } from './DemoMenu';
import { cx } from './ui';

export function Layout({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [paused, setPaused] = useState(false);
  const location = useLocation();
  const page = pageForPath(location.pathname);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
    api.killSwitch().then((s) => setPaused(s.paused)).catch(() => {});
  }, []);

  const toggleKill = async () => {
    const s = paused ? await api.resume() : await api.pause('operator paused from dashboard');
    setPaused(s.paused);
  };

  return (
    <div className="min-h-full">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-800/80 bg-slate-950/60 backdrop-blur lg:flex">
        <Link to="/" className="flex items-center gap-2.5 px-5 py-4">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500 text-lg font-black text-emerald-950">₹</div>
          <div>
            <div className="text-sm font-bold leading-none text-slate-100">Recoup</div>
            <div className="mt-1 text-[11px] leading-none text-slate-500">Revenue Recovery Engine</div>
          </div>
        </Link>

        <nav className="mt-2 flex-1 space-y-1 px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                cx(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-slate-800/70 text-white' : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-emerald-400" />}
                  <Icon name={item.icon} className={cx('h-[18px] w-[18px]', isActive ? 'text-emerald-300' : 'text-slate-500 group-hover:text-slate-300')} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <SystemStatus health={health} />
      </aside>

      {/* Main column */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur">
          <div className="flex items-center justify-between gap-4 px-5 py-3 lg:px-8">
            {/* mobile brand */}
            <Link to="/" className="flex items-center gap-2 lg:hidden">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500 text-base font-black text-emerald-950">₹</div>
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-slate-100">{page.label}</h1>
              <p className="hidden truncate text-xs text-slate-500 sm:block">{page.subtitle}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <DemoMenu />
              <button
                onClick={toggleKill}
                title="Kill switch — stop or resume all automated dispatch and retries"
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors',
                  paused
                    ? 'border-rose-500/60 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
                    : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:border-rose-500/50 hover:text-rose-300',
                )}
              >
                <Icon name="power" className="h-3.5 w-3.5" />
                {paused ? 'Resume' : 'Pause'}
              </button>
            </div>
          </div>

          {/* mobile nav strip */}
          <nav className="flex gap-1 overflow-x-auto border-t border-slate-800/80 px-3 py-1.5 lg:hidden">
            {NAV.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  cx(
                    'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium',
                    isActive ? 'bg-slate-800 text-white' : 'text-slate-400',
                  )
                }
              >
                <Icon name={item.icon} className="h-3.5 w-3.5" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="mx-auto max-w-7xl px-5 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function SystemStatus({ health }: { health: HealthInfo | null }) {
  const rows: Array<{ label: string; ok: boolean; value: string }> = [
    { label: 'ML service', ok: !!health?.integrations.ml, value: health?.integrations.ml ? `v${health.integrations.mlVersion ?? ''}` : 'offline' },
    {
      label: 'LLM notes',
      ok: !!health?.integrations.ai,
      value: health?.integrations.ai ? (health.integrations.aiProvider === 'anthropic' ? 'Claude' : 'live') : 'templates',
    },
    { label: 'Razorpay', ok: !!health?.integrations.razorpay, value: health?.integrations.razorpay ? 'test-mode' : 'simulated' },
  ];
  return (
    <div className="border-t border-slate-800/80 px-4 py-3">
      <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">System</div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2 px-1 text-xs">
            <span className={cx('h-1.5 w-1.5 rounded-full', r.ok ? 'bg-emerald-400' : 'bg-slate-600')} />
            <span className="text-slate-400">{r.label}</span>
            <span className={cx('ml-auto tabular-nums', r.ok ? 'text-slate-300' : 'text-slate-600')}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
