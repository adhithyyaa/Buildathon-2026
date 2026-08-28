import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Icon } from '../components/icons';

/**
 * Marketing landing page for Recoup — a fintech-SaaS front door positioned as the
 * measurement-and-governance layer that plugs under Razorpay's recovery.
 */
export function Landing() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <TopNav />
      <Hero />
      <TrustStrip />
      <Stats />
      <Problem />
      <Features />
      <HowItWorks />
      <Differentiator />
      <FinalCTA />
      <Footer />
    </div>
  );
}

function TopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo className="h-8 w-8" />
          <span className="text-lg font-bold tracking-tight">Recoup</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
          <a href="#features" className="hover:text-slate-900">Product</a>
          <a href="#how" className="hover:text-slate-900">How it works</a>
          <a href="#proof" className="hover:text-slate-900">Recovery Lab</a>
        </nav>
        <div className="flex items-center gap-2.5">
          <Link to="/login" className="rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Sign in</Link>
          <Link to="/login" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800">Get started</Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 h-[36rem] w-[72rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-violet-200/50 via-indigo-100/40 to-emerald-100/40 blur-3xl" />
      </div>
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-2 lg:gap-8 lg:px-8 lg:py-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> Recovery, finally measured
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Recover the revenue<br />you already earned.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
            Recoup is the ML-first recovery layer for Razorpay. It detects failed payments, decides the
            safest recovery move, and proves — with a signed webhook and a live control holdout — exactly how
            many <span className="font-semibold text-slate-900">incremental rupees</span> it brought back.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/login" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition-transform hover:-translate-y-0.5">
              Start recovering <Icon name="arrow" className="h-4 w-4" />
            </Link>
            <Link to="/app" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              <Icon name="play" className="h-3.5 w-3.5" /> See the live demo
            </Link>
          </div>
          <p className="mt-4 text-xs font-medium text-slate-400">
            Works with Razorpay test-mode · No credit card required · Set up in minutes
          </p>
        </div>
        <HeroVisual />
      </div>
    </section>
  );
}

function HeroVisual() {
  return (
    <div className="relative">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10">
        <div className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
          <span className="ml-3 text-[11px] font-medium text-slate-400">app.recoup.in / overview</span>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200/80 bg-white p-4">
              <div className="text-[11px] font-medium text-slate-500">Recovered</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">₹3,07,934</div>
              <div className="mt-0.5 text-[11px] text-slate-400">56 of 120 cases</div>
            </div>
            <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-4">
              <div className="text-[11px] font-medium text-emerald-700/80">Incremental ₹ lift</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">+39.4pp</div>
              <div className="mt-0.5 text-[11px] text-emerald-700/60">vs control · significant</div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[11px] font-medium text-slate-500">Recovery by reason</div>
              <div className="text-[10px] font-semibold text-violet-600">CatBoost · calibrated</div>
            </div>
            <div className="flex h-24 items-end gap-2">
              {[52, 74, 41, 88, 63, 96, 58].map((h, i) => (
                <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-violet-500 to-indigo-400" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-emerald-600"><Icon name="check" className="h-4 w-4" /></span>
              <div>
                <div className="text-xs font-semibold text-slate-800">Payment recovered</div>
                <div className="text-[10px] font-mono text-slate-400">pay_TTyBx4OQoIQFkj</div>
              </div>
            </div>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">signed webhook</span>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-5 -left-5 hidden rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-lg sm:block">
        <div className="flex items-center gap-2 text-xs">
          <Logo className="h-6 w-6" />
          <span className="font-semibold text-slate-700">exactly-once recovery</span>
        </div>
      </div>
    </div>
  );
}

function TrustStrip() {
  return (
    <section className="border-y border-slate-200/70 bg-slate-50/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-6 text-center lg:flex-row lg:justify-between lg:px-8 lg:text-left">
        <p className="text-sm font-medium text-slate-500">Plugs under Razorpay — the measurement &amp; governance layer they don’t publish.</p>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-semibold text-slate-500">
          <span className="flex items-center gap-1.5"><Icon name="shield" className="h-4 w-4 text-violet-500" /> Policy-as-code</span>
          <span className="flex items-center gap-1.5"><Icon name="link" className="h-4 w-4 text-violet-500" /> Signed webhooks</span>
          <span className="flex items-center gap-1.5"><Icon name="audit" className="h-4 w-4 text-violet-500" /> Full audit trail</span>
          <span className="flex items-center gap-1.5"><Icon name="lab" className="h-4 w-4 text-violet-500" /> Control holdout</span>
        </div>
      </div>
    </section>
  );
}

function Stats() {
  const stats = [
    { v: '48%', l: 'treatment recovery rate', s: 'vs a much lower control' },
    { v: '+31.7pp', l: 'proven incremental lift', s: '95% bootstrap CI' },
    { v: '~0.68', l: 'cross-world transfer AUC', s: 'frozen model, unseen world' },
    { v: '100%', l: 'exactly-once recovery', s: 'signed, idempotent webhooks' },
  ];
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 lg:px-8">
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.l} className="text-center lg:text-left">
            <div className="text-4xl font-extrabold tracking-tight text-slate-900">{s.v}</div>
            <div className="mt-1.5 text-sm font-semibold text-slate-700">{s.l}</div>
            <div className="text-xs text-slate-400">{s.s}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Problem() {
  return (
    <section className="bg-slate-50/60 py-20">
      <div className="mx-auto max-w-3xl px-5 text-center lg:px-8">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          In India, a failed payment isn’t a lost customer.
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-slate-600">
          A UPI collect times out. A bank has a downtime window. A card declines for a moment. The customer
          <span className="font-semibold text-slate-900"> wanted to pay</span> — the failure is mechanical and
          recoverable. But blind retries annoy customers and burn gateway cost, and doing nothing leaves real
          money on the table. Recovery is <span className="font-semibold text-slate-900">decisioning under
          constraints</span> — and that’s exactly what Recoup automates.
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
  { icon: 'audit', title: 'Full Audit Trail', body: 'Every state transition is logged — before → after, actor, details — so every recovery is replayable and explainable end to end.' },
];

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-5 py-20 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <span className="text-sm font-semibold uppercase tracking-wider text-violet-600">The platform</span>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Everything the recovery engine ships</h2>
        <p className="mt-4 text-slate-600">Calibrated ML, bounded execution, and holdout-measured proof — the things a static retry toggle leaves on the table.</p>
      </div>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="group rounded-2xl border border-slate-200/80 bg-white p-6 transition-all hover:-translate-y-1 hover:border-violet-200 hover:shadow-lg hover:shadow-violet-600/5">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-100">
              <Icon name={f.icon} className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-base font-bold text-slate-900">{f.title}</h3>
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
    <section id="how" className="bg-slate-900 py-20 text-white">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wider text-violet-400">How it works</span>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">ML proposes. Deterministic code disposes.</h2>
          <p className="mt-4 text-slate-300">Every AI suggestion is policy-checked before a single rupee moves — bounded, auditable, and safe to point at production.</p>
        </div>
        <div className="mt-14 grid gap-8 lg:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="relative">
              <div className="text-5xl font-extrabold text-white/10">{s.n}</div>
              <h3 className="mt-2 text-xl font-bold">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Differentiator() {
  return (
    <section id="proof" className="mx-auto max-w-6xl px-5 py-24 lg:px-8">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <span className="text-sm font-semibold uppercase tracking-wider text-emerald-600">The standout</span>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Incremental ₹, not gross.</h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-600">
            Every recovery tool reports “we recovered ₹X.” That number proves nothing — some customers would
            have paid anyway. Recoup runs an always-on <span className="font-semibold text-slate-900">control
            holdout</span> and reports the recovery <span className="font-semibold text-slate-900">over what
            would have happened with no action</span>, with a 95% confidence interval — and auto-suppresses any
            reason that can’t beat doing nothing.
          </p>
          <ul className="mt-6 space-y-3">
            {['Holdout-measured incremental recovery, net of cost', 'A live A/B & drift signal on the model', 'Self-optimizing: prunes actions that don’t add value'].map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-sm text-slate-700">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-600"><Icon name="check" className="h-3.5 w-3.5" /></span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-8 shadow-xl shadow-slate-900/5">
          <div className="text-sm font-medium text-slate-500">Incremental recovered (vs control)</div>
          <div className="mt-1 text-5xl font-extrabold tracking-tight text-emerald-600">₹2,27,080</div>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
            +31.7pp lift · 95% CI · significant
          </div>
          <div className="mt-8 space-y-4">
            <div>
              <div className="mb-1 flex justify-between text-xs font-medium"><span className="text-slate-700">Treatment (ML + policy)</span><span className="text-emerald-600">48%</span></div>
              <div className="h-2.5 rounded-full bg-slate-100"><div className="h-2.5 rounded-full bg-emerald-500" style={{ width: '48%' }} /></div>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs font-medium"><span className="text-slate-700">Control (no action)</span><span className="text-slate-400">16%</span></div>
              <div className="h-2.5 rounded-full bg-slate-100"><div className="h-2.5 rounded-full bg-slate-400" style={{ width: '16%' }} /></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="px-5 pb-24 lg:px-8">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-indigo-600 to-violet-700 px-8 py-16 text-center shadow-2xl shadow-violet-600/20 lg:px-16">
        <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
          See exactly how much revenue you’re leaving on the table.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-violet-100">
          Spin up the live demo in your browser — seed cases, run the pipeline, and watch the recovered rupees move.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/login" className="rounded-xl bg-white px-6 py-3 text-sm font-bold text-violet-700 shadow-lg transition-transform hover:-translate-y-0.5">Get started free</Link>
          <Link to="/app" className="rounded-xl border border-white/40 px-6 py-3 text-sm font-bold text-white hover:bg-white/10">Explore the dashboard</Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-200/70 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-slate-500 lg:flex-row lg:px-8">
        <div className="flex items-center gap-2.5">
          <Logo className="h-7 w-7" />
          <span className="font-bold text-slate-800">Recoup</span>
          <span className="text-slate-300">·</span>
          <span>Bounded, ML-first revenue recovery</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="#features" className="hover:text-slate-800">Product</a>
          <a href="#how" className="hover:text-slate-800">How it works</a>
          <Link to="/login" className="hover:text-slate-800">Sign in</Link>
          <span className="text-slate-400">Razorpay AI Buildathon 2026</span>
        </div>
      </div>
    </footer>
  );
}
