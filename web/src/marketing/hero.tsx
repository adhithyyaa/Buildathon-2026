import { Icon } from '../components/icons';
import { Logo } from '../components/Logo';
import { formatINR } from '../lib/format';
import { CTA, Container, dotGrid } from './ui';
import type { LiveProof } from './data';

/** The hero — centered serif headline over the product mock, matching the reference composition. */
export function Hero({ proof }: { proof: LiveProof }) {
  return (
    <section className="relative overflow-hidden bg-cream" style={dotGrid}>
      {/* soft pine glow up top */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-40 h-80 opacity-70" style={{ background: 'radial-gradient(60% 100% at 50% 0%, rgba(31,61,51,0.10), transparent 70%)' }} />
      <Container className="relative pt-16 pb-10 text-center sm:pt-20">
        <span className="inline-flex items-center gap-2 rounded-full border border-pine/15 bg-white/70 px-3.5 py-1.5 text-[12px] font-semibold text-pine shadow-sm shadow-pine/5 backdrop-blur">
          <Logo className="h-4 w-4" />
          Overwatch AI Recovery
          <span className="h-1 w-1 rounded-full bg-pine/30" />
          <span className="font-medium text-moss">plugs under Razorpay</span>
        </span>

        <h1 className="mx-auto mt-7 max-w-4xl font-display text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.025em] text-forest text-balance sm:text-[4rem]">
          AI-Powered <span className="text-moss">Payment Recovery</span>,<br className="hidden sm:block" /> Built to Win Back Revenue
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-[16px] leading-relaxed text-bark sm:text-[17px]">
          Overwatch AI Recovery catches failed payments, decides the safest recovery move, and proves the{' '}
          <span className="font-semibold text-forest">incremental rupees</span> it brings back — measured against a live
          control holdout, never estimated.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <CTA to="/login" size="lg">Start for free</CTA>
          <CTA to="/app" variant="ghost" size="lg" icon="play">Watch demo</CTA>
        </div>
        <p className="mt-5 font-mono text-[11px] tracking-wide text-fog">Razorpay test-mode · no card required · set up in minutes</p>

        <HeroVisual proof={proof} />
      </Container>
    </section>
  );
}

function HeroVisual({ proof }: { proof: LiveProof }) {
  const bars = [52, 74, 41, 88, 63, 96, 58, 79];
  return (
    <div className="relative mx-auto mt-14 max-w-4xl">
      <div aria-hidden className="pointer-events-none absolute -inset-x-6 -bottom-6 top-10 rounded-[2rem] bg-pine/5 blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl border border-hair bg-white shadow-2xl shadow-forest/15">
        {/* window chrome */}
        <div className="flex items-center gap-1.5 border-b border-hair/70 bg-cream/50 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-hair" />
          <span className="h-2.5 w-2.5 rounded-full bg-hair" />
          <span className="h-2.5 w-2.5 rounded-full bg-hair" />
          <span className="ml-3 rounded-md bg-white px-2 py-0.5 font-mono text-[10.5px] text-fog ring-1 ring-inset ring-hair/80">app.overwatch.ai / overview</span>
        </div>
        <div className="grid gap-4 p-5 text-left sm:grid-cols-2 sm:p-6">
          <div className="rounded-xl border border-hair bg-cream/40 p-4">
            <div className="text-[11px] font-semibold text-fog">Recovered{proof.live ? '' : ' · illustrative'}</div>
            <div className="mt-1 font-display text-[1.9rem] font-semibold tabular-nums text-forest">{formatINR(proof.recoveredPaise)}</div>
            <div className="mt-0.5 text-[11px] text-fog">{proof.recoveredCount} of {proof.totalCases} cases</div>
          </div>
          <div className="rounded-xl border border-fern/25 bg-fern/10 p-4">
            <div className="text-[11px] font-semibold text-moss">Incremental lift vs control</div>
            <div className="mt-1 font-display text-[1.9rem] font-semibold tabular-nums text-moss">{proof.liftPct > 0 ? '+' : ''}{proof.liftPct}pp</div>
            <div className="mt-0.5 text-[11px] text-moss/80">95% CI · {proof.significant ? 'significant' : 'n.s.'}</div>
          </div>
          <div className="rounded-xl border border-hair bg-white p-4 sm:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[11px] font-semibold text-fog">Recovery by reason</div>
              <span className="font-mono text-[10px] font-semibold text-moss">CatBoost · calibrated</span>
            </div>
            <div className="flex h-24 items-end gap-2">
              {bars.map((h, i) => (
                <div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-pine to-fern" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* floating cards */}
      <div className="animate-floaty absolute -right-3 -top-5 hidden rounded-xl border border-hair bg-white px-3.5 py-2.5 shadow-xl shadow-forest/10 sm:block">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-fern/15 text-moss"><Icon name="trendUp" className="h-4 w-4" /></span>
          <div>
            <div className="font-display text-sm font-semibold tabular-nums text-forest">{proof.liftPct > 0 ? '+' : ''}{proof.liftPct}pp</div>
            <div className="text-[10px] text-fog">vs control · 95% CI</div>
          </div>
        </div>
      </div>
      <div className="animate-floaty absolute -bottom-6 -left-4 hidden items-center gap-2.5 rounded-xl border border-hair bg-white px-3.5 py-2.5 shadow-xl shadow-forest/10 sm:flex" style={{ animationDelay: '1.2s' }}>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-pine text-cream"><Icon name="check" className="h-4 w-4" /></span>
        <div>
          <div className="text-xs font-semibold text-forest">Payment recovered</div>
          <div className="font-mono text-[10px] text-fog">pay_TTyBx4OQoIQFkj · signed</div>
        </div>
      </div>
    </div>
  );
}
