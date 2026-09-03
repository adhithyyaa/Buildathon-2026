import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../components/ui';
import { Icon } from '../components/icons';

/**
 * Marketing design-system primitives — the warm-paper / deep-pine identity shared by the public pages
 * (Home, Features, About). Serif display (DM Serif Display) for headings, grotesk for everything else.
 * Kept separate from components/ui.tsx, which is the dashboard's slate/emerald system.
 */

export { cx };

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto w-full max-w-6xl px-5 lg:px-8', className)}>{children}</div>;
}

/** Small uppercase kicker above a heading. `dark` flips it for pine backgrounds. */
export function Eyebrow({ children, dark = false, icon }: { children: ReactNode; dark?: boolean; icon?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em]', dark ? 'text-mint' : 'text-moss')}>
      {icon ? <Icon name={icon} className="h-3.5 w-3.5" /> : <span className={cx('h-1.5 w-1.5 rounded-full', dark ? 'bg-mint' : 'bg-moss')} />}
      {children}
    </span>
  );
}

/** DM Serif Display heading. `dark` renders cream for pine sections. */
export function Heading({
  children,
  as: Tag = 'h2',
  size = 'lg',
  dark = false,
  className,
}: {
  children: ReactNode;
  as?: 'h1' | 'h2' | 'h3';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  dark?: boolean;
  className?: string;
}) {
  const sizes: Record<string, string> = {
    sm: 'text-[1.5rem] sm:text-[1.75rem]',
    md: 'text-[1.9rem] sm:text-[2.3rem]',
    lg: 'text-[2.2rem] sm:text-[2.9rem]',
    xl: 'text-[2.6rem] sm:text-[3.6rem]',
  };
  return (
    <Tag className={cx('font-display font-semibold leading-[1.06] tracking-[-0.02em] text-balance', sizes[size], dark ? 'text-cream' : 'text-forest', className)}>
      {children}
    </Tag>
  );
}

export function Lead({ children, dark = false, className }: { children: ReactNode; dark?: boolean; className?: string }) {
  return <p className={cx('text-[15px] leading-relaxed sm:text-base', dark ? 'text-cream/75' : 'text-bark', className)}>{children}</p>;
}

type CTAProps = {
  children: ReactNode;
  to?: string;
  href?: string;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'darkghost' | 'cream';
  size?: 'md' | 'lg';
  className?: string;
  icon?: string | null;
};

/** One button that can be a router Link, an anchor, or a plain button — pill-shaped, pine identity. */
export function CTA({ children, to, href, onClick, variant = 'primary', size = 'md', className, icon = 'arrow' }: CTAProps) {
  const variants: Record<string, string> = {
    primary: 'bg-pine text-cream hover:bg-pine-700 shadow-sm shadow-pine/20',
    cream: 'bg-cream text-pine hover:bg-white',
    ghost: 'bg-white text-forest ring-1 ring-inset ring-hair hover:ring-pine/30 hover:bg-white',
    darkghost: 'bg-transparent text-cream ring-1 ring-inset ring-cream/25 hover:bg-cream/10',
  };
  const sizes: Record<string, string> = { md: 'px-5 py-2.5 text-sm', lg: 'px-6 py-3 text-[15px]' };
  const cls = cx(
    'group inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-fern focus-visible:ring-offset-2 focus-visible:ring-offset-cream cursor-pointer',
    variants[variant],
    sizes[size],
    className,
  );
  const inner = (
    <>
      {children}
      {icon && <Icon name={icon} className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
    </>
  );
  if (to) return <Link to={to} className={cls} onClick={onClick}>{inner}</Link>;
  if (href) return <a href={href} className={cls} onClick={onClick}>{inner}</a>;
  return <button type="button" className={cls} onClick={onClick}>{inner}</button>;
}

/** Section vertical rhythm + optional tone (cream default / oat band / pine dark). */
export function Section({
  children,
  id,
  tone = 'cream',
  className,
}: {
  children: ReactNode;
  id?: string;
  tone?: 'cream' | 'oat' | 'pine' | 'white';
  className?: string;
}) {
  const tones: Record<string, string> = {
    cream: 'bg-cream text-bark',
    white: 'bg-white text-bark',
    oat: 'bg-oat text-bark',
    pine: 'bg-pine text-cream',
  };
  return (
    <section id={id} className={cx('py-16 sm:py-24', tones[tone], className)}>
      {children}
    </section>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-2xl border border-hair bg-white', className)}>{children}</div>;
}

export function CheckRow({ children, on = 'light' }: { children: ReactNode; on?: 'light' | 'dark' }) {
  return (
    <li className={cx('flex items-start gap-2.5 text-sm', on === 'dark' ? 'text-cream/85' : 'text-bark')}>
      <span className={cx('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full', on === 'dark' ? 'bg-mint/20 text-mint' : 'bg-fern/15 text-moss')}>
        <Icon name="check" className="h-3.5 w-3.5" />
      </span>
      {children}
    </li>
  );
}

export function Stars({ value = 4.9, className }: { value?: number; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5', className)}>
      <span className="flex">
        {Array.from({ length: 5 }).map((_, i) => (
          <svg key={i} viewBox="0 0 24 24" className="h-3.5 w-3.5" fill={i < Math.round(value) ? '#d7ac5f' : 'none'} stroke="#d7ac5f" strokeWidth="1.5">
            <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.8 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" />
          </svg>
        ))}
      </span>
      <span className="font-semibold text-forest tabular-nums">{value.toFixed(1)}</span>
    </span>
  );
}

/** Monogram avatar (initials) — the honest stand-in for a photo in the proof wall. */
export function Monogram({ initials, className }: { initials: string; className?: string }) {
  return (
    <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pine/10 text-[12px] font-bold tracking-tight text-pine ring-1 ring-inset ring-pine/15', className)}>
      {initials}
    </span>
  );
}

/** A macOS-style browser window used for the product mocks. */
export function BrowserFrame({ url = 'app.overwatch.ai', children, className }: { url?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('overflow-hidden rounded-2xl border border-hair bg-white shadow-xl shadow-forest/10', className)}>
      <div className="flex items-center gap-1.5 border-b border-hair/70 bg-cream/50 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-hair" />
        <span className="h-2.5 w-2.5 rounded-full bg-hair" />
        <span className="h-2.5 w-2.5 rounded-full bg-hair" />
        <span className="ml-3 rounded-md bg-white px-2 py-0.5 font-mono text-[10.5px] text-fog ring-1 ring-inset ring-hair/80">{url}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

/** A phone shell for the mobile mocks. */
export function PhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('relative mx-auto w-[248px] rounded-[2.4rem] border-[6px] border-forest bg-forest p-1.5 shadow-2xl shadow-forest/25', className)}>
      <div className="absolute left-1/2 top-2.5 z-10 h-1.5 w-16 -translate-x-1/2 rounded-full bg-cream/20" />
      <div className="overflow-hidden rounded-[1.9rem] bg-cream">{children}</div>
    </div>
  );
}

/** Fade-and-rise on scroll into view (respects reduced-motion via the global media query on transitions). */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (setShown(true), io.disconnect())),
      { threshold: 0.1, rootMargin: '0px 0px -6% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ transitionDelay: `${delay}ms` }} className={cx('transition-all duration-700 ease-out will-change-transform', shown ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0', className)}>
      {children}
    </div>
  );
}

/** Faint dotted-grid backdrop used behind hero-style sections. */
export const dotGrid: React.CSSProperties = {
  backgroundImage: 'radial-gradient(rgba(31,61,51,0.06) 1px, transparent 1px)',
  backgroundSize: '22px 22px',
};
