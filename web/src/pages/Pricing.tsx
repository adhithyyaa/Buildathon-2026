import { FAQS } from '../marketing/data';
import { Container, Eyebrow, Heading, Lead, dotGrid, CheckRow } from '../marketing/ui';
import { PricingSection } from '../marketing/pricing';
import { FinalCta } from '../marketing/sections';
import { FaqSection } from '../marketing/faq';

const PRICING_FAQ = FAQS.filter((f) =>
  ['What does Overwatch do?', 'How do you prove the recovery is real and not luck?', 'How long does setup take?', 'Does the AI ever move money on its own?'].includes(f.q),
);

const INCLUDED = [
  'Calibrated ML decisioning',
  'Bounded policy engine',
  'Randomised control holdout',
  'Signed, exactly-once webhooks',
  'Tamper-evident audit ledger',
  'Anomaly / outage defer',
];

export function Pricing() {
  return (
    <>
      <section className="relative overflow-hidden bg-cream" style={dotGrid}>
        <Container className="relative pt-16 pb-4 text-center sm:pt-20">
          <Eyebrow icon="lab">Pricing</Eyebrow>
          <Heading as="h1" size="xl" className="mx-auto mt-5 max-w-3xl">Pay for lift you can measure</Heading>
          <Lead className="mx-auto mt-6 max-w-2xl">
            Every plan ships the full engine. You only graduate from free once the Recovery Lab proves the
            incremental rupees are there.
          </Lead>
        </Container>
      </section>

      <PricingSection />

      <section className="bg-oat py-16 sm:py-20">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Included in every plan</Eyebrow>
            <Heading size="md" className="mt-4">The whole engine, from day one</Heading>
          </div>
          <ul className="mx-auto mt-10 grid max-w-3xl gap-x-8 gap-y-4 sm:grid-cols-2">
            {INCLUDED.map((i) => <CheckRow key={i}>{i}</CheckRow>)}
          </ul>
        </Container>
      </section>

      <FaqSection items={PRICING_FAQ} eyebrow="Pricing FAQ" heading="Before you pick a plan" lead="What the free tier covers and when it makes sense to move up." />
      <FinalCta />
    </>
  );
}
