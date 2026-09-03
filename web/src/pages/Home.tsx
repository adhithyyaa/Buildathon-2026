import { useLiveProof } from '../marketing/data';
import { Hero } from '../marketing/hero';
import { CashPosition, ConsoleTour, ExpertReview, FinalCta, Forecast, HowItMoves, Integrations, LogoCloud, ProofWall, UnifyDark } from '../marketing/sections';
import { FaqSection } from '../marketing/faq';

/** Overwatch marketing home — the Finvora-inspired landing, rebranded to AI payment recovery. */
export function Home() {
  const proof = useLiveProof();
  return (
    <>
      <Hero proof={proof} />
      <LogoCloud />
      <ExpertReview />
      <HowItMoves />
      <UnifyDark proof={proof} />
      <CashPosition proof={proof} />
      <Forecast />
      <Integrations />
      <ProofWall proof={proof} />
      <ConsoleTour />
      <FaqSection />
      <FinalCta />
    </>
  );
}
