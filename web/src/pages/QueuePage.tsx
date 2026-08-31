import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type CaseRow } from '../lib/api';
import { useRefresh } from '../lib/refresh';
import { Button, cx } from '../components/ui';
import { Icon } from '../components/icons';
import { CaseTable } from '../components/CaseTable';
import { titleCase } from '../lib/format';

const FILTERS: Array<{ key: string; label: string }> = [
  { key: '', label: 'All' },
  { key: 'at_risk', label: 'At risk' },
  { key: 'waiting_for_outcome', label: 'Waiting' },
  { key: 'manual_escalation', label: 'Escalated' },
  { key: 'recovered', label: 'Recovered' },
  { key: 'expired', label: 'Expired' },
];

/** Build a CSV of the shown cases and hand it to the browser as a download. */
function exportCsv(rows: CaseRow[]) {
  const headers = ['id', 'merchant', 'customer', 'reason', 'state', 'method', 'amount_paise', 'recovered_paise', 'created_at'];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(','),
    ...rows.map((c) => [c.id, c.merchant.name, c.customer?.name ?? '', c.reasonTag ?? '', c.state, c.event.method ?? '', c.amount, c.outcome?.recoveredAmount ?? '', c.createdAt].map(esc).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sentinel-cases-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function QueuePage() {
  const { version, poll } = useRefresh();
  const [sp, setSp] = useSearchParams();
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  // Initialize filters from the URL so drill-downs from the Overview land pre-filtered.
  const [filter, setFilter] = useState(() => sp.get('state') ?? '');
  const [reason, setReason] = useState(() => sp.get('reason') ?? '');
  const [search, setSearch] = useState(() => sp.get('q') ?? '');
  const [showFilter, setShowFilter] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const c = await api.cases({ state: filter || undefined, limit: 200 });
      setCases(c.cases);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load, version, poll]);

  // Keep the URL in sync so the filtered view is shareable / bookmarkable.
  useEffect(() => {
    const next: Record<string, string> = {};
    if (filter) next.state = filter;
    if (reason) next.reason = reason;
    if (search.trim()) next.q = search.trim();
    setSp(next, { replace: true });
  }, [filter, reason, search, setSp]);

  useEffect(() => {
    if (!showFilter) return;
    const onDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showFilter]);

  const loaded = cases ?? [];
  const q = search.trim().toLowerCase();
  const shown = loaded.filter((c) => {
    if (reason && (c.reasonTag ?? '') !== reason) return false;
    if (q && ![c.merchant.name, c.customer?.name, c.reasonTag, c.id, c.outcome?.notes].some((f) => f?.toLowerCase().includes(q))) return false;
    return true;
  });
  const activeFilter = FILTERS.find((f) => f.key === filter)?.label ?? 'All';

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center text-sm text-rose-600 shadow-xs">
        Couldn’t reach the API. Is the server running on :8787?
        <div className="mt-3"><Button onClick={load}>Retry</Button></div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
        <div>
          <h2 className="text-base font-bold text-slate-900">Recovery queue</h2>
          {loaded.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              {shown.length} of {loaded.length} cases · {activeFilter}
              {reason && (
                <button
                  onClick={() => setReason('')}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200/60 hover:bg-emerald-100"
                >
                  reason: {titleCase(reason)} ✕
                </button>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Icon name="search" className="h-3.5 w-3.5" />
            </span>
            <input
              id="table-search-input"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search cases, merchant, or pay_ id…"
              className="h-9 w-52 sm:w-64 rounded-xl border border-slate-200 bg-slate-50/50 pl-8 pr-3 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none shadow-2xs"
            />
          </div>

          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilter((o) => !o)}
              className={cx(
                'inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold shadow-2xs transition-colors cursor-pointer',
                filter ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              <Icon name="filter" className="h-3.5 w-3.5" />
              {filter ? activeFilter : 'Filter'}
            </button>
            {showFilter && (
              <div className="absolute right-0 z-30 mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => {
                      setFilter(f.key);
                      setShowFilter(false);
                    }}
                    className={cx(
                      'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer',
                      filter === f.key ? 'bg-slate-100 font-bold text-slate-900' : 'text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    <span>{f.label}</span>
                    {filter === f.key && <Icon name="check" className="h-3 w-3 text-slate-900" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => exportCsv(shown)}
            disabled={shown.length === 0}
            title="Export the shown cases as CSV"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            <Icon name="external" className="h-3.5 w-3.5" />
            CSV
          </button>
        </div>
      </div>

      {loading && !cases ? <Skeleton rows={8} /> : <CaseTable cases={shown} />}
    </div>
  );
}

function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-xl bg-slate-100" />
      ))}
    </div>
  );
}
