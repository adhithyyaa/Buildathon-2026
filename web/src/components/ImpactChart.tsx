import type { ImpactSeries } from '../lib/api';
import { formatINR } from '../lib/format';

/** Compact ₹ for axis ticks: ₹2.3L / ₹1.2Cr. */
function inrShort(paise: number): string {
  const r = paise / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(1)}Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(1)}L`;
  if (r >= 1e3) return `₹${Math.round(r / 1e3)}k`;
  return `₹${Math.round(r)}`;
}

const M = { top: 16, right: 118, bottom: 30, left: 62 };
const W = 760;
const H = 264;

/**
 * The flagship counterfactual chart: cumulative recovered-₹ (solid) vs the dotted "without
 * Recoup" baseline — the control arm's MEASURED ₹-weighted recovery rate applied to the same
 * failures. Competitors estimate this line; the Recovery Lab's randomized holdout measures it.
 */
export function ImpactChart({ data }: { data: ImpactSeries }) {
  const { series, events } = data;
  if (series.length < 2) return null;

  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const t0 = new Date(series[0].t).getTime();
  const t1 = new Date(series[series.length - 1].t).getTime();
  const yMax = Math.max(series[series.length - 1].actualPaise, series[series.length - 1].baselinePaise, 1) * 1.08;

  const x = (i: number) => M.left + (i / (series.length - 1)) * innerW;
  const xt = (iso: string) => {
    const t = new Date(iso).getTime();
    const f = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1;
    return M.left + f * innerW;
  };
  const y = (v: number) => M.top + innerH - (v / yMax) * innerH;

  const line = (pick: (p: (typeof series)[number]) => number) =>
    series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(pick(p)).toFixed(1)}`).join(' ');
  const actualPath = line((p) => p.actualPaise);
  const baselinePath = line((p) => p.baselinePaise);
  const areaPath = `${actualPath} L${x(series.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;

  const last = series[series.length - 1];
  const gap = last.actualPaise - last.baselinePaise;

  // 4 x-axis date ticks + 3 y ticks.
  const xTicks = [0, Math.floor((series.length - 1) / 3), Math.floor(((series.length - 1) * 2) / 3), series.length - 1];
  const yTicks = [yMax * 0.33, yMax * 0.66, yMax].map((v) => Math.round(v));
  const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[560px] w-full" role="img" aria-label="Cumulative recovered rupees versus the control-measured baseline">
        {/* gridlines + y labels */}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2 4" />
            <text x={M.left - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="#94a3b8" fontWeight="600">{inrShort(v)}</text>
          </g>
        ))}
        <line x1={M.left} x2={W - M.right} y1={y(0)} y2={y(0)} stroke="#cbd5e1" strokeWidth="1" />

        {/* x date ticks */}
        {xTicks.map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#94a3b8" fontWeight="600">{dateLabel(series[i].t)}</text>
        ))}

        {/* event annotations */}
        {events.map((e, idx) => {
          const ex = xt(e.t);
          const incident = e.type === 'incident';
          return (
            <g key={`${e.t}-${idx}`}>
              <line x1={ex} x2={ex} y1={M.top} y2={y(0)} stroke={incident ? '#f59e0b' : '#8b5cf6'} strokeWidth="1" strokeDasharray="3 3" opacity="0.65" />
              <circle cx={ex} cy={M.top + 4} r="3.5" fill={incident ? '#f59e0b' : '#8b5cf6'}>
                <title>{e.label}</title>
              </circle>
            </g>
          );
        })}

        {/* baseline (dotted, measured from the control arm) */}
        <path d={baselinePath} fill="none" stroke="#64748b" strokeWidth="2" strokeDasharray="5 5" strokeLinecap="round" />
        {/* actual recovered (area + line) */}
        <path d={areaPath} fill="#10b981" opacity="0.07" />
        <path d={actualPath} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* right-edge gap bracket */}
        <g>
          <line x1={x(series.length - 1) + 7} x2={x(series.length - 1) + 7} y1={y(last.actualPaise)} y2={y(last.baselinePaise)} stroke="#0f172a" strokeWidth="1.5" />
          <line x1={x(series.length - 1) + 3} x2={x(series.length - 1) + 7} y1={y(last.actualPaise)} y2={y(last.actualPaise)} stroke="#0f172a" strokeWidth="1.5" />
          <line x1={x(series.length - 1) + 3} x2={x(series.length - 1) + 7} y1={y(last.baselinePaise)} y2={y(last.baselinePaise)} stroke="#0f172a" strokeWidth="1.5" />
          <text x={x(series.length - 1) + 12} y={(y(last.actualPaise) + y(last.baselinePaise)) / 2 - 2} fontSize="12" fontWeight="800" fill="#0f172a">
            {gap >= 0 ? '+' : '−'}{formatINR(Math.abs(gap))}
          </text>
          <text x={x(series.length - 1) + 12} y={(y(last.actualPaise) + y(last.baselinePaise)) / 2 + 12} fontSize="9.5" fontWeight="600" fill="#64748b">
            banked vs baseline
          </text>
        </g>

        {/* end-point dots */}
        <circle cx={x(series.length - 1)} cy={y(last.actualPaise)} r="4" fill="#10b981" stroke="#fff" strokeWidth="1.5" />
        <circle cx={x(series.length - 1)} cy={y(last.baselinePaise)} r="3.5" fill="#64748b" stroke="#fff" strokeWidth="1.5" />
      </svg>
    </div>
  );
}
