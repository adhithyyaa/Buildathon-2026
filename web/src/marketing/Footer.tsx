import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Container } from './ui';
import { FOOTER_COLS } from './data';

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-pine-900 text-cream">
      <Container className="relative z-10 pt-16 pb-8">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <Link to="/" className="flex items-center gap-2.5">
              <Logo className="h-8 w-8" />
              <span className="text-lg font-bold tracking-tight text-cream">Overwatch</span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-cream/60">
              The revenue-integrity layer for Razorpay — calibrated decisions, bounded execution, and
              holdout-measured proof of every recovered rupee.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-cream/10 px-3 py-1.5 font-mono text-[11px] text-cream/70">
              <span className="h-1.5 w-1.5 rounded-full bg-mint" /> hello@overwatch.dev
            </div>
          </div>

          {FOOTER_COLS.map((col) => (
            <div key={col.title}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-mint">{col.title}</div>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link to={l.to} className="text-sm text-cream/70 transition-colors hover:text-cream">{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-pineline/60 pt-6 text-[13px] text-cream/55 sm:flex-row">
          <span>© 2026 Overwatch · Where nothing slips through.</span>
          <span className="font-mono text-[12px]">Razorpay AI Buildathon 2026 · Track 03</span>
        </div>
      </Container>

      {/* Oversized ghost wordmark, matching the reference footer. */}
      <div aria-hidden className="pointer-events-none select-none px-2">
        <div className="font-display font-semibold leading-none tracking-[-0.03em] text-cream/[0.055]" style={{ fontSize: 'clamp(4rem, 19vw, 20rem)' }}>
          OVERWATCH
        </div>
      </div>
    </footer>
  );
}
