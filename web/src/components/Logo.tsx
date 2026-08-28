/**
 * The Recoup brand mark — the lightning bolt served from web/public/logo.svg.
 * Swap that file to rebrand everywhere at once (the favicon uses web/public/favicon.svg).
 */
export function Logo({ className = 'h-9 w-9' }: { className?: string }) {
  return <img src="/logo.svg" alt="Recoup" className={`object-contain ${className}`} />;
}
