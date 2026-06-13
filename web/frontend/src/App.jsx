import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { DataProvider } from './context/DataContext.jsx';
import { ShortlistProvider } from './context/ShortlistContext.jsx';
import Layout from './layout/Layout.jsx';
import OverviewPage from './pages/OverviewPage.jsx';
import CandidatesPage from './pages/CandidatesPage.jsx';

// Heavy chart bundle (recharts) and the static story page load on demand.
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage.jsx'));
const TalentMarketPage = lazy(() => import('./pages/TalentMarketPage.jsx'));
const MethodologyPage = lazy(() => import('./pages/MethodologyPage.jsx'));
const ComparePage = lazy(() => import('./pages/ComparePage.jsx'));

function PageFallback() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-48 animate-pulse rounded-lg border border-border bg-muted" />
      ))}
    </div>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <DataProvider>
        <ShortlistProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<OverviewPage />} />
            <Route path="candidates" element={<CandidatesPage />} />
            <Route
              path="compare"
              element={
                <Suspense fallback={<PageFallback />}>
                  <ComparePage />
                </Suspense>
              }
            />
            <Route
              path="analytics"
              element={
                <Suspense fallback={<PageFallback />}>
                  <AnalyticsPage />
                </Suspense>
              }
            />
            <Route
              path="talent-market"
              element={
                <Suspense fallback={<PageFallback />}>
                  <TalentMarketPage />
                </Suspense>
              }
            />
            <Route
              path="methodology"
              element={
                <Suspense fallback={<PageFallback />}>
                  <MethodologyPage />
                </Suspense>
              }
            />
            <Route path="*" element={<OverviewPage />} />
          </Route>
        </Routes>
        </ShortlistProvider>
      </DataProvider>
    </MotionConfig>
  );
}
