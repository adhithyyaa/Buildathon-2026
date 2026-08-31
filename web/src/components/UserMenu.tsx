import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, initials } from '../lib/auth';
import { Icon } from './icons';
import { cx } from './ui';

/** Account chip in the header: avatar + name, with a popover for the signed-in identity and sign-out. */
export function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const avatar = user.picture ? (
    <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-full object-cover" />
  ) : (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">
      {initials(user)}
    </span>
  );

  const doSignOut = () => {
    setOpen(false);
    signOut();
    nav('/login', { replace: true });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={`${user.name} · ${user.email}`}
        className={cx(
          'inline-flex items-center gap-2 rounded-xl border px-1.5 py-1 text-xs font-semibold transition-colors cursor-pointer',
          open ? 'border-slate-300 bg-slate-50' : 'border-slate-200 bg-white hover:bg-slate-50',
        )}
      >
        {avatar}
        <span className="hidden max-w-[8rem] truncate text-slate-700 sm:block">{user.name}</span>
        <Icon name="chevron" className={cx('hidden h-3.5 w-3.5 text-slate-400 transition-transform sm:block', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5">
          <div className="flex items-center gap-3 border-b border-slate-100 p-3">
            {avatar}
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">{user.name}</div>
              <div className="truncate text-xs text-slate-500">{user.email}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium text-slate-400">
            <span className={cx('h-1.5 w-1.5 rounded-full', user.provider === 'google' ? 'bg-emerald-500' : 'bg-slate-400')} />
            Signed in with {user.provider === 'google' ? 'Google' : 'email'}
          </div>
          <button
            onClick={doSignOut}
            className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Icon name="logout" className="h-4 w-4 text-slate-400" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
