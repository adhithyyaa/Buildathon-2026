import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, Outlet } from 'react-router-dom';
import { api, type HealthInfo, type IncidentStatus } from '../lib/api';
import { NAV_SECTIONS, pageForPath } from '../lib/nav';
import { Icon } from './icons';
import { Logo } from './Logo';
import { DemoMenu } from './DemoMenu';
import { TokenControl } from './TokenControl';
import { UserMenu } from './UserMenu';
import { CommandPalette } from './CommandPalette';
import { useRefresh } from '../lib/refresh';
import { cx } from './ui';

export function Layout() {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [paused, setPaused] = useState(false);
  const [incidents, setIncidents] = useState<IncidentStatus | null>(null);
  const location = useLocation();
  const page = pageForPath(location.pathname);
  const { live, setLive, version, poll } = useRefresh();

  // Poll health + kill-switch on an interval (not once on mount): the ML service is scale-to-zero, so a
  // page load while it is cold would otherwise pin the sidebar to "offline" forever. Re-polling lets the
  // indicator self-heal once ML warms — and, because each poll pings ML's /health, it keeps ML warm while
  // the dashboard is open (it still scales back to zero when nobody is watching).
  useEffect(() => {
    const load = () => {
      api.health().then(setHealth).catch(() => setHealth(null));
      api.killSwitch().then((s) => setPaused(s.paused)).catch(() => {});
    };
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  // Live failure-spike awareness — refreshed with the rest of the app so the strip appears
  // the moment the IsolationForest flags an incident and clears when the window passes.
  useEffect(() => {
    api.incidents().then(setIncidents).catch(() => setIncidents(null));
  }, [version, poll]);

  const toggleKill = async () => {
    const s = paused ? await api.resume() : await api.pause('operator paused from dashboard');
    setPaused(s.paused);
  };

  return (
    <div className="min-h-full bg-[#f8fafc]">
      <CommandPalette />
      {/* Sidebar (desktop) — light rail, emerald signal */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200/80 bg-white lg:flex">
        {/* Brand */}
        <div className="p-4">
          <Link
            to="/app"
            className="flex items-center gap-3 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-xs transition-colors hover:border-slate-300"
          >
            <Logo className="h-9 w-9 shrink-0" />
            <div className="text-left">
              <div className="text-sm font-bold leading-none text-slate-900">Overwatch</div>
              <div className="mt-1 font-mono text-[10px] uppercase leading-none tracking-wider text-slate-400">Where Nothing Slips Through</div>
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
                    end={item.path === '/app'}
                    className={({ isActive }) =>
                      cx(
                        // Active items carry an emerald tint + border; inactive items keep a same-width
                        // transparent border so switching tabs never shifts the layout (no flicker).
                        'group relative flex items-center justify-between rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'border-emerald-200 bg-emerald-50 font-semibold text-emerald-900'
                          : 'border-transparent text-slate-700 hover:bg-slate-100',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-emerald-500" />}
                        <div className="flex items-center gap-3">
                          <Icon
                            name={item.icon}
                            className={cx(
                              'h-[18px] w-[18px] transition-colors',
                              isActive ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-600',
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
              <Link to="/app" className="lg:hidden"><Logo className="h-8 w-8" /></Link>
              <div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                  <span>Overwatch</span>
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
              <div className="mx-0.5 h-6 w-px bg-slate-200" />
              <UserMenu />
            </div>
          </div>

          {/* Mobile Nav Strip */}
          <nav className="flex gap-1 overflow-x-auto border-t border-slate-200/80 px-3 py-1.5 lg:hidden">
            {NAV_SECTIONS.flatMap((s) => s.items).slice(0, 5).map((item) => (
              <NavLink
                key={`mobile-${item.path}-${item.label}`}
                to={item.path}
                end={item.path === '/app'}
                className={({ isActive }) =>
                  cx(
                    'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium',
                    isActive ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100',
                  )
                }
              >
                <Icon name={item.icon} className="h-3.5 w-3.5" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        {/* Live incident strip — visible on every page while a failure spike is active */}
        {incidents && incidents.active.length > 0 && <IncidentStrip incidents={incidents} />}

        {/* Content Area */}
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8"><Outlet /></main>
      </div>
    </div>
  );
}

/**
 * F9: the IsolationForest's live output, in the idiom of Razorpay's downtime feed. While a
 * reason is flagged, the policy engine is deferring its retries instead of adding to the storm.
 */
function IncidentStrip({ incidents }: { incidents: IncidentStatus }) {
  const pretty = (r: string) => r.replace(/_/g, ' ');
  return (
    <div className="border-b border-amber-200/80 bg-amber-50/90">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:px-6 lg:px-8">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
        </span>
        <span className="text-xs font-bold text-amber-900">Failure spike active</span>
        {incidents.active.map((a) => (
          <span key={a.reason} className="rounded-md bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-300/70">
            {pretty(a.reason)} · z-flagged
          </span>
        ))}
        <span className="text-[11px] font-medium text-amber-700">
          Automatic retries for {incidents.active.length === 1 ? 'this reason are' : 'these reasons are'} deferred — the engine won't retry into an outage.
        </span>
        <span className="ml-auto hidden text-[10.5px] font-medium text-amber-600/80 sm:block">
          IsolationForest · clears after {incidents.windowMinutes} min quiet
        </span>
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
    <div className="border-t border-slate-200/80 bg-slate-50/50 px-4 py-3">
      <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">System</div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2 px-1 text-xs">
            <span className={cx('h-1.5 w-1.5 rounded-full', r.ok ? 'bg-emerald-500' : 'bg-slate-400')} />
            <span className="font-medium text-slate-500">{r.label}</span>
            <span className={cx('ml-auto font-mono text-[11px] font-semibold tabular-nums', r.ok ? 'text-slate-700' : 'text-slate-400')}>
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
