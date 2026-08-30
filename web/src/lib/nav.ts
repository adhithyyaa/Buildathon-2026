export interface NavItem {
  path: string;
  label: string;
  icon: string;
  subtitle: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'MENU',
    items: [
      { path: '/app', label: 'Overview', icon: 'overview', subtitle: 'Recovery at a glance and everything the engine does' },
      { path: '/app/queue', label: 'Recovery Queue', icon: 'queue', subtitle: 'Every at-risk case, ranked by risk and urgency' },
      { path: '/app/pipeline', label: 'Pipeline', icon: 'pipeline', subtitle: 'How a failed payment travels from caught to recovered' },
    ],
  },
  {
    title: 'INTELLIGENCE',
    items: [
      { path: '/app/model', label: 'ML Model', icon: 'model', subtitle: 'The models that decide, and how well they are calibrated' },
      { path: '/app/lab', label: 'Recovery Lab', icon: 'lab', subtitle: 'Incremental ₹ recovered versus a live control holdout' },
      { path: '/app/evidence', label: 'Evidence', icon: 'evidence', subtitle: 'A real Razorpay test-mode capture, verified end to end' },
    ],
  },
  {
    title: 'GOVERNANCE',
    items: [
      { path: '/app/rigor', label: 'Rigor', icon: 'check', subtitle: 'Every independent check that proves the system — in one scorecard' },
      { path: '/app/compliance', label: 'Compliance', icon: 'shield', subtitle: 'Attack the India-payments guardrails; judged by independent regulatory oracles' },
    ],
  },
];

export const NAV: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

export function pageForPath(pathname: string): { label: string; subtitle: string } {
  if (pathname.startsWith('/app/cases/')) return { label: 'Case detail', subtitle: 'The full decision story for one recovery case' };
  const exact = NAV.find((n) => n.path === pathname);
  if (exact) return { label: exact.label, subtitle: exact.subtitle };
  const pref = NAV.find((n) => n.path !== '/app' && pathname.startsWith(n.path));
  return pref ? { label: pref.label, subtitle: pref.subtitle } : { label: 'Overview', subtitle: NAV[0]!.subtitle };
}
