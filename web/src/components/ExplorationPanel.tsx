import { useEffect, useState } from 'react';
import { api, type ExploreReport } from '../lib/api';
import { Card, Pill, cx } from './ui';

const LABEL: Record<string, string> = {
  oracle: 'Oracle (ceiling)',
  rules_only: 'Deterministic rules',
  thompson_online: 'Thompson (online)',
  random: 'Random',
};
const ORDER = ['oracle', 'rules_only', 'thompson_online', 'random'];

/**
 * Online exploration (roadmap): a contextual Thompson sampler that learns the best action per failure
 * reason from its own experience — no pre-training, no cold-start. Honest framing: it pays an
 * exploration cost versus the deterministic policy (as it should), while converging toward the oracle.
 */
export function ExplorationPanel() {
  const [e, setE] = useState<ExploreReport | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    api.mlExplore().then(setE).catch(() => setErr(true));
  }, []);

  if (err) return null;
  if (!e) return <Card title="Online exploration"><div className="h-20 animate-pulse rounded-xl bg-slate-100" /></Card>;

  const pv = e.value_per_case_inr;
  const max = Math.max(...Object.values(pv), 1);
  const acc = e.learned_best_action_accuracy;

  return (
    <Card
      title="Online exploration — contextual Thompson sampling"
      right={<Pill tone="violet">roadmap · {e.ts_pct_of_oracle_final}% of oracle</Pill>}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Net ₹/case (learned online, no pre-training)</div>
          <div className="space-y-2">
            {ORDER.filter((k) => k in pv).map((k) => {
              const ours = k === 'thompson_online';
              return (
                <div key={k}>
                  <div className="mb-0.5 flex justify-between text-xs">
                    <span className={cx(ours ? 'font-bold text-slate-900' : 'font-medium text-slate-600')}>{LABEL[k]}</span>
                    <span className="tabular-nums font-bold text-slate-700">₹{Math.round(pv[k]!).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className={cx('h-2 rounded-full transition-all duration-500', ours ? 'bg-violet-500' : k === 'oracle' ? 'bg-violet-300' : 'bg-slate-300')}
                      style={{ width: `${Math.max(1, (pv[k]! / max) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col justify-center gap-3">
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
            <div className="text-[10px] font-medium text-slate-400">Learned best action / reason</div>
            <div className="text-lg font-extrabold tabular-nums text-slate-800">{acc.correct}/{acc.total}</div>
            <div className="text-[10.5px] text-slate-400">discovered purely from experience</div>
          </div>
          <p className="text-[10.5px] leading-relaxed text-slate-400">
            Subsumes the LinUCB approaches in the field. It pays a small exploration cost vs the deterministic policy — as a
            well-behaved bandit should — while reaching {e.ts_pct_of_oracle_final}% of the oracle from a uniform prior.
          </p>
        </div>
      </div>
    </Card>
  );
}
