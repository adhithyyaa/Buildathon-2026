import { useState } from 'react';
import { Icon } from '../components/icons';
import { CTA, Container, Eyebrow, Heading, Lead, Stars, cx } from './ui';
import { PLANS } from './data';

const inr = (rupees: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(rupees);

export function PricingSection({ id }: { id?: string }) {
  const [yearly, setYearly] = useState(false);
  return (
    <section id={id} className="bg-cream py-16 sm:py-24">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Simple, flexible pricing</Eyebrow>
          <Heading className="mt-4">Plans built around how you recover</Heading>
          <Lead className="mx-auto mt-5 max-w-xl">
            Start free in test mode. Move to live recovery when the incremental lift proves itself — the
            number the Recovery Lab measures for you.
          </Lead>
        </div>

        <div className="mt-8 flex items-center justify-center gap-4">
          <Stars value={4.9} />
          <span className="h-4 w-px bg-hair" />
          <div className="inline-flex items-center gap-1 rounded-full bg-white p-1 ring-1 ring-inset ring-hair">
            {(['monthly', 'yearly'] as const).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setYearly(b === 'yearly')}
                className={cx('rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition-all', (b === 'yearly') === yearly ? 'bg-pine text-cream' : 'text-bark hover:text-forest')}
              >
                {b}
              </button>
            ))}
          </div>
          <span className="rounded-full bg-fern/15 px-2.5 py-1 text-[11px] font-semibold text-moss">Save 20%</span>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const price = yearly ? plan.yearly : plan.monthly;
            const featured = plan.featured;
            return (
              <div
                key={plan.name}
                className={cx(
                  'relative flex flex-col rounded-3xl p-7 transition-transform',
                  featured ? 'bg-pine text-cream shadow-2xl shadow-pine/25 lg:-translate-y-3' : 'border border-hair bg-white text-bark',
                )}
              >
                {featured && (
                  <span className="absolute right-6 top-7 rounded-full bg-mint/20 px-2.5 py-1 text-[11px] font-semibold text-mint">Most popular</span>
                )}
                <div className={cx('text-sm font-bold uppercase tracking-wider', featured ? 'text-mint' : 'text-moss')}>{plan.name}</div>
                <div className="mt-4 flex items-end gap-1.5">
                  <span className={cx('font-display text-[2.6rem] font-semibold leading-none tabular-nums', featured ? 'text-cream' : 'text-forest')}>
                    {price === null ? 'Custom' : price === 0 ? 'Free' : inr(price)}
                  </span>
                  {price !== null && price !== 0 && <span className={cx('pb-1 text-sm', featured ? 'text-cream/60' : 'text-fog')}>/ mo</span>}
                </div>
                <div className={cx('mt-1 text-[12px]', featured ? 'text-cream/60' : 'text-fog')}>
                  {price === null ? 'Talk to us about volume' : price === 0 ? 'Free forever in test mode' : yearly ? 'billed annually' : 'billed monthly'}
                </div>
                <p className={cx('mt-4 text-sm', featured ? 'text-cream/75' : 'text-bark')}>{plan.tagline}</p>

                <div className="my-6 h-px w-full bg-current opacity-10" />
                <ul className="flex-1 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <span className={cx('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full', featured ? 'bg-mint/20 text-mint' : 'bg-fern/15 text-moss')}>
                        <Icon name="check" className="h-3.5 w-3.5" />
                      </span>
                      <span className={featured ? 'text-cream/90' : 'text-bark'}>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  <CTA to={plan.to} variant={featured ? 'cream' : 'primary'} className="w-full" icon={null}>{plan.cta}</CTA>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center font-mono text-[11px] text-fog">Buildathon 2026 · illustrative pricing — the product is a working demo, not a billed service yet.</p>
      </Container>
    </section>
  );
}
