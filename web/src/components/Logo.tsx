import { useId } from 'react';

/**
 * The Overwatch brand mark — a pine→fern gradient shield (guardianship / integrity) carrying a rising
 * "recovery" line that ends in an arrowhead: revenue watched over and brought back up. Rendered inline
 * so it stays crisp at every size and reads on both light and dark grounds. Gradient id is per-instance
 * (useId) so multiple logos on one page never collide. (Favicon mirrors this in web/public/favicon.svg.)
 */
export function Logo({ className = 'h-9 w-9' }: { className?: string }) {
  const gid = useId();
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" role="img" aria-label="Overwatch">
      <defs>
        <linearGradient id={gid} x1="5" y1="3" x2="27" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2b5348" />
          <stop offset="1" stopColor="#5fa47c" />
        </linearGradient>
      </defs>
      {/* shield */}
      <path
        d="M16 2.4l10.9 3.87a1.1 1.1 0 0 1 .73 1.04v6.98c0 6.98-4.7 12.06-11.06 14.25a1.45 1.45 0 0 1-1.14 0C9.07 26.35 4.37 21.27 4.37 14.29V7.31a1.1 1.1 0 0 1 .73-1.04L16 2.4z"
        fill={`url(#${gid})`}
      />
      {/* top gloss */}
      <path
        d="M16 2.4l10.9 3.87a1.1 1.1 0 0 1 .73 1.04v3.2C24.9 8.7 20.7 7.1 16 7.1S7.1 8.7 4.37 10.5V7.31A1.1 1.1 0 0 1 5.1 6.27L16 2.4z"
        fill="#ffffff"
        opacity="0.13"
      />
      {/* rising recovery line + arrowhead */}
      <path d="M9.4 19.3l3.9-4 2.7 2.5 5.2-5.6" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.4 12.2h3.3v3.2" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
