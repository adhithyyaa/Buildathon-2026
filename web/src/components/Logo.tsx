/**
 * The Overwatch brand mark — an emerald shield (guardianship / integrity) with a verified check.
 * Rendered inline so it stays crisp at every size and reads on both light and dark grounds; emerald is
 * self-coloured so callers don't need to set a tone. (Favicon lives in web/public/favicon.svg.)
 */
export function Logo({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" role="img" aria-label="Overwatch">
      <path
        d="M16 2.4l10.8 3.83a1 1 0 0 1 .66.94v7.2c0 6.86-4.62 11.86-10.9 14.02a1.6 1.6 0 0 1-1.12 0C9.16 26.23 4.54 21.23 4.54 14.37v-7.2a1 1 0 0 1 .66-.94L16 2.4z"
        fill="#059669"
      />
      <path
        d="M16 2.4l10.8 3.83a1 1 0 0 1 .66.94v7.2c0 6.86-4.62 11.86-10.9 14.02a1.6 1.6 0 0 1-1.12 0"
        fill="#047857"
      />
      <path d="M10.9 15.9l3.5 3.6 7.1-7.4" stroke="#ffffff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
