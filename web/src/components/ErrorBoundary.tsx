import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * Last line of defence for the operator console: if any panel throws during render, show a calm,
 * on-brand recovery card instead of a blank white screen — the difference between a hiccup and a
 * dead demo. Errors are still logged so they can be chased down.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[overwatch] render error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-[60vh] place-items-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-rose-50 text-rose-600 ring-4 ring-rose-100">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 8v5m0 4h.01" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-900">This panel hit a snag</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            The rest of Overwatch is unaffected — reload to recover this view. The error has been logged.
          </p>
          <details className="mt-3 text-left text-xs text-slate-400">
            <summary className="cursor-pointer select-none font-medium text-slate-500">Details</summary>
            <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-slate-50 p-2 font-mono text-[11px] text-slate-600">{this.state.error.message}</pre>
          </details>
          <div className="mt-5 flex justify-center gap-2">
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
