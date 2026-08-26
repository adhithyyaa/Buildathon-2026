export interface NavItem {
  path: string;
  label: string;
  icon: string;
  subtitle: string;
}

export const NAV: NavItem[] = [
  { path: '/', label: 'Overview', icon: 'overview', subtitle: 'Recovery at a glance and everything the engine does' },
  { path: '/queue', label: 'Recovery Queue', icon: 'queue', subtitle: 'Every at-risk case, ranked by risk and urgency' },
  { path: '/pipeline', label: 'Pipeline', icon: 'pipeline', subtitle: 'How a failed payment travels from caught to recovered' },
  { path: '/model', label: 'ML Model', icon: 'model', subtitle: 'The models that decide, and how well they are calibrated' },
  { path: '/lab', label: 'Recovery Lab', icon: 'lab', subtitle: 'Incremental ₹ recovered versus a live control holdout' },
  { path: '/evidence', label: 'Evidence', icon: 'evidence', subtitle: 'A real Razorpay test-mode capture, verified end to end' },
];

export function pageForPath(pathname: string): { label: string; subtitle: string } {
  if (pathname.startsWith('/cases/')) return { label: 'Case detail', subtitle: 'The full decision story for one recovery case' };
  const exact = NAV.find((n) => n.path === pathname);
  if (exact) return { label: exact.label, subtitle: exact.subtitle };
  const pref = NAV.find((n) => n.path !== '/' && pathname.startsWith(n.path));
  return pref ? { label: pref.label, subtitle: pref.subtitle } : { label: 'Overview', subtitle: NAV[0]!.subtitle };
}
