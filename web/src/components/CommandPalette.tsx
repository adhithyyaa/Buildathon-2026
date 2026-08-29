import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { NAV } from '../lib/nav';
import { api } from '../lib/api';
import { useRefresh } from '../lib/refresh';
import { useToast } from '../lib/toast';
import { Icon } from './icons';
import { cx } from './ui';

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  group: 'Go to' | 'Action';
  icon: string;
  run: () => void | Promise<unknown>;
}

/** ⌘K / Ctrl-K command palette: fuzzy-jump to any page and fire the common demo actions. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const nav = useNavigate();
  const { bump } = useRefresh();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Cmd[]>(() => {
    const go: Cmd[] = NAV.map((n) => ({ id: `nav-${n.path}`, label: n.label, hint: n.subtitle, group: 'Go to', icon: n.icon, run: () => nav(n.path) }));
    const act = async (name: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
        toast(`${name} — done`, 'success');
        bump();
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        toast(m.includes('401') || m.includes('unauthorized') ? 'Unauthorized — set the operator token' : `Failed: ${m}`, 'error');
      }
    };
    const actions: Cmd[] = [
      { id: 'a-seed', label: 'Seed 120 cases', group: 'Action', icon: 'play', run: () => act('Seed', () => api.seed(120)) },
      { id: 'a-process', label: 'Run pipeline', group: 'Action', icon: 'pipeline', run: () => act('Pipeline', () => api.process()) },
      { id: 'a-tick', label: 'Advance retries', group: 'Action', icon: 'refresh', run: () => act('Advance retries', () => api.tick()) },
      { id: 'a-spike', label: 'Trigger failure spike', group: 'Action', icon: 'signal', run: () => act('Failure spike', () => api.spike()) },
      { id: 'a-resolve', label: 'Resolve outcomes', group: 'Action', icon: 'lab', run: () => act('Resolve outcomes', () => api.labResolve()) },
    ];
    return [...go, ...actions];
  }, [nav, bump, toast]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands;
    // subsequence match on the label, plus substring on the hint
    const sub = (t: string) => {
      let i = 0;
      for (const ch of t.toLowerCase()) if (i < s.length && ch === s[i]) i++;
      return i === s.length;
    };
    return commands.filter((c) => sub(c.label) || (c.hint?.toLowerCase().includes(s) ?? false));
  }, [q, commands]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      const t = window.setTimeout(() => inputRef.current?.focus(), 20);
      return () => window.clearTimeout(t);
    }
  }, [open]);
  useEffect(() => setSel(0), [q]);

  if (!open) return null;

  const exec = (c: Cmd) => {
    setOpen(false);
    void c.run();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = filtered[sel];
      if (c) exec(c);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/30 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-100 px-4">
          <Icon name="search" className="h-4 w-4 text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages and actions…"
            className="h-12 flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
          />
          <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-slate-400">No matches</div>
          ) : (
            filtered.map((c, i) => (
              <button
                key={c.id}
                onClick={() => exec(c)}
                onMouseEnter={() => setSel(i)}
                className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left', i === sel ? 'bg-slate-100' : 'hover:bg-slate-50')}
              >
                <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-lg', c.group === 'Action' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600')}>
                  <Icon name={c.icon} className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800">{c.label}</span>
                  {c.hint && <span className="block truncate text-[11px] text-slate-400">{c.hint}</span>}
                </span>
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-300">{c.group}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
