import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useRefresh } from '../lib/refresh';
import { Icon } from './icons';
import { cx } from './ui';

interface Action {
  key: string;
  label: string;
  hint: string;
  run: () => Promise<unknown>;
  summarize: (r: Record<string, number> & { suppressed?: string[] }) => string;
  danger?: boolean;
}

const ACTIONS: Action[] = [
  { key: 'seed', label: 'Seed 120 cases', hint: 'Load a reproducible synthetic batch', run: () => api.seed(120), summarize: (o) => `Seeded ${o.created} new · ${o.deduped} duplicate` },
  { key: 'process', label: 'Run pipeline', hint: 'Score, decide and act on every at-risk case', run: () => api.process(), summarize: (o) => `Processed ${o.processed} cases` },
  { key: 'tick', label: 'Advance retries', hint: 'Fast-forward scheduled retries', run: () => api.tick(), summarize: (o) => `Recovered ${o.recovered} · re-queued ${o.reQueued} · expired ${o.expired}` },
  { key: 'resolve', label: 'Resolve outcomes', hint: 'Draw treatment vs control results for the Lab', run: () => api.labResolve(), summarize: (o) => `Resolved ${o.resolved}: ${o.recovered} recovered${o.suppressed?.length ? ` · suppressed ${o.suppressed.join(', ')}` : ''}` },
  { key: 'reset', label: 'Reset all data', hint: 'Clear every case and start clean', run: () => api.reset(), summarize: () => 'All data cleared', danger: true },
];

/** Operator/demo controls, tucked into the top bar so the app reads as a product, not a toolbox. */
export function DemoMenu() {
  const { bump } = useRefresh();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  async function run(a: Action) {
    setBusy(a.key);
    setMsg('');
    try {
      const r = (await a.run()) as Record<string, number> & { suppressed?: string[] };
      setMsg(a.summarize(r));
      bump();
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
          open ? 'border-slate-600 bg-slate-800 text-slate-100' : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-800',
        )}
      >
        <Icon name="play" className="h-3.5 w-3.5" />
        Demo
        <Icon name="chevron" className={cx('h-3.5 w-3.5 text-slate-500 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900 shadow-2xl shadow-black/40">
          <div className="border-b border-slate-800 px-4 py-2.5">
            <div className="text-xs font-semibold text-slate-200">Demo controls</div>
            <div className="text-[11px] text-slate-500">Drive the live pipeline for a walkthrough</div>
          </div>
          <div className="p-1.5">
            {ACTIONS.map((a) => (
              <button
                key={a.key}
                onClick={() => run(a)}
                disabled={!!busy}
                className={cx(
                  'flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors disabled:opacity-50',
                  a.danger ? 'hover:bg-rose-500/10' : 'hover:bg-slate-800',
                )}
              >
                <span className={cx('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md', a.danger ? 'bg-rose-500/15 text-rose-300' : 'bg-slate-800 text-slate-300')}>
                  <Icon name={busy === a.key ? 'refresh' : a.danger ? 'power' : 'arrow'} className={cx('h-3.5 w-3.5', busy === a.key && 'animate-spin')} />
                </span>
                <span>
                  <span className={cx('block text-sm font-medium', a.danger ? 'text-rose-200' : 'text-slate-200')}>{busy === a.key ? 'Working…' : a.label}</span>
                  <span className="block text-[11px] text-slate-500">{a.hint}</span>
                </span>
              </button>
            ))}
          </div>
          {msg && <div className="border-t border-slate-800 px-4 py-2 text-[11px] text-slate-400">{msg}</div>}
        </div>
      )}
    </div>
  );
}
