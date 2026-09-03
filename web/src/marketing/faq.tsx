import { Icon } from '../components/icons';
import { CTA, Container, Eyebrow, Heading, Lead } from './ui';
import { FAQS } from './data';

export function FaqSection({
  items = FAQS,
  eyebrow = 'FAQ',
  heading = 'Frequently asked questions',
  lead = 'Everything a merchant — or a judge — tends to ask before trusting a recovery engine with the money path.',
}: {
  items?: readonly { q: string; a: string }[];
  eyebrow?: string;
  heading?: string;
  lead?: string;
}) {
  return (
    <section id="faq" className="bg-cream py-16 sm:py-24">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>{eyebrow}</Eyebrow>
          <Heading className="mt-4">{heading}</Heading>
          <Lead className="mx-auto mt-5 max-w-xl">{lead}</Lead>
        </div>

        <div className="mx-auto mt-12 max-w-3xl divide-y divide-hair rounded-2xl border border-hair bg-white px-5 sm:px-7">
          {items.map((f) => (
            <details key={f.q} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left [&::-webkit-details-marker]:hidden">
                <span className="text-[15px] font-semibold text-forest">{f.q}</span>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-cream text-moss ring-1 ring-inset ring-hair transition-transform duration-200 group-open:rotate-45">
                  <Icon name="chevron" className="hidden h-4 w-4" />
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                </span>
              </summary>
              <p className="-mt-1 pb-5 pr-10 text-sm leading-relaxed text-bark">{f.a}</p>
            </details>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-fog">Still weighing it up? The whole thing runs live in your browser.</p>
          <CTA to="/app" variant="ghost">Open the live demo</CTA>
        </div>
      </Container>
    </section>
  );
}
