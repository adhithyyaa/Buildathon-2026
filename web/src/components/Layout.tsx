import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { api, type HealthInfo } from '../lib/api';
import { NAV_SECTIONS, pageForPath } from '../lib/nav';
import { Icon } from './icons';
import { DemoMenu } from './DemoMenu';
import { TokenControl } from './TokenControl';
import { useRefresh } from '../lib/refresh';
import { cx } from './ui';

export function Layout({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [paused, setPaused] = useState(false);
  const location = useLocation();
  const page = pageForPath(location.pathname);
  const { live, setLive } = useRefresh();

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
    api.killSwitch().then((s) => setPaused(s.paused)).catch(() => {});
  }, []);

  const toggleKill = async () => {
    const s = paused ? await api.resume() : await api.pause('operator paused from dashboard');
    setPaused(s.paused);
  };

  return (
    <div className="min-h-full bg-[#f8fafc]">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200/80 bg-white lg:flex">
        {/* Brand */}
        <div className="p-4">
          <Link
            to="/"
            className="flex items-center gap-3 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-xs hover:border-slate-300 transition-colors"
          >
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500 text-base font-black text-emerald-950 shadow-2xs">₹</div>
            <div className="text-left">
              <div className="text-sm font-bold text-slate-900 leading-none">Recoup</div>
              <div className="mt-1 text-[11px] text-slate-500 leading-none font-medium">Revenue Recovery Engine</div>
            </div>
          </Link>
        </div>

        {/* Navigation Sections */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title}>
              <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {section.title}
              </div>
              <div className="mt-1.5 space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={`${section.title}-${item.path}-${item.label}`}
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) =>
                      cx(
                        'group relative flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition-all',
                        isActive
                          ? 'bg-white text-slate-900 border border-slate-200/90 shadow-xs font-semibold'
                          : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div className="flex items-center gap-3">
                          <Icon
                            name={item.icon}
                            className={cx(
                              'h-[18px] w-[18px] transition-colors',
                              isActive ? 'text-slate-950' : 'text-slate-400 group-hover:text-slate-600',
                            )}
                          />
                          <span>{item.label}</span>
                        </div>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* System Health Info */}
        <SystemStatus health={health} />
      </aside>

      {/* Main column */}
      <div className="lg:pl-64">
        {/* Top Header */}
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
          <div className="flex items-center justify-between gap-4 px-5 py-3.5 lg:px-8">
            {/* Left: Breadcrumbs & Page title */}
            <div className="flex items-center gap-3">
              <Link to="/" className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500 text-base font-black text-emerald-950 lg:hidden">₹</Link>
              <div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                  <span>Recoup</span>
                  <span>›</span>
                  <span className="text-slate-600">{page.label}</span>
                </div>
                <h1 className="text-lg font-bold tracking-tight text-slate-900 leading-tight">
                  {page.label}
                </h1>
              </div>
            </div>

            {/* Right: Controls */}
            <div className="flex shrink-0 items-center gap-2.5">
              <LiveToggle live={live} setLive={setLive} />
              <DemoMenu />
              <button
                onClick={toggleKill}
                title="Kill switch — stop or resume all automated dispatch and retries"
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer',
                  paused
                    ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-rose-300 hover:text-rose-600',
                )}
              >
                <Icon name="power" className="h-3.5 w-3.5" />
                {paused ? 'Resume' : 'Pause'}
              </button>
              <TokenControl />
            </div>
          </div>

          {/* Mobile Nav Strip */}
          <nav className="flex gap-1 overflow-x-auto border-t border-slate-200/80 px-3 py-1.5 lg:hidden">
            {NAV_SECTIONS.flatMap((s) => s.items).slice(0, 5).map((item) => (
              <NavLink
                key={`mobile-${item.path}-${item.label}`}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  cx(
                    'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium',
                    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                  )
                }
              >
                <Icon name={item.icon} className="h-3.5 w-3.5" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        {/* Content Area */}
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function LiveToggle({ live, setLive }: { live: boolean; setLive: (on: boolean) => void }) {
  return (
    <button
      onClick={() => setLive(!live)}
      title={live ? 'Live updates on — auto-refreshing every few seconds' : 'Turn on live auto-refresh'}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer',
        live
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
      )}
    >
      <span className="relative flex h-2 w-2">
        {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400" />}
        <span className={cx('relative inline-flex h-2 w-2 rounded-full', live ? 'bg-emerald-500' : 'bg-slate-400')} />
      </span>
      Live
    </button>
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
    <div className="border-t border-slate-200/80 px-4 py-3 bg-slate-50/50">
      <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">System</div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2 px-1 text-xs">
            <span className={cx('h-1.5 w-1.5 rounded-full', r.ok ? 'bg-emerald-500' : 'bg-slate-400')} />
            <span className="text-slate-500 font-medium">{r.label}</span>
            <span className={cx('ml-auto tabular-nums font-semibold', r.ok ? 'text-slate-700' : 'text-slate-400')}>
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
