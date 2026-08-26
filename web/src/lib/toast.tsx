import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../components/icons';
import { cx } from '../components/ui';

export type ToastTone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastCtx = createContext<{ toast: (message: string, tone?: ToastTone) => void }>({ toast: () => {} });

const TONE: Record<ToastTone, { ring: string; icon: string; iconColor: string }> = {
  success: { ring: 'ring-emerald-500/30', icon: 'check', iconColor: 'text-emerald-300' },
  error: { ring: 'ring-rose-500/30', icon: 'power', iconColor: 'text-rose-300' },
  info: { ring: 'ring-slate-600/50', icon: 'spark', iconColor: 'text-sky-300' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = ++idRef.current;
      setToasts((t) => [...t, { id, message, tone }]);
      setTimeout(() => dismiss(id), 3800);
    },
    [dismiss],
  );

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => {
          const tone = TONE[t.tone];
          return (
            <button
              key={t.id}
              onClick={() => dismiss(t.id)}
              className={cx(
                'animate-rise pointer-events-auto flex items-start gap-2.5 rounded-xl border border-slate-700/60 bg-slate-900/95 px-3.5 py-2.5 text-left shadow-2xl shadow-black/40 ring-1 ring-inset backdrop-blur',
                tone.ring,
              )}
            >
              <span className={cx('mt-0.5 shrink-0', tone.iconColor)}>
                <Icon name={tone.icon} className="h-4 w-4" />
              </span>
              <span className="text-sm text-slate-200">{t.message}</span>
            </button>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
