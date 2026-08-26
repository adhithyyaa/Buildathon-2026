import { useCallback, useEffect, useState } from 'react';
import { api, type CaseRow } from '../lib/api';
import { useRefresh } from '../lib/refresh';
import { Card, Button, cx } from '../components/ui';
import { Icon } from '../components/icons';
import { CaseTable } from '../components/CaseTable';

const FILTERS: Array<{ key: string; label: string }> = [
  { key: '', label: 'All' },
  { key: 'at_risk', label: 'At risk' },
  { key: 'waiting_for_outcome', label: 'Waiting' },
  { key: 'manual_escalation', label: 'Escalated' },
  { key: 'recovered', label: 'Recovered' },
  { key: 'expired', label: 'Expired' },
];

export function QueuePage() {
  const { version, poll } = useRefresh();
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const loaded = cases ?? [];
  const q = search.trim().toLowerCase();
  const shown = q
    ? loaded.filter((c) => [c.merchant.name, c.customer?.name, c.reasonTag, c.id, c.outcome?.notes].some((f) => f?.toLowerCase().includes(q)))
    : loaded;

  return (
    <Card
      title="Recovery queue"
      right={
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cx(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                filter === f.key ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      }
    >
      {error ? (
        <div className="px-2 py-8 text-center text-sm text-rose-400">
          Couldn’t reach the API. Is the server running on :8787?
          <div className="mt-2"><Button onClick={load}>Retry</Button></div>
        </div>
      ) : loading && !cases ? (
        <Skeleton rows={8} />
      ) : (
        <div>
          <div className="mb-3 flex items-center gap-3">
            <div className="relative w-full max-w-sm">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600">
                <Icon name="search" className="h-4 w-4" />
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search cases, merchant, or pay_ id…"
                className="w-full rounded-lg border border-slate-800 bg-slate-950/50 py-1.5 pl-8 pr-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-700"
              />
            </div>
            {loaded.length > 0 && <span className="whitespace-nowrap text-xs tabular-nums text-slate-500">{shown.length} of {loaded.length}</span>}
          </div>
          <div className="-mx-5 -mb-5">
            <CaseTable cases={shown} />
          </div>
        </div>
      )}
    </Card>
  );
}

function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-6 animate-pulse rounded bg-slate-800/60" />
      ))}
    </div>
  );
}
