import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import NavBar from './NavBar.jsx';
import StatusBanner from '../components/StatusBanner.jsx';
import CandidateDrawer from '../components/CandidateDrawer.jsx';
import { useData } from '../context/DataContext.jsx';
import { useDrawer } from '../hooks/useDrawer.js';

/** Scroll to top on route change (unless navigating to an in-page anchor). */
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export default function Layout() {
  const { rerank, loadError } = useData();
  const { drawerId, closeDrawer } = useDrawer();

  return (
    <div className="min-h-screen">
      <ScrollToTop />
      <NavBar />
      <StatusBanner rerank={rerank} />
      {loadError && (
        <div className="mx-auto max-w-7xl px-4 pt-4">
          <div className="rounded-md border border-red-800/50 bg-red-950/50 px-4 py-2 text-sm text-red-400">
            Backend unreachable: {loadError} — start it with{' '}
            <code className="font-heading text-xs text-red-300">
              uvicorn web.backend.main:app --port 8000
            </code>
          </div>
        </div>
      )}
      <Outlet />
      <CandidateDrawer candidateId={drawerId} onClose={closeDrawer} />
    </div>
  );
}
