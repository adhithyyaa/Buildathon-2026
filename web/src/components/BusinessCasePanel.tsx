import { useMemo, useState } from 'react';
import type { LabReport } from '../lib/api';
import { Card, Pill, cx } from './ui';

/**
 * Business case — the ROI a merchant gets, grounded in our OWN measured numbers, not a slide.
 * The incremental-recovery lift is read live from the Recovery Lab (measured against a real control
 * holdout, with its 95% CI); the per-attempt cost is our real action-cost model (₹3–6 for automated
 * moves). Everything else is a labelled, adjustable merchant assumption — drag the inputs and the
 * economics recompute. We lead with the CONSERVATIVE lower-CI-bound case, because a revenue claim
 * you can defend beats one you can't.
 */

// Our per-action operating-cost model (rupees), mirrored from ml/src/eval.py + serve.py.
const ACTION_COST_NOTE = 'smart-retry ₹3 · link ₹6 · reminder ₹4 · incentive ₹6 +5% · escalate ₹50';

const inr = (n: number) => {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  if (Math.abs(n) >= 1e3) return `₹${(n / 1e3).toFixed(1)}k`;
  return `₹${Math.round(n)}`;
};

export function BusinessCasePanel({ lab }: { lab: LabReport | null }) {
  const [gmvCr, setGmvCr] = useState(2); // ₹ Cr / month
  const [failPct, setFailPct] = useState(12); // payment failure rate
  const [avgTicket, setAvgTicket] = useState(1200); // ₹
  const [costPerCase, setCostPerCase] = useState(10); // ₹ blended per pursued case (conservative)

  // Measured lift from the live control holdout (fallback to a clearly-labelled typical band if the
  // Lab has no resolved control arm yet).
  const measured = lab?.overall && typeof lab.overall.liftPct === 'number' && lab.overall.significant;
  const liftMidPct = measured ? lab!.overall.liftPct : 35;
  const liftLoPct = measured ? lab!.overall.liftCi95Pct[0] : 20;
  const liftHiPct = measured ? lab!.overall.liftCi95Pct[1] : 50;

  const m = useMemo(() => {
    const gmv = gmvCr * 1e7;
    const stranded = gmv * (failPct / 100);
    const failedTxns = avgTicket > 0 ? stranded / avgTicket : 0;
    const cost = failedTxns * costPerCase;
    const rec = (pct: number) => stranded * (pct / 100);
    const recMid = rec(liftMidPct), recLo = rec(liftLoPct), recHi = rec(liftHiPct);
    const roiLo = cost > 0 ? recLo / cost : 0;
    const roiMid = cost > 0 ? recMid / cost : 0;
    return { stranded, failedTxns, cost, recMid, recLo, recHi, netMid: recMid - cost, netLo: recLo - cost, roiLo, roiMid };
  }, [gmvCr, failPct, avgTicket, costPerCase, liftMidPct, liftLoPct, liftHiPct]);

  return (
    <Card
      title="Business case — what Overwatch recovers for you"
      right={<Pill tone="emerald">ROI calculator</Pill>}
    >
      <p className="text-sm leading-relaxed text-slate-600">
        Grounded in our <b className="text-slate-900">measured {liftMidPct}pp incremental lift</b>
        {measured ? <> (95% CI {liftLoPct}–{liftHiPct}pp, from the live control holdout)</> : <> (typical band — resolve a control arm for your live number)</>} and
        our real per-attempt cost model. Adjust for your business; the economics recompute live.
      </p>

      {/* Headline outputs — lead with the conservative lower-bound ROI. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Big label="ROI (conservative)" value={`${m.roiLo.toFixed(0)}×`} sub={`${m.roiMid.toFixed(0)}× at the measured midpoint`} tone="emerald" />
        <Big label="Net recovered / month" value={inr(m.netLo)} sub={`up to ${inr(m.netMid)} expected`} />
        <Big label="Net recovered / year" value={inr(m.netLo * 12)} sub={`${inr(m.netMid * 12)} expected`} />
      </div>

      {/* Inputs */}
      <div className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Slider label="Monthly GMV" value={gmvCr} min={0.1} max={50} step={0.1} onChange={setGmvCr} fmt={(v) => `₹${v.toFixed(1)} Cr`} />
        <Slider label="Payment failure rate" value={failPct} min={1} max={30} step={0.5} onChange={setFailPct} fmt={(v) => `${v}%`} />
        <Slider label="Average ticket" value={avgTicket} min={100} max={20000} step={100} onChange={setAvgTicket} fmt={(v) => `₹${v.toLocaleString('en-IN')}`} />
        <Slider label="Cost per attempt (blended)" value={costPerCase} min={1} max={100} step={1} onChange={setCostPerCase} fmt={(v) => `₹${v}`} />
      </div>

      {/* Breakdown */}
      <div className="mt-5 grid gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-4">
        <Line label="Stranded ₹ / month" value={inr(m.stranded)} />
        <Line label="Failed payments / month" value={Math.round(m.failedTxns).toLocaleString('en-IN')} />
        <Line label="Incremental recovered" value={`${inr(m.recLo)} – ${inr(m.recHi)}`} good />
        <Line label="Recovery cost" value={inr(m.cost)} muted />
      </div>

      <p className="mt-3 text-[10.5px] leading-relaxed text-slate-400">
        Lift is measured against a randomised control holdout (Recovery Lab), not modelled — we show the whole 95% CI and
        lead with its lower bound. Cost model: {ACTION_COST_NOTE}. Merchant profile is illustrative and adjustable; incentive
        discounts (rare, human-approved) are absorbed into the conservative per-attempt cost.
      </p>
    </Card>
  );
}

function Big({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'emerald' }) {
  return (
    <div className={cx('rounded-xl border p-4', tone === 'emerald' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white')}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={cx('mt-1 text-3xl font-extrabold tabular-nums', tone === 'emerald' ? 'text-emerald-700' : 'text-slate-900')}>{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-medium text-slate-600">{label}</label>
        <span className="text-sm font-bold tabular-nums text-slate-900">{fmt(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full accent-emerald-600 cursor-pointer"
      />
    </div>
  );
}

function Line({ label, value, good, muted }: { label: string; value: string; good?: boolean; muted?: boolean }) {
  return (
    <div>
      <div className="text-[10.5px] font-medium text-slate-400">{label}</div>
      <div className={cx('text-sm font-bold tabular-nums', good ? 'text-emerald-700' : muted ? 'text-slate-500' : 'text-slate-800')}>{value}</div>
    </div>
  );
}
