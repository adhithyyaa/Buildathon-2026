import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/icons';
import { formatINR } from '../lib/format';
import { CTA, CheckRow, Container, Eyebrow, Heading, Lead, Monogram, PhoneFrame, Reveal, Section, cx } from './ui';
import { FEATURES, INTEGRATIONS, PRINCIPLES, RAILS, STEPS, type LiveProof } from './data';

/* ─────────────────────────────  Rails strip  ───────────────────────────── */
export function LogoCloud() {
  const row = [...RAILS, ...RAILS];
  return (
    <div className="border-y border-hair/70 bg-cream py-8">
      <Container>
        <p className="text-center text-[12px] font-semibold uppercase tracking-[0.16em] text-fog">
          Works across every rail Razorpay supports
        </p>
        <div className="relative mt-6 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
          <div className="animate-marquee flex w-max items-center gap-12">
            {row.map((r, i) => (
              <span key={i} className="font-display text-xl font-semibold tracking-tight text-forest/35">{r}</span>
            ))}
          </div>
        </div>
      </Container>
    </div>
  );
}

/* ─────────────────────────  "Reviewed / shaped by"  ────────────────────── */
export function ExpertReview() {
  return (
    <Section tone="oat">
      <Container className="text-center">
        <Reveal>
          <Eyebrow icon="spark">Product · proof</Eyebrow>
          <p className="mx-auto mt-6 max-w-3xl font-display text-[1.7rem] font-medium leading-snug tracking-[-0.01em] text-forest sm:text-[2.2rem]">
            Every recovery decision is shaped by your real payment data, checked by a deterministic policy
            engine, <span className="text-forest/40">and re-measured against a live control as your book changes.</span>
          </p>
          <div className="mx-auto mt-8 inline-flex flex-wrap items-center justify-center gap-4 rounded-full border border-hair bg-white px-5 py-3 shadow-sm shadow-forest/5">
            <span className="flex -space-x-2">
              {['RL', 'PE', 'AL'].map((m) => <Monogram key={m} initials={m} className="ring-2 ring-white" />)}
            </span>
            <span className="text-sm font-medium text-bark">Independently checked by red-team oracles &amp; a real public RCT</span>
            <Link to="/app/rigor" className="inline-flex items-center gap-1 text-sm font-semibold text-moss hover:text-forest">
              See the method <Icon name="arrow" className="h-4 w-4" />
            </Link>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}

/* ─────────────────────────────  Detect/Decide/Prove  ────────────────────── */
export function HowItMoves() {
  const [active, setActive] = useState(0);
  const step = STEPS[active];
  return (
    <Section id="how" tone="cream">
      <Container>
        <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
          <div>
            <Eyebrow>One connected recovery system</Eyebrow>
            <Heading className="mt-4">How Overwatch keeps your revenue moving</Heading>
          </div>
          <Lead className="lg:pb-2">
            One pipeline, three jobs — detect the failure, decide the safest move, and prove the incremental
            rupees. Every AI suggestion is policy-checked before a single rupee moves.
          </Lead>
        </div>

        {/* tabs */}
        <div className="mt-10 flex flex-wrap gap-2">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setActive(i)}
              className={cx(
                'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all',
                i === active ? 'bg-pine text-cream shadow-sm shadow-pine/20' : 'bg-white text-bark ring-1 ring-inset ring-hair hover:ring-pine/30',
              )}
            >
              <Icon name={s.icon} className="h-4 w-4" /> {s.tab}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-8 rounded-3xl border border-hair bg-white p-6 sm:p-8 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="font-mono text-[11px] font-semibold text-moss">Step {String(active + 1).padStart(2, '0')}</div>
            <h3 className="mt-2 font-display text-2xl font-semibold text-forest">{step.title}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-bark">{step.body}</p>
            <ul className="mt-5 space-y-2.5">
              {step.points.map((p) => <CheckRow key={p}>{p}</CheckRow>)}
            </ul>
          </div>
          <StepVisual stepKey={step.key} />
        </div>
      </Container>
    </Section>
  );
}

function StepVisual({ stepKey }: { stepKey: string }) {
  if (stepKey === 'detect') {
    return (
      <div className="rounded-2xl border border-hair bg-cream/40 p-5">
        <div className="mb-3 flex items-center justify-between text-[11px] font-semibold text-fog">
          <span>Incoming failures</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-gold"><span className="h-1.5 w-1.5 rounded-full bg-gold" /> spike: UPI collect</span>
        </div>
        <div className="space-y-2">
          {[['upi_collect_timeout', '₹4,120', 'high'], ['card_declined', '₹9,800', 'med'], ['bank_downtime', '₹2,540', 'high'], ['upi_collect_timeout', '₹6,300', 'high']].map((r, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border border-hair bg-white px-3 py-2 text-[12px]">
              <span className="font-mono text-bark">{r[0]}</span>
              <span className="flex items-center gap-2"><span className="font-semibold tabular-nums text-forest">{r[1]}</span><span className={cx('rounded px-1.5 py-0.5 text-[10px] font-semibold', r[2] === 'high' ? 'bg-fern/15 text-moss' : 'bg-hair/60 text-fog')}>{r[2]}</span></span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (stepKey === 'decide') {
    const acts = [['smart_retry', 62], ['fresh_payment_link', 24], ['reminder', 9], ['no_action', 5]];
    return (
      <div className="rounded-2xl border border-hair bg-cream/40 p-5">
        <div className="mb-3 flex items-center justify-between text-[11px] font-semibold text-fog">
          <span>Action expected value</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-fern/15 px-2 py-0.5 text-moss"><Icon name="shield" className="h-3 w-3" /> policy: PASS</span>
        </div>
        <div className="space-y-3">
          {acts.map(([name, pct]) => (
            <div key={name as string}>
              <div className="mb-1 flex justify-between text-[12px]"><span className="font-mono text-bark">{name}</span><span className="font-semibold tabular-nums text-forest">{pct}%</span></div>
              <div className="h-2 rounded-full bg-hair/70"><div className="h-2 rounded-full bg-gradient-to-r from-pine to-fern" style={{ width: `${pct}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-hair bg-cream/40 p-5">
      <div className="mb-3 text-[11px] font-semibold text-fog">Treatment vs control · resolved</div>
      <div className="space-y-4">
        {[['Treatment (ML + policy)', 59, 'from-pine to-fern', 'text-moss'], ['Control (no action)', 19, 'from-hair to-hair', 'text-fog']].map(([label, pct, grad, txt]) => (
          <div key={label as string}>
            <div className="mb-1 flex justify-between text-[12px]"><span className="text-bark">{label}</span><span className={cx('font-semibold tabular-nums', txt as string)}>{pct}%</span></div>
            <div className="h-2.5 rounded-full bg-hair/70"><div className={cx('h-2.5 rounded-full bg-gradient-to-r', grad as string)} style={{ width: `${pct}%` }} /></div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-lg bg-fern/10 px-3 py-2 text-[12px]">
        <span className="text-moss">Incremental vs control</span>
        <span className="font-display font-semibold tabular-nums text-moss">+40.2pp · 95% CI</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────  Unify (dark)  ───────────────────────────── */
export function UnifyDark({ proof }: { proof: LiveProof }) {
  const bars = [46, 62, 38, 78, 55, 88, 70, 94];
  return (
    <Section tone="pine">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <Eyebrow dark>Real recovery overview</Eyebrow>
            <Heading dark className="mt-4">Unify every failed payment in one view</Heading>
            <Lead dark className="mt-5">
              One queue across UPI, cards and netbanking — each case scored, decided, and tracked to a
              signed outcome. No spreadsheets, no blind retries, no double-counting.
            </Lead>
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <div>
                <div className="text-sm font-semibold text-cream">One queue, every rail</div>
                <ul className="mt-3 space-y-2">
                  <CheckRow on="dark">De-duplicated at ingest</CheckRow>
                  <CheckRow on="dark">Risk + urgency per case</CheckRow>
                </ul>
              </div>
              <div>
                <div className="text-sm font-semibold text-cream">Incremental, not gross</div>
                <ul className="mt-3 space-y-2">
                  <CheckRow on="dark">Measured vs a live control</CheckRow>
                  <CheckRow on="dark">Per-reason auto-suppression</CheckRow>
                </ul>
              </div>
            </div>
          </div>

          <Reveal className="rounded-2xl border border-hair bg-white p-6 shadow-2xl shadow-black/20">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-forest">Recovery overview</div>
              <span className="rounded-full bg-fern/15 px-2.5 py-1 text-[11px] font-semibold text-moss">This month</span>
            </div>
            <div className="mt-4 font-display text-4xl font-semibold tabular-nums text-forest">{formatINR(proof.recoveredPaise)}</div>
            <div className="mt-1 text-[12px] text-fog">{proof.recoveredCount} recovered · {proof.liftPct > 0 ? '+' : ''}{proof.liftPct}pp vs control</div>
            <div className="mt-5 flex h-28 items-end gap-2">
              {bars.map((h, i) => (
                <div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-pine/80 to-fern" style={{ height: `${h}%` }} />
              ))}
            </div>
            <div className="mt-3 flex justify-between font-mono text-[10px] text-fog"><span>Wk 1</span><span>Wk 2</span><span>Wk 3</span><span>Wk 4</span></div>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}

/* ─────────────────────────  Cash position (phone)  ──────────────────────── */
export function CashPosition({ proof }: { proof: LiveProof }) {
  return (
    <Section tone="cream">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal className="order-2 lg:order-1">
            <PhoneFrame>
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-fog">Recovered today</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-fern/15 px-2 py-0.5 text-[10px] font-semibold text-moss"><Icon name="trendUp" className="h-3 w-3" /> {proof.liftPct > 0 ? '+' : ''}{proof.liftPct}pp</span>
                </div>
                <div className="mt-2 font-display text-[1.9rem] font-semibold tabular-nums text-forest">{formatINR(proof.recoveredPaise)}</div>
                <div className="mt-4 space-y-2">
                  {[['UPI collect', '₹4,120', 'recovered'], ['Card decline', '₹9,800', 'recovered'], ['Netbanking', '₹2,540', 'pending'], ['UPI intent', '₹6,300', 'recovered']].map((r, i) => (
                    <div key={i} className="flex items-center justify-between rounded-xl border border-hair bg-white px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={cx('grid h-6 w-6 place-items-center rounded-full', r[2] === 'recovered' ? 'bg-fern/15 text-moss' : 'bg-gold/15 text-gold')}><Icon name={r[2] === 'recovered' ? 'check' : 'refresh'} className="h-3.5 w-3.5" /></span>
                        <span className="text-[12px] font-medium text-forest">{r[0]}</span>
                      </div>
                      <span className="text-[12px] font-semibold tabular-nums text-forest">{r[1]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </PhoneFrame>
          </Reveal>

          <div className="order-1 lg:order-2">
            <Eyebrow>Real-time recovery</Eyebrow>
            <Heading className="mt-4">Know exactly what you’ve recovered — every day</Heading>
            <Lead className="mt-5">
              A single live number, backed by a signed webhook for every capture. Watch recoveries land in
              real time, sliced by rail and reason, with the incremental lift always in view.
            </Lead>
            <ul className="mt-6 space-y-2.5">
              <CheckRow>Booked recovered only on a real signed capture</CheckRow>
              <CheckRow>Per-reason lift, updated as outcomes resolve</CheckRow>
            </ul>
            <div className="mt-8"><CTA to="/app">Explore the dashboard</CTA></div>
          </div>
        </div>
      </Container>
    </Section>
  );
}

/* ─────────────────────────  Anomaly / forecast (phone)  ─────────────────── */
export function Forecast() {
  return (
    <Section tone="white">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <Eyebrow>Outage-aware</Eyebrow>
            <Heading className="mt-4">Catch a failure spike before it drains revenue</Heading>
            <Lead className="mt-5">
              An isolation-forest detector watches the failure stream in real time. The moment a bank or UPI
              outage spikes, Overwatch defers retries for that reason — so you don’t pour cost into a storm —
              then resumes automatically when it clears.
            </Lead>
            <ul className="mt-6 space-y-2.5">
              <CheckRow>Windowed anomaly detection per reason</CheckRow>
              <CheckRow>Retries deferred, then auto-resumed</CheckRow>
            </ul>
            <div className="mt-8"><CTA to="/app/model" variant="ghost">See anomaly watch</CTA></div>
          </div>

          <Reveal>
            <PhoneFrame>
              <div className="p-4">
                <div className="rounded-2xl bg-gradient-to-br from-pine to-pine-700 p-4 text-cream">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-mint"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mint" /> Failure spike active</div>
                  <div className="mt-2 font-display text-lg font-semibold">UPI collect timeout</div>
                  <div className="mt-1 text-[12px] text-cream/70">Retries deferred · resuming when the spike clears</div>
                </div>
                <div className="mt-3 rounded-xl border border-hair bg-white p-3">
                  <div className="mb-2 flex items-center justify-between text-[10px] font-semibold text-fog"><span>Failures / min</span><span className="text-gold">▲ 6.2×</span></div>
                  <div className="flex h-16 items-end gap-1">
                    {[20, 24, 22, 30, 46, 72, 95, 88].map((h, i) => (
                      <div key={i} className={cx('flex-1 rounded-t-sm', i >= 5 ? 'bg-gold' : 'bg-hair')} style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-xl bg-fern/10 px-3 py-2 text-[11px]">
                  <span className="font-medium text-moss">Cards &amp; netbanking</span>
                  <span className="font-semibold text-moss">recovering normally</span>
                </div>
              </div>
            </PhoneFrame>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}

/* ─────────────────────────────  Integrations  ──────────────────────────── */
export function Integrations() {
  return (
    <Section tone="cream">
      <Container>
        <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
          <div>
            <Eyebrow>Connect your stack</Eyebrow>
            <Heading className="mt-4">Overwatch works with the stack you already run</Heading>
          </div>
          <Lead className="lg:pb-2">
            No rip-and-replace. Point a webhook at Overwatch and it reads failures and books recoveries across
            every rail, with alerts wherever your team already works.
          </Lead>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {INTEGRATIONS.map((it) => (
            <div key={it.name} className="group rounded-2xl border border-hair bg-white p-6 transition-all hover:-translate-y-1 hover:border-pine/25 hover:shadow-lg hover:shadow-forest/5">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-fern/12 text-moss transition-colors group-hover:bg-pine group-hover:text-cream">
                <Icon name={it.icon} className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-base font-bold text-forest">{it.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-bark">{it.body}</p>
              <div className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-moss">{it.link} <Icon name="arrow" className="h-3.5 w-3.5" /></div>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}

/* ───────────────────────  Proof wall (honest testimonial analog)  ───────── */
export function ProofWall({ proof }: { proof: LiveProof }) {
  return (
    <Section tone="pine">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow dark>Proven, not asserted</Eyebrow>
          <Heading dark className="mt-4">Built to stand up to a tough panel</Heading>
          <Lead dark className="mx-auto mt-5 max-w-xl">
            No fabricated logos or testimonials. The claims on this page are the ones the system can defend —
            each guaranteed by a specific part of Overwatch.
          </Lead>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard big={`${proof.liftPct > 0 ? '+' : ''}${proof.liftPct}pp`} label={proof.live ? 'measured lift vs a live control' : 'incremental lift vs control (illustrative)'} sub="95% bootstrap CI" />
          <StatCard big="1.9%" label="error vs a real public RCT" sub="DR-OPE vs Hillstrom (64k) ground truth" />
          <StatCard big="100%" label="exactly-once recovery" sub="signed, idempotent webhooks" />
          {PRINCIPLES.map((p) => (
            <figure key={p.initials} className="rounded-2xl bg-cream/[0.06] p-6 ring-1 ring-inset ring-cream/10">
              <blockquote className="text-[14px] leading-relaxed text-cream/85">“{p.quote}”</blockquote>
              <figcaption className="mt-4 flex items-center gap-3">
                <Monogram initials={p.initials} className="bg-cream/10 text-mint ring-cream/15" />
                <span className="text-sm font-semibold text-cream">{p.who}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </Container>
    </Section>
  );
}

function StatCard({ big, label, sub }: { big: string; label: string; sub: string }) {
  return (
    <div className="rounded-2xl bg-pine-700/50 p-6 ring-1 ring-inset ring-cream/10">
      <div className="font-display text-4xl font-semibold tabular-nums text-mint">{big}</div>
      <div className="mt-2 text-sm font-semibold text-cream">{label}</div>
      <div className="mt-1 font-mono text-[11px] text-cream/55">{sub}</div>
    </div>
  );
}

/* ─────────────────────────────  Final CTA band  ─────────────────────────── */
export function FinalCta() {
  return (
    <Section tone="cream" className="pb-20 sm:pb-28">
      <Container>
        <div className="relative overflow-hidden rounded-3xl bg-pine px-6 py-14 sm:px-14 sm:py-20" style={{ backgroundImage: 'radial-gradient(600px 300px at 100% 0%, rgba(167,216,186,0.14), transparent 70%)' }}>
          <div className="grid items-center gap-8 lg:grid-cols-2">
            <div>
              <Eyebrow dark>Start with a clear view</Eyebrow>
              <Heading dark className="mt-4">Your recovered revenue is waiting to be measured</Heading>
            </div>
            <div className="lg:pl-6">
              <Lead dark className="max-w-md">
                Spin up the live demo in your browser — seed cases, run the pipeline, and watch the recovered
                rupees move against a real control holdout.
              </Lead>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <CTA to="/login" variant="cream" size="lg">Start for free</CTA>
                <CTA to="/app" variant="darkghost" size="lg">Explore the dashboard</CTA>
              </div>
              <div className="mt-5 font-mono text-[12px] text-cream/60">hello@overwatch.dev</div>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}

/* ─────────────────────  Feature grid (reused on Features page)  ──────────── */
export function FeatureGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {FEATURES.map((f) => (
        <div key={f.title} className="group rounded-2xl border border-hair bg-white p-6 transition-all hover:-translate-y-1 hover:border-pine/25 hover:shadow-lg hover:shadow-forest/5">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-fern/12 text-moss transition-colors group-hover:bg-pine group-hover:text-cream">
            <Icon name={f.icon} className="h-5 w-5" />
          </span>
          <h3 className="mt-5 text-base font-bold text-forest">{f.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-bark">{f.body}</p>
        </div>
      ))}
    </div>
  );
}
