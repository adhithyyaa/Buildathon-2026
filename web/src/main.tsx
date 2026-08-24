import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { CasePage } from './pages/CasePage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cases/:id" element={<CasePage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  </StrictMode>,
);
