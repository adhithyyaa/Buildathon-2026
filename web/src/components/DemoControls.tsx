import { useState } from 'react';
import { api } from '../lib/api';
import { Button, Card } from './ui';

/** The one-click demo panel: seed → run pipeline → advance retries → reset. */
export function DemoControls({ onChanged }: { onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>('');

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setMsg('');
    try {
      const r = await fn();
      setMsg(summarize(label, r));
      onChanged();
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      title="Demo controls"
      right={msg ? <span className="max-w-[320px] truncate text-xs text-slate-500">{msg}</span> : null}
    >
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run('seed', () => api.seed(120))} disabled={!!busy}>
          {busy === 'seed' ? 'Seeding…' : 'Seed 120 cases'}
        </Button>
        <Button variant="primary" onClick={() => run('process', () => api.process())} disabled={!!busy}>
          {busy === 'process' ? 'Processing…' : 'Run pipeline'}
        </Button>
        <Button onClick={() => run('tick', () => api.tick())} disabled={!!busy}>
          {busy === 'tick' ? 'Advancing…' : 'Advance retries'}
        </Button>
        <Button variant="primary" onClick={() => run('resolve', () => api.labResolve())} disabled={!!busy}>
          {busy === 'resolve' ? 'Resolving…' : 'Resolve outcomes'}
        </Button>
        <Button variant="danger" onClick={() => run('reset', () => api.reset())} disabled={!!busy}>
          Reset
        </Button>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Seed loads a reproducible synthetic batch. Run pipeline scores, decides and executes every at-risk case (a 20%
        control arm is held out with no action). Resolve outcomes draws each case's result from the independent world so
        the Recovery Lab can measure treatment vs. control — the incremental ₹, not gross.
      </p>
    </Card>
  );
}

function summarize(label: string, r: unknown): string {
  const o = r as Record<string, number>;
  if (label === 'seed') return `Seeded: ${o.created} new, ${o.deduped} duplicate`;
  if (label === 'process') return `Processed ${o.processed} cases`;
  if (label === 'tick') return `Recovered ${o.recovered}, re-queued ${o.reQueued}, expired ${o.expired}`;
  if (label === 'resolve') return `Resolved ${o.resolved}: ${o.recovered} recovered, ${o.expired} expired`;
  if (label === 'reset') return 'All data cleared';
  return '';
}
