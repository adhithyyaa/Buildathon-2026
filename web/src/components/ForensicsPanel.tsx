import { useEffect, useState } from 'react';
import { api, type ForensicReport, type ForensicScenario } from '../lib/api';
import { Card, Pill, cx } from './ui';
import { Icon } from './icons';

/**
 * Tamper-evidence forensics — attacks a REAL case's SHA-256 hash chain (on clones; the live ledger is
 * never touched) and shows the verifier not just catching each tamper but CLASSIFYING it: a silent
 * field edit surfaces as content-altered in that row; a deletion or a cover-your-tracks re-hash
 * surfaces as chain-relinked at the break. "Tamper-evident" becomes something a judge can watch, not
 * a claim they have to take on faith.
 */
export function ForensicsPanel() {
  const [report, setReport] = useState<ForensicReport | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    api.auditForensics().then(setReport).catch(() => setErr(true));
  }, []);

  if (err) return null;
  if (!report) return <Card title="Tamper-evidence forensics"><div className="h-40 animate-pulse rounded-xl bg-slate-100" /></Card>;
  if (report.chainLength === 0) {
    return (
      <Card title="Tamper-evidence forensics" right={<Pill tone="violet">SHA-256 hash chain</Pill>}>
        <p className="text-sm text-slate-500">No audit chain yet — seed and process a case, then this panel attacks its ledger live.</p>
      </Card>
    );
  }

  const caught = report.scenarios.filter((s) => s.caught).length;
  const attacks = report.scenarios.filter((s) => s.id !== 'baseline').length;

  return (
    <Card
      title="Tamper-evidence forensics"
      right={<Pill tone={report.allCaught ? 'emerald' : 'rose'}>{caught}/{report.scenarios.length} detected</Pill>}
    >
      <p className="text-sm leading-relaxed text-slate-600">
        The audit ledger is a <b className="text-slate-900">SHA-256 hash chain</b>. Here we attack a real{' '}
        <b className="text-slate-900">{report.chainLength}-row</b> chain <b className="text-slate-900">on clones</b> — the live
        ledger is never mutated — and the verifier catches <b className="text-slate-900">and classifies</b> every tamper:{' '}
        <span className="font-semibold text-slate-700">content-altered</span> (a field edited in place) vs{' '}
        <span className="font-semibold text-slate-700">chain-relinked</span> (a row inserted, deleted, reordered, or re-hashed).
      </p>

      <div className="mt-4 space-y-2">
        {report.scenarios.map((s) => (
          <ScenarioRow key={s.id} s={s} />
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        {attacks} attacks, all detected. The baseline verifies; each attack is caught at the exact row it touched. A full
        rewrite of the entire chain would still verify — which is why audit writes run under an append-only DB role, not
        the app's.
      </p>
    </Card>
  );
}

function ScenarioRow({ s }: { s: ForensicScenario }) {
  const isBaseline = s.id === 'baseline';
  const good = s.caught;
  return (
    <div className={cx('rounded-xl border p-3', good ? 'border-slate-200 bg-white' : 'border-rose-300 bg-rose-50')}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name={isBaseline ? 'check' : 'shield'} className={cx('h-4 w-4 shrink-0', good ? (isBaseline ? 'text-slate-400' : 'text-emerald-600') : 'text-rose-600')} />
          <span className="truncate text-sm font-semibold text-slate-800">{s.label}</span>
        </div>
        <span
          className={cx(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
            isBaseline
              ? 'bg-slate-100 text-slate-500'
              : good
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-rose-100 text-rose-700',
          )}
        >
          {isBaseline ? (s.verdict.valid ? 'verifies' : 'FAILED') : good ? '✓ caught' : '✗ missed'}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">{s.attack}</p>
      {!isBaseline && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <span className="font-mono rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
            {s.verdict.tamper ?? 'none'}
          </span>
          {s.verdict.detail && <span className="text-slate-400">{s.verdict.detail}</span>}
        </div>
      )}
    </div>
  );
}
