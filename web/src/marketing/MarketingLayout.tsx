import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Nav } from './Nav';
import { Footer } from './Footer';

/**
 * Shell for the public pages (Home / Features / Pricing / About). Sets data-mkt on <html> so the
 * global cream ground applies (and the dashboard's slate gradient is dropped) while a marketing page
 * is mounted, then cleans up on unmount so the signed-in app keeps its own chrome.
 */
export function MarketingLayout() {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-mkt', '');
    return () => root.removeAttribute('data-mkt');
  }, []);

  return (
    <div className="min-h-screen bg-cream font-grotesk text-bark antialiased">
      <Nav />
      <main>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
