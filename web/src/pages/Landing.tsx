import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Icon } from '../components/icons';
import { api } from '../lib/api';
import { formatINR } from '../lib/format';

/**
 * The proof numbers on this page read from the LIVE Recovery Lab when it has a resolved control arm,
 * so the marketing claim and the dashboard never disagree. Until the lab has data they fall back to a
 * clearly-labelled illustrative set — never a stale number presented as live.
 */
interface LiveProof {
  live: boolean;
  liftPct: number;
  incrementalPaise: number;
  treatPct: number;
  controlPct: number;
  significant: boolean;
  recoveredPaise: number;
  recoveredCount: number;
  totalCases: number;
}
const ILLUSTRATIVE: LiveProof = { live: false, liftPct: 40.2, incrementalPaise: 31377300, treatPct: 59, controlPct: 19, significant: true, recoveredPaise: 35847000, recoveredCount: 65, totalCases: 121 };

function useLiveProof(): LiveProof {
  const [proof, setProof] = useState<LiveProof>(ILLUSTRATIVE);
  useEffect(() => {
    Promise.all([api.lab(), api.metrics()])
      .then(([lab, m]) => {
        const o = lab.overall;
        if (lab.totalResolved > 0 && o.control.cases > 0) {
          setProof({
            live: true,
            liftPct: o.liftPct,
            incrementalPaise: o.incrementalPaise,
            treatPct: Math.round(o.treatment.recoveryRatePct ?? 0),
            controlPct: Math.round(o.control.recoveryRatePct ?? 0),
            significant: o.significant,
            recoveredPaise: m.recoveredPaise,
            recoveredCount: m.recoveredCount,
            totalCases: m.totalCases,
          });
        }
      })
      .catch(() => {});
  }, []);
  return proof;
}

/**
 * Marketing landing for Overwatch — the revenue-integrity layer that plugs under Razorpay.
 * Identity: warm paper + ink text + a single emerald signal; Fraunces (serif display), Hanken Grotesk
 * (UI), JetBrains Mono (data/proof). Light throughout, matching the app chrome; no gradients-as-crutch.
 */
export function Landing() {
  const proof = useLiveProof();
  return (
    <div className="min-h-screen bg-paper font-grotesk text-ink antialiased">
      <AnnounceBar />
      <TopNav />
      <Hero proof={proof} />
      <TrustStrip />
      <Stats proof={proof} />
      <Problem />
      <Features />
      <HowItWorks />
      <Differentiator proof={proof} />
      <FinalCTA />
      <Footer />
    </div>
  );
}

const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2';

function AnnounceBar() {
  return (
    <Link to="/app" className="block border-b border-emerald-100 bg-emerald-50 text-center text-[12px] text-emerald-800 transition-colors hover:bg-emerald-100/70">
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-5 py-2 font-mono">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Attack our compliance guardrails live in the demo
        <Icon name="arrow" className="h-3.5 w-3.5 text-emerald-600" />
      </div>
    </Link>
  );
}

function TopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo className="h-8 w-8" />
          <span className="text-[17px] font-bold tracking-tight text-ink">Overwatch</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
          <a href="#features" className="transition-colors hover:text-ink">Product</a>
          <a href="#how" className="transition-colors hover:text-ink">How it works</a>
          <a href="#proof" className="transition-colors hover:text-ink">Recovery Lab</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login" className="rounded-lg px-3.5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100">Sign in</Link>
          <Link to="/login" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500">Get started</Link>
        </div>
      </div>
    </header>
  );
}

function Hero({ proof }: { proof: LiveProof }) {
  return (
    <section
      className="relative overflow-hidden border-b border-slate-200/70 bg-paper text-ink"
      style={{
        backgroundImage:
          'radial-gradient(680px 320px at 80% -8%, rgba(16,185,129,0.12), transparent 70%), linear-gradient(rgba(15,23,42,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.035) 1px, transparent 1px)',
        backgroundSize: 'auto, 46px 46px, 46px 46px',
      }}
    >
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:px-8 lg:py-28">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Revenue-integrity layer · Razorpay
          </span>
          <h1 className="mt-6 font-display text-[2.7rem] font-semibold leading-[1.03] tracking-[-0.02em] text-ink sm:text-6xl">
            Recover the revenue<br />you already <span className="text-emerald-600">earned.</span>
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-slate-600">
            Overwatch catches failed payments, decides the safest recovery move, and proves — against a
            live control holdout, with a signed webhook — exactly how many{' '}
            <span className="font-semibold text-ink">incremental rupees</span> it brought back. Measured, not estimated.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link to="/login" className={btnPrimary}>
              Start recovering <Icon name="arrow" className="h-4 w-4" />
            </Link>
            <Link to="/app" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50">
              <Icon name="play" className="h-3.5 w-3.5 text-emerald-600" /> See the live demo
            </Link>
          </div>
          <p className="mt-5 font-mono text-[11px] tracking-wide text-slate-500">
            Razorpay test-mode · no card required · set up in minutes
          </p>
        </div>
        <HeroVisual proof={proof} />
      </div>
    </section>
  );
}

function HeroVisual({ proof }: { proof: LiveProof }) {
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-ink shadow-xl shadow-slate-900/10">
        <div className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
          <span className="ml-3 font-mono text-[11px] text-slate-400">app.overwatch.ai / overview</span>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200/80 bg-white p-4">
              <div className="text-[11px] font-medium text-slate-500">Recovered{proof.live ? '' : ' · illustrative'}</div>
              <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink">{formatINR(proof.recoveredPaise)}</div>
              <div className="mt-0.5 text-[11px] text-slate-400">{proof.recoveredCount} of {proof.totalCases} cases</div>
            </div>
            <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/70 p-4">
              <div className="text-[11px] font-medium text-emerald-700/80">Incremental ₹ lift</div>
              <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-emerald-700">{proof.liftPct > 0 ? '+' : ''}{proof.liftPct}pp</div>
              <div className="mt-0.5 text-[11px] text-emerald-700/70">vs control · {proof.significant ? 'significant' : 'n.s.'}</div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[11px] font-medium text-slate-500">Recovery by reason</div>
              <div className="font-mono text-[10px] font-semibold text-emerald-600">CatBoost · calibrated</div>
            </div>
            <div className="flex h-24 items-end gap-2">
              {[52, 74, 41, 88, 63, 96, 58].map((h, i) => (
                <div key={i} className="flex-1 rounded-t-sm bg-emerald-500/90" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-emerald-600"><Icon name="check" className="h-4 w-4" /></span>
              <div>
                <div className="text-xs font-semibold text-ink">Payment recovered</div>
                <div className="font-mono text-[10px] text-slate-400">pay_TTyBx4OQoIQFkj</div>
              </div>
            </div>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">signed webhook</span>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-4 -left-4 hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-xl sm:flex">
        <Logo className="h-6 w-6" />
        <span className="text-xs font-semibold text-ink">exactly-once recovery</span>
      </div>
    </div>
  );
}

function TrustStrip() {
  const chips = [
    { icon: 'shield', label: 'Policy-as-code' },
    { icon: 'link', label: 'Signed webhooks' },
    { icon: 'audit', label: 'Append-only ledger' },
    { icon: 'lab', label: 'Control holdout' },
  ];
  return (
    <section className="border-b border-slate-200/70 bg-paper">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-6 text-center lg:flex-row lg:justify-between lg:px-8 lg:text-left">
        <p className="text-sm font-medium text-slate-500">Plugs under Razorpay — the measurement &amp; governance layer they don’t publish.</p>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[11px] font-medium uppercase tracking-wider text-slate-500">
          {chips.map((c) => (
            <span key={c.label} className="flex items-center gap-1.5"><Icon name={c.icon} className="h-4 w-4 text-emerald-600" /> {c.label}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Stats({ proof }: { proof: LiveProof }) {
  const stats = [
    { v: `${proof.liftPct > 0 ? '+' : ''}${proof.liftPct}pp`, l: proof.live ? 'live incremental lift' : 'incremental lift (illustrative)', s: proof.live ? '95% bootstrap CI, vs the live control' : '95% bootstrap CI, vs control' },
    { v: '1.9%', l: 'error on a real RCT', s: 'DR-OPE vs Hillstrom ground truth' },
    { v: '~0.68', l: 'cross-world transfer AUC', s: 'frozen model, unseen world' },
    { v: '100%', l: 'exactly-once recovery', s: 'signed, idempotent webhooks' },
  ];
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 lg:px-8">
      <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.l} className="text-center lg:text-left">
            <div className="font-display text-[2.5rem] font-semibold leading-none tracking-tight text-ink tabular-nums">{s.v}</div>
            <div className="mt-2 text-sm font-semibold text-slate-800">{s.l}</div>
            <div className="mt-0.5 text-xs text-slate-500">{s.s}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Problem() {
  return (
    <section className="border-y border-slate-200/70 bg-white py-20">
      <div className="mx-auto max-w-3xl px-5 text-center lg:px-8">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-600">The problem</span>
        <h2 className="mt-4 font-display text-[2rem] font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-[2.6rem]">
          In India, a failed payment isn’t a lost customer.
        </h2>
        <p className="mt-6 text-lg leading-relaxed text-slate-600">
          A UPI collect times out. A bank has a downtime window. A card declines for a moment. The customer
          <span className="font-semibold text-ink"> wanted to pay</span> — the failure is mechanical and recoverable.
          But blind retries annoy customers and burn gateway cost, and doing nothing leaves real money on the table.
          Recovery is <span className="font-semibold text-ink">decisioning under constraints</span> — exactly what
          Overwatch automates, and proves.
        </p>
      </div>
    </section>
  );
}

const FEATURES = [
  { icon: 'bolt', title: 'ML Decisioning', body: 'CatBoost scores every case — calibrated recovery probability, the next-best action, and per-action odds. Benchmarked against XGBoost and a baseline, stated honestly.' },
  { icon: 'shield', title: 'Bounded Policy Engine', body: 'ML proposes; a deterministic policy disposes. Retry caps, quiet hours, opt-out, AFA & RBI-TAT rules — enforced in code. No model ever touches money.' },
  { icon: 'lab', title: 'Recovery Lab', body: 'A 20% no-action control holdout measures the incremental rupees you recover over doing nothing — with a 95% CI, sliced per reason. The number nobody publishes.' },
  { icon: 'link', title: 'Signed Webhooks', body: 'HMAC-verified deliveries and exactly-once recovery on the money path. A payment is only ever booked recovered on a real, signed capture.' },
  { icon: 'signal', title: 'Anomaly Detection', body: 'Isolation-forest failure-spike detection flags a live bank or UPI outage and defers retries before they add to the storm.' },
  { icon: 'audit', title: 'Tamper-evident Ledger', body: 'Every state transition is SHA-256 hash-chained and append-only at the database — so every recovery is provable, replayable, and impossible to quietly rewrite.' },
];

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-600">The platform</span>
        <h2 className="mt-4 font-display text-[2rem] font-semibold tracking-[-0.01em] text-ink sm:text-[2.6rem]">Everything the recovery engine ships</h2>
        <p className="mt-4 text-slate-600">Calibrated ML, bounded execution, and holdout-measured proof — the things a static retry toggle leaves on the table.</p>
      </div>
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="group rounded-2xl border border-slate-200/80 bg-white p-6 transition-all duration-200 hover:-translate-y-1 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-900/5">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
              <Icon name={f.icon} className="h-5 w-5" />
            </span>
            <h3 className="mt-5 text-base font-bold text-ink">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: '01', t: 'Detect', d: 'A failed payment or abandoned checkout is ingested, de-duplicated, and scored for risk and urgency — deterministically, before any model runs.' },
    { n: '02', t: 'Decide', d: 'The ML tier chooses the recovery move with the best expected value; the policy engine approves, blocks, or escalates it inside hard guardrails.' },
    { n: '03', t: 'Recover & prove', d: 'An allow-listed executor acts; a signed webhook confirms the capture; the Recovery Lab measures the incremental ₹ over the control.' },
  ];
  return (
    <section
      id="how"
      className="border-y border-slate-200/70 bg-white py-24 text-ink"
      style={{ backgroundImage: 'radial-gradient(600px 300px at 15% 0%, rgba(16,185,129,0.07), transparent 70%)' }}
    >
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-600">How it works</span>
          <h2 className="mt-4 font-display text-[2rem] font-semibold tracking-[-0.01em] text-ink sm:text-[2.6rem]">ML proposes. Deterministic code disposes.</h2>
          <p className="mt-4 text-slate-600">Every AI suggestion is policy-checked before a single rupee moves — bounded, auditable, and safe to point at production.</p>
        </div>
        <div className="mt-16 grid gap-10 lg:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="relative border-t border-slate-200 pt-6">
              <div className="font-mono text-sm font-semibold text-emerald-600">{s.n}</div>
              <h3 className="mt-3 font-display text-xl font-semibold text-ink">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Differentiator({ proof }: { proof: LiveProof }) {
  const bars = [
    { label: 'Treatment (ML + policy)', pct: proof.treatPct, tone: 'bg-emerald-500', text: 'text-emerald-600' },
    { label: 'Control (no action)', pct: proof.controlPct, tone: 'bg-slate-300', text: 'text-slate-400' },
  ];
  return (
    <section id="proof" className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-600">The standout</span>
          <h2 className="mt-4 font-display text-[2rem] font-semibold tracking-[-0.01em] text-ink sm:text-[2.6rem]">Incremental ₹, not gross.</h2>
          <p className="mt-6 text-lg leading-relaxed text-slate-600">
            Every recovery tool reports “we recovered ₹X.” That proves nothing — some customers would have paid anyway.
            Overwatch runs an always-on <span className="font-semibold text-ink">control holdout</span> and reports the
            recovery <span className="font-semibold text-ink">over what would have happened with no action</span>, with a
            95% confidence interval — and auto-suppresses any reason that can’t beat doing nothing.
          </p>
          <ul className="mt-7 space-y-3">
            {['Holdout-measured incremental recovery, net of cost', 'Externally validated on a real public RCT (within 1.9%)', 'Self-optimizing: prunes actions that don’t add value'].map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-sm text-slate-700">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-600"><Icon name="check" className="h-3.5 w-3.5" /></span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5">
          <div className="text-sm font-medium text-slate-500">Incremental recovered (vs control){proof.live ? ' · live' : ' · illustrative'}</div>
          <div className="mt-1 font-display text-5xl font-semibold tracking-tight text-emerald-600 tabular-nums">{formatINR(proof.incrementalPaise)}</div>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 font-mono text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
            {proof.liftPct > 0 ? '+' : ''}{proof.liftPct}pp lift · 95% CI · {proof.significant ? 'significant' : 'not yet significant'}
          </div>
          <div className="mt-8 space-y-5">
            {bars.map((b) => (
              <div key={b.label}>
                <div className="mb-1.5 flex justify-between text-xs font-medium">
                  <span className="text-slate-700">{b.label}</span>
                  <span className={cxText(b.text)}>{b.pct}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100"><div className={`h-2.5 rounded-full ${b.tone}`} style={{ width: `${b.pct}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function cxText(c: string) {
  return `font-mono tabular-nums ${c}`;
}

function FinalCTA() {
  return (
    <section className="px-5 pb-24 lg:px-8">
      <div
        className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-emerald-200 bg-emerald-50 px-8 py-16 text-center lg:px-16"
        style={{ backgroundImage: 'radial-gradient(600px 300px at 50% 0%, rgba(16,185,129,0.12), transparent 70%)' }}
      >
        <h2 className="mx-auto max-w-2xl font-display text-[2rem] font-semibold tracking-[-0.01em] text-ink sm:text-[2.7rem]">
          See exactly how much revenue you’re leaving on the table.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-slate-600">
          Spin up the live demo in your browser — seed cases, run the pipeline, and watch the recovered rupees move.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link to="/login" className={btnPrimary}>Get started free</Link>
          <Link to="/app" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition-colors hover:border-emerald-300 hover:text-emerald-700">Explore the dashboard</Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-200/70 bg-paper">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-slate-500 lg:flex-row lg:px-8">
        <div className="flex items-center gap-2.5">
          <Logo className="h-7 w-7" />
          <span className="font-bold text-ink">Overwatch</span>
          <span className="text-slate-300">·</span>
          <span className="font-mono text-[12px]">Where nothing slips through</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="#features" className="transition-colors hover:text-ink">Product</a>
          <a href="#how" className="transition-colors hover:text-ink">How it works</a>
          <Link to="/login" className="transition-colors hover:text-ink">Sign in</Link>
          <span className="text-slate-400">Razorpay AI Buildathon 2026</span>
        </div>
      </div>
    </footer>
  );
}
