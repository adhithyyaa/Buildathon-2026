import { useEffect, useRef, useState } from 'react';
import { getAdminToken, setAdminToken } from '../lib/api';
import { useToast } from '../lib/toast';
import { Icon } from './icons';
import { cx } from './ui';

/** Sets the operator token used for guarded write actions (pause, demo, approve). Stored locally. */
export function TokenControl() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHasToken(!!getAdminToken());
  }, []);

  useEffect(() => {
    if (!open) return;
    setValue(getAdminToken());
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const save = () => {
    setAdminToken(value.trim());
    setHasToken(!!value.trim());
    setOpen(false);
    toast(value.trim() ? 'Operator token saved' : 'Operator token cleared', 'success');
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Operator token for guarded actions"
        className={cx(
          'inline-flex items-center justify-center rounded-lg border p-1.5 transition-colors',
          hasToken ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:text-slate-200',
        )}
      >
        <Icon name="shield" className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-slate-700/80 bg-slate-900 p-3 shadow-2xl shadow-black/40">
          <div className="text-xs font-semibold text-slate-200">Operator token</div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
            Needed only if the server has <span className="font-mono">RECOUP_ADMIN_TOKEN</span> set. Sent as a bearer token
            on guarded actions. Stored in this browser only.
          </p>
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="paste token…"
            className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1.5 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-700"
          />
          <div className="mt-2 flex items-center gap-2">
            <button onClick={save} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-emerald-950 hover:bg-emerald-400">Save</button>
            <button
              onClick={() => {
                setValue('');
                setAdminToken('');
                setHasToken(false);
                toast('Operator token cleared', 'success');
                setOpen(false);
              }}
              className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
