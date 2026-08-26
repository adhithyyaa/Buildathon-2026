import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type RoundtripCapture } from '../lib/api';
import { formatINR, titleCase } from '../lib/format';
import { useRefresh } from '../lib/refresh';
import { Card, Pill, cx } from '../components/ui';
import { Icon } from '../components/icons';

export function EvidencePage() {
  const { version, poll } = useRefresh();
  const [captures, setCaptures] = useState<RoundtripCapture[] | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    api.evidence().then((r) => setCaptures(r.captures)).catch(() => setErr(true));
  }, [version, poll]);

  return (
    <div className="space-y-6">
      {/* What this proves */}
      <Card title="Real Razorpay round-trip" right={<Pill tone="emerald">test-mode · verified</Pill>}>
        <p className="text-sm leading-relaxed text-slate-600">
          Beyond the signed self-test, these are <b className="text-slate-900">real Razorpay test-mode payments</b>. Each order
          was created via the Razorpay API and paid through Razorpay’s <b className="text-slate-900">hosted Checkout + 3DS</b>{' '}
          with a domestic card, then <b className="text-slate-900">captured</b> — confirmed by fetching the payment back from the
          Razorpay API. A signed <span className="font-mono text-slate-800 bg-slate-100 px-1 py-0.5 rounded">payment.captured</span> webhook then recovered the
          case through the exact production path.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Step icon="link" label="HMAC-verified webhook" />
          <Step icon="check" label="Exactly-once recovery" />
          <Step icon="receipt" label="Captured on Razorpay" />
          <Step icon="refresh" label="Replayable without keys" />
        </div>
      </Card>

      {/* The captures */}
      {err ? (
        <Card title="Captures"><p className="text-sm text-rose-600">Couldn’t load the evidence fixture.</p></Card>
      ) : !captures ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-56 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-56 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      ) : captures.length === 0 ? (
        <Card title="Captures"><p className="text-sm text-slate-400 py-4">No committed captures found.</p></Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {captures.map((c) => (
            <CaptureCard key={c.paymentId} c={c} />
          ))}
        </div>
      )}

      {/* Reproduce it */}
      <Card title="Reproduce it — no keys required">
        <p className="text-sm text-slate-600">
          The captured payment is committed as a fixture, so anyone can re-prove the round-trip against a local server:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-slate-900 p-4 text-xs font-mono leading-relaxed text-slate-200 shadow-2xs">
{`# terminal A
cd server && RAZORPAY_WEBHOOK_SECRET=whsec_local_selftest npm run dev
# terminal B
cd server && RAZORPAY_WEBHOOK_SECRET=whsec_local_selftest npm run replay:roundtrip   # → "✅ REPLAYED …"`}
        </pre>
        <p className="mt-2 text-xs text-slate-400">Full write-up in <span className="font-mono text-slate-600 font-semibold">docs/WEBHOOKS.md</span>.</p>
      </Card>
    </div>
  );
}

function CaptureCard({ c }: { c: RoundtripCapture }) {
  const captured = c.captured && c.status === 'captured';
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <span className="text-xs font-bold text-slate-400">Razorpay · test mode</span>
        <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', captured ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/80' : 'bg-slate-100 text-slate-700 ring-slate-200')}>
          <Icon name="check" className="h-3 w-3" /> {captured ? 'Captured' : titleCase(c.status)}
        </span>
      </div>
      <div className="px-5 py-4">
        <div className="text-3xl font-black tabular-nums text-slate-900">{formatINR(c.amount, 2)}</div>
        <div className="mt-0.5 text-xs text-slate-400 font-medium">{titleCase(c.method)} · {c.currency}</div>

        <dl className="mt-4 space-y-2 text-xs">
          <Row k="Payment ID" v={c.paymentId} mono />
          <Row k="Order ID" v={c.orderId} mono />
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          {c.recoveredCase ? (
            <Link to={`/cases/${c.recoveredCase.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200/60 hover:bg-emerald-100 transition-colors">
              <Icon name="arrow" className="h-3.5 w-3.5" /> Recovered invoice · {c.recoveredCase.merchant}
            </Link>
          ) : (
            <span className="text-xs text-slate-400">No linked invoice in this dataset</span>
          )}
          <a
            href={`https://dashboard.razorpay.com/app/payments/${c.paymentId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
          >
            Verify on Razorpay <Icon name="external" className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-400 font-medium">{k}</dt>
      <dd className={cx('truncate text-slate-800 font-semibold', mono && 'font-mono text-xs')}>{v}</dd>
    </div>
  );
}

function Step({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200/80 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs">
      <Icon name={icon} className="h-3.5 w-3.5 text-emerald-600" />
      {label}
    </span>
  );
}
