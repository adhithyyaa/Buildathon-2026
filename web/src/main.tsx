import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import { RefreshProvider } from './lib/refresh';
import { Layout } from './components/Layout';
import { Overview } from './pages/Overview';
import { QueuePage } from './pages/QueuePage';
import { PipelinePage } from './pages/PipelinePage';
import { ModelPage } from './pages/ModelPage';
import { LabPage } from './pages/LabPage';
import { EvidencePage } from './pages/EvidencePage';
import { CasePage } from './pages/CasePage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <RefreshProvider>
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
      </RefreshProvider>
    </BrowserRouter>
  </StrictMode>,
);
