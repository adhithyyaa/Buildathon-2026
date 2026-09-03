import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import './index.css';
import { RefreshProvider } from './lib/refresh';
import { ToastProvider } from './lib/toast';
import { AuthProvider } from './lib/auth';
import { RequireAuth } from './components/RequireAuth';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { MarketingLayout } from './marketing/MarketingLayout';
import { Home } from './pages/Home';
import { Features } from './pages/Features';
import { Pricing } from './pages/Pricing';
import { About } from './pages/About';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { QueuePage } from './pages/QueuePage';
import { PipelinePage } from './pages/PipelinePage';
import { ModelPage } from './pages/ModelPage';
import { LabPage } from './pages/LabPage';
import { EvidencePage } from './pages/EvidencePage';
import { CompliancePage } from './pages/CompliancePage';
import { RigorPage } from './pages/RigorPage';
import { CasePage } from './pages/CasePage';

/** Reset scroll to the top on every client-side navigation. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
        <RefreshProvider>
          <ToastProvider>
            <ErrorBoundary>
            <Routes>
              {/* Marketing site — public pages behind the shared cream/pine shell */}
              <Route element={<MarketingLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/features" element={<Features />} />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/about" element={<About />} />
              </Route>
              <Route path="/login" element={<Login />} />
              {/* App — the dashboard lives under /app, gated by sign-in, behind the sidebar shell */}
              <Route element={<RequireAuth />}>
                <Route path="/app" element={<Layout />}>
                  <Route index element={<Overview />} />
                  <Route path="queue" element={<QueuePage />} />
                  <Route path="pipeline" element={<PipelinePage />} />
                  <Route path="model" element={<ModelPage />} />
                  <Route path="lab" element={<LabPage />} />
                  <Route path="evidence" element={<EvidencePage />} />
                  <Route path="compliance" element={<CompliancePage />} />
                  <Route path="rigor" element={<RigorPage />} />
                  <Route path="cases/:id" element={<CasePage />} />
                </Route>
              </Route>
            </Routes>
            </ErrorBoundary>
          </ToastProvider>
        </RefreshProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

// Entrance animations play once on first load; mark the app loaded so client-side navigations
// don't replay the fade-and-rise on every page (which read as a glitch).
window.setTimeout(() => document.documentElement.setAttribute('data-loaded', ''), 700);
