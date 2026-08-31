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
          'grid h-9 w-9 place-items-center rounded-xl border transition-colors cursor-pointer',
          hasToken
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
        )}
      >
        <Icon name="shield" className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
          <div className="text-xs font-bold text-slate-900">Operator token</div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500 font-medium">
            Needed only if the server has <span className="font-mono text-slate-800 font-bold">OVERWATCH_ADMIN_TOKEN</span> set. Sent as a bearer token
            on guarded actions. Stored in this browser only.
          </p>
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="paste token…"
            className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-1.5 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none shadow-2xs"
          />
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={save}
              className="rounded-xl bg-slate-950 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer transition-colors shadow-2xs"
            >
              Save
            </button>
            <button
              onClick={() => {
                setValue('');
                setAdminToken('');
                setHasToken(false);
                toast('Operator token cleared', 'success');
                setOpen(false);
              }}
              className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 cursor-pointer transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
