/** The Recoup brand mark — a violet lightning bolt on a light rounded tile. */
export function Logo({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Recoup">
      <defs>
        <linearGradient id="recoupBolt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="23" height="23" rx="6.5" fill="#f5f3ff" stroke="#ddd6fe" />
      <g transform="translate(3.7 3.7) scale(0.69)">
        <path
          fill="url(#recoupBolt)"
          d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.75a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .913-.143Z"
        />
      </g>
    </svg>
  );
}
