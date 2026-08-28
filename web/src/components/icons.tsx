// A small, self-contained outline icon set (24-grid, currentColor stroke) so the app never depends
// on an icon CDN and every glyph shares one weight and corner style — part of the product look.

const PATHS: Record<string, string> = {
  // nav
  overview: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  queue: 'M4 6h16M4 12h16M4 18h11',
  pipeline: 'M3 12h3l3-7 4 14 3-9 2 2h3',
  model: 'M8 8h8v8H8zM10.5 10.5h3v3h-3zM9.5 3v2M14.5 3v2M9.5 19v2M14.5 19v2M3 9.5h2M3 14.5h2M19 9.5h2M19 14.5h2',
  lab: 'M9 3h6M10 3v5L5.6 16.8A2 2 0 007.4 20h9.2a2 2 0 001.8-3.2L14 8V3M8.5 14h7',
  evidence: 'M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6zM9 12l2 2 4-4',

  // modules
  bolt: 'M13 3 5 13h5l-1 8 9-11h-6z',
  shield: 'M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z',
  link: 'M10 14a4 4 0 006 0l3-3a4 4 0 00-6-6l-1 1M14 10a4 4 0 00-6 0l-3 3a4 4 0 006 6l1-1',
  signal: 'M5 20v-4M10 20v-9M15 20V7M20 20V4',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  transfer: 'M4 9h13l-4-4M20 15H7l4 4',
  audit: 'M8 4h8v3H8zM6 6h12v14H6zM9 12.5l1.8 1.8L14.5 10',

  // ui / actions
  refresh: 'M5 12a7 7 0 0112-5M19 12a7 7 0 01-12 5M17 4v3h-3M7 20v-3h3',
  play: 'M7 5l12 7-12 7z',
  pause: 'M8 5h3v14H8zM13 5h3v14h-3z',
  power: 'M12 4v8M7.2 7a7 7 0 109.6 0',
  search: 'M11 5a6 6 0 104 10 6 6 0 00-4-10zM20 20l-4-4',
  external: 'M14 4h6v6M20 4 11 13M18 14v5H5V6h5',
  chevron: 'M6 9l6 6 6-6',
  check: 'M5 13l4 4 10-10',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  arrowLeft: 'M19 12H5M11 18l-6-6 6-6',
  filter: 'M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z',
  trendUp: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM5 20a7 7 0 0114 0',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  mail: 'M4 5h16v14H4zM4 6l8 6 8-6',
};

export function Icon({ name, className = 'h-5 w-5' }: { name: string; className?: string }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
