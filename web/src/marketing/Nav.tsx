import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Icon } from '../components/icons';
import { CTA, Container, cx } from './ui';
import { NAV } from './data';

/** Thin pine announcement rail above the nav — points at the live browser demo. */
function AnnounceBar() {
  return (
    <Link to="/app" className="group block bg-pine-900 text-cream/85 transition-colors hover:text-cream">
      <Container className="flex items-center justify-center gap-2 py-2 text-center text-[12px]">
        <span className="inline-flex h-4 items-center rounded-full bg-mint/15 px-2 text-[10px] font-bold uppercase tracking-wider text-mint">New</span>
        <span className="font-medium">Attack the compliance guardrails live in the browser demo</span>
        <Icon name="arrow" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </Container>
    </Link>
  );
}

export function Nav() {
  const [open, setOpen] = useState(false);
  const linkBase = 'text-sm font-medium transition-colors';
  return (
    <div className="sticky top-0 z-50">
      <AnnounceBar />
      <header className="border-b border-hair/70 bg-cream/85 backdrop-blur-md">
        <Container className="flex items-center justify-between py-3.5">
          <Link to="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
            <Logo className="h-8 w-8" />
            <span className="text-[17px] font-bold tracking-tight text-forest">Overwatch</span>
          </Link>

          <nav className="hidden items-center gap-9 md:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) => cx(linkBase, isActive ? 'text-forest' : 'text-bark/70 hover:text-forest')}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <Link to="/login" className="rounded-full px-3.5 py-2 text-sm font-semibold text-forest transition-colors hover:bg-forest/5">
              Sign in
            </Link>
            <CTA to="/app" icon={null}>Open the Console</CTA>
          </div>

          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-full text-forest transition-colors hover:bg-forest/5 md:hidden"
          >
            <Icon name={open ? 'arrowLeft' : 'queue'} className="h-5 w-5" />
          </button>
        </Container>

        {open && (
          <div className="border-t border-hair/70 bg-cream md:hidden">
            <Container className="flex flex-col gap-1 py-4">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === '/'}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) => cx('rounded-xl px-3 py-2.5 text-[15px] font-medium', isActive ? 'bg-forest/5 text-forest' : 'text-bark hover:bg-forest/5 hover:text-forest')}
                >
                  {n.label}
                </NavLink>
              ))}
              <div className="mt-2 flex items-center gap-2 border-t border-hair/70 pt-3">
                <Link to="/login" onClick={() => setOpen(false)} className="flex-1 rounded-full px-4 py-2.5 text-center text-sm font-semibold text-forest ring-1 ring-inset ring-hair">
                  Sign in
                </Link>
                <CTA to="/app" icon={null} className="flex-1" onClick={() => setOpen(false)}>Open the Console</CTA>
              </div>
            </Container>
          </div>
        )}
      </header>
    </div>
  );
}
