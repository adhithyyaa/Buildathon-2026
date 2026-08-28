import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useRefresh } from '../lib/refresh';
import { useToast } from '../lib/toast';
import { Icon } from './icons';
import { cx } from './ui';

interface Action {
  key: string;
  label: string;
  hint: string;
  run: () => Promise<unknown>;
  summarize: (r: Record<string, number> & { suppressed?: string[]; reasons?: string[]; anomaly?: boolean }) => string;
  danger?: boolean;
}

const ACTIONS: Action[] = [
  { key: 'seed', label: 'Seed 120 cases', hint: 'Load a reproducible synthetic batch', run: () => api.seed(120), summarize: (o) => `Seeded ${o.created} new · ${o.deduped} duplicate` },
  { key: 'process', label: 'Run pipeline', hint: 'Score, decide and act on every at-risk case', run: () => api.process(), summarize: (o) => `Processed ${o.processed} cases` },
  { key: 'tick', label: 'Advance retries', hint: 'Fast-forward scheduled retries', run: () => api.tick(), summarize: (o) => `Recovered ${o.recovered} · re-queued ${o.reQueued} · expired ${o.expired}` },
  { key: 'spike', label: 'Trigger failure spike', hint: 'Burst UPI timeouts through the anomaly detector', run: () => api.spike(), summarize: (o) => (o.anomaly ? `Spike detected — retries deferred (${(o.reasons ?? []).join(', ').replace(/_/g, ' ')})` : `Burst ingested (${o.created}) — no anomaly flagged`) },
  { key: 'resolve', label: 'Resolve outcomes', hint: 'Draw treatment vs control results for the Lab', run: () => api.labResolve(), summarize: (o) => `Resolved ${o.resolved}: ${o.recovered} recovered${o.suppressed?.length ? ` · suppressed ${o.suppressed.join(', ')}` : ''}` },
  { key: 'reset', label: 'Reset all data', hint: 'Clear every case and start clean', run: () => api.reset(), summarize: () => 'All data cleared', danger: true },
];

/** Operator/demo controls, tucked into the top bar so the app reads as a product, not a toolbox. */
export function DemoMenu() {
  const { bump } = useRefresh();
  const { toast } = useToast();
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
      const summary = a.summarize(r);
      setMsg(summary);
      toast(summary, 'success');
      bump();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setMsg(`Error: ${m}`);
      toast(m.includes('401') || m.includes('unauthorized') ? 'Unauthorized — set the operator token' : `Failed: ${m}`, 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer',
          open ? 'border-slate-300 bg-slate-100 text-slate-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
        )}
      >
        <Icon name="play" className="h-3.5 w-3.5 text-emerald-600" />
        Demo
        <Icon name="chevron" className={cx('h-3.5 w-3.5 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 px-4 py-3 bg-slate-50/50">
            <div className="text-xs font-bold text-slate-900">Demo controls</div>
            <div className="text-[11px] font-medium text-slate-400">Drive the live pipeline for a walkthrough</div>
          </div>
          <div className="p-2 space-y-1">
            {ACTIONS.map((a) => (
              <button
                key={a.key}
                onClick={() => run(a)}
                disabled={!!busy}
                className={cx(
                  'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:opacity-50 cursor-pointer',
                  a.danger ? 'hover:bg-rose-50 text-rose-700' : 'hover:bg-slate-50 text-slate-800',
                )}
              >
                <span className={cx('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg shadow-2xs', a.danger ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700')}>
                  <Icon name={busy === a.key ? 'refresh' : a.danger ? 'power' : 'arrow'} className={cx('h-3.5 w-3.5', busy === a.key && 'animate-spin')} />
                </span>
                <div>
                  <span className="block text-xs font-bold">{busy === a.key ? 'Working…' : a.label}</span>
                  <span className="block text-[11px] text-slate-400 font-medium">{a.hint}</span>
                </div>
              </button>
            ))}
          </div>
          {msg && <div className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-[11px] font-medium text-slate-600">{msg}</div>}
        </div>
      )}
    </div>
  );
}
