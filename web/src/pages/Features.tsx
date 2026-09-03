import { useLiveProof, FAQS } from '../marketing/data';
import { CTA, Container, Eyebrow, Heading, Lead, dotGrid } from '../marketing/ui';
import { FeatureGrid, FinalCta, Forecast, HowItMoves, UnifyDark } from '../marketing/sections';
import { FaqSection } from '../marketing/faq';

const PRODUCT_FAQ = FAQS.filter((f) =>
  ['How is it different from a simple retry rule?', 'Does the AI ever move money on its own?', 'Which payment rails does it work with?', 'How does it stay compliant with RBI and NPCI rules?', 'What happens during a bank or UPI outage?'].includes(f.q),
);

export function Features() {
  const proof = useLiveProof();
  return (
    <>
      <section className="relative overflow-hidden bg-cream" style={dotGrid}>
        <Container className="relative py-16 text-center sm:py-20">
          <Eyebrow icon="bolt">The platform</Eyebrow>
          <Heading as="h1" size="xl" className="mx-auto mt-5 max-w-3xl">Everything the recovery engine ships</Heading>
          <Lead className="mx-auto mt-6 max-w-2xl">
            Calibrated ML, bounded execution, and holdout-measured proof — the six pieces a static retry
            toggle leaves on the table.
          </Lead>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <CTA to="/app" size="lg">Open the Console</CTA>
            <CTA to="/app" variant="ghost" size="lg" icon="play">Watch demo</CTA>
          </div>
        </Container>
      </section>

      <section className="bg-cream pb-16 sm:pb-24">
        <Container><FeatureGrid /></Container>
      </section>

      <HowItMoves />
      <UnifyDark proof={proof} />
      <Forecast />
      <FaqSection items={PRODUCT_FAQ} eyebrow="Product FAQ" heading="Questions about how it works" lead="The mechanics a merchant checks before pointing a webhook at it." />
      <FinalCta />
    </>
  );
}
