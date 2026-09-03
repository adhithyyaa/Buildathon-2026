import { Link } from 'react-router-dom';
import { Icon } from '../components/icons';
import { CTA, Container, Eyebrow, Heading, Lead, Section, dotGrid } from '../marketing/ui';
import { FinalCta } from '../marketing/sections';

const PRINCIPLES = [
  { icon: 'lab', title: 'Measured, not estimated', body: 'A 20% no-action control holdout means we report the incremental rupees recovered over doing nothing — with a 95% confidence interval — never gross recoveries anyone can claim.' },
  { icon: 'shield', title: 'Bounded by policy', body: 'ML only ever proposes. A deterministic policy engine enforces retry caps, quiet hours, opt-out and RBI/AFA limits before a single rupee moves.' },
  { icon: 'audit', title: 'Tamper-evident by default', body: 'Every state transition is SHA-256 hash-chained and append-only at the database — provable, replayable, and impossible to quietly rewrite.' },
  { icon: 'evidence', title: 'Honest about limits', body: 'The demo world is synthetic and labelled as such; the external check is a real public RCT. We pre-register pilots and report the gates we miss.' },
];

const METHOD = [
  { big: '1.9%', label: 'error vs a real public RCT (Hillstrom, 64k)' },
  { big: '20%', label: 'randomised no-action control holdout' },
  { big: '100%', label: 'exactly-once recovery on signed webhooks' },
  { big: '0', label: 'policy breaches across the red-team suite' },
];

export function About() {
  return (
    <>
      <section className="relative overflow-hidden bg-cream" style={dotGrid}>
        <Container className="relative py-16 text-center sm:py-20">
          <Eyebrow icon="shield">About Overwatch</Eyebrow>
          <Heading as="h1" size="xl" className="mx-auto mt-5 max-w-3xl">We measure recovery. We don’t estimate it.</Heading>
          <Lead className="mx-auto mt-6 max-w-2xl">
            Overwatch is the revenue-integrity layer for Razorpay — an AI engine that recovers failed payments
            and proves, against a live control, exactly how much extra revenue it brought back.
          </Lead>
        </Container>
      </section>

      <Section tone="white">
        <Container>
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <Eyebrow>Why we built it</Eyebrow>
              <Heading className="mt-4">In India, a failed payment isn’t a lost customer</Heading>
              <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-bark">
                <p>
                  A UPI collect times out. A bank has a downtime window. A card declines for a moment. The
                  customer <span className="font-semibold text-forest">wanted to pay</span> — the failure is
                  mechanical and recoverable.
                </p>
                <p>
                  But blind retries annoy customers and burn gateway cost, and doing nothing leaves real money
                  on the table. Recovery is <span className="font-semibold text-forest">decisioning under
                  constraints</span> — and, crucially, it’s only worth anything if you can prove the lift is
                  real. That’s the gap Overwatch closes.
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {PRINCIPLES.map((p) => (
                <div key={p.title} className="rounded-2xl border border-hair bg-cream/50 p-6">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-fern/12 text-moss"><Icon name={p.icon} className="h-5 w-5" /></span>
                  <h3 className="mt-4 text-[15px] font-bold text-forest">{p.title}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-bark">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </Section>

      <Section tone="pine">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow dark>The method</Eyebrow>
            <Heading dark className="mt-4">Proof you can reproduce, not a pitch</Heading>
            <Lead dark className="mx-auto mt-5 max-w-xl">
              The same machinery that scores your cases is validated against a real randomised trial and a
              red-team compliance suite — every number reproducible from the dashboard.
            </Lead>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {METHOD.map((m) => (
              <div key={m.big} className="rounded-2xl bg-pine-700/50 p-6 text-center ring-1 ring-inset ring-cream/10">
                <div className="font-display text-4xl font-semibold tabular-nums text-mint">{m.big}</div>
                <div className="mt-2 text-[13px] leading-snug text-cream/80">{m.label}</div>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <CTA to="/app/rigor" variant="cream">See the rigor page</CTA>
            <Link to="/app" className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-cream ring-1 ring-inset ring-cream/25 transition-colors hover:bg-cream/10">
              Open the demo <Icon name="arrow" className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-8 text-center font-mono text-[12px] text-cream/55">Razorpay AI Buildathon 2026 · Track 03 — Payment recovery</p>
        </Container>
      </Section>

      <FinalCta />
    </>
  );
}
