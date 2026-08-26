import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import './index.css';
import { RefreshProvider } from './lib/refresh';
import { ToastProvider } from './lib/toast';
import { Layout } from './components/Layout';
import { Overview } from './pages/Overview';
import { QueuePage } from './pages/QueuePage';
import { PipelinePage } from './pages/PipelinePage';
import { ModelPage } from './pages/ModelPage';
import { LabPage } from './pages/LabPage';
import { EvidencePage } from './pages/EvidencePage';
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
      <RefreshProvider>
        <ToastProvider>
          <Layout>
            <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/queue" element={<QueuePage />} />
            <Route path="/pipeline" element={<PipelinePage />} />
            <Route path="/model" element={<ModelPage />} />
            <Route path="/lab" element={<LabPage />} />
            <Route path="/evidence" element={<EvidencePage />} />
              <Route path="/cases/:id" element={<CasePage />} />
            </Routes>
          </Layout>
        </ToastProvider>
      </RefreshProvider>
    </BrowserRouter>
  </StrictMode>,
);

// Entrance animations play once on first load; mark the app loaded so client-side navigations
// don't replay the fade-and-rise on every page (which read as a glitch).
window.setTimeout(() => document.documentElement.setAttribute('data-loaded', ''), 700);
