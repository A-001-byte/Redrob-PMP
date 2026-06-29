import { useEffect, useState } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import NavBar from './NavBar.jsx';
import StatusBanner from '../components/StatusBanner.jsx';
import CandidateDrawer from '../components/CandidateDrawer.jsx';
import { useData } from '../context/DataContext.jsx';
import { useDrawer } from '../hooks/useDrawer.js';
import { useAuth } from '../context/AuthContext.jsx';

/** Scroll to top on route change (unless navigating to an in-page anchor). */
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

const PAGE_TITLES = {
  '/': 'Overview',
  '/candidates': 'Candidates',
  '/compare': 'Compare',
  '/analytics': 'Analytics',
  '/talent-market': 'Talent Market',
  '/ai-insights': 'AI Insights',
  '/methodology': 'Ranking Methodology',
  '/audit-trail': 'Audit Trail',
};

export default function Layout() {
  const { user } = useAuth();

  const { rerank, loadError } = useData();
  const { drawerId, closeDrawer } = useDrawer();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const { pathname } = useLocation();

  // Layout position state (left sidebar vs top navbar)
  const [navPosition, setNavPosition] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedPos = localStorage.getItem('navPosition');
      if (savedPos === 'top' || savedPos === 'left') return savedPos;
    }
    return 'left';
  });

  useEffect(() => {
    localStorage.setItem('navPosition', navPosition);
  }, [navPosition]);

  // Theme state with system preference detection
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme) return savedTheme;
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    
    // 1. Add transition class
    root.classList.add('theme-transition');
    
    // 2. Force a reflow so the browser registers the transition class before we change the theme
    // eslint-disable-next-line no-unused-expressions
    window.getComputedStyle(root).opacity;
    
    // 3. Apply the theme
    if (theme === 'dark') {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }

    // 4. Remove transition class after animation completes
    const timeout = setTimeout(() => root.classList.remove('theme-transition'), 400);
    return () => clearTimeout(timeout);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const getPageTitle = () => {
    return PAGE_TITLES[pathname] || pathname.replace('/', '').split('-').map(
      (word) => word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className={`flex min-h-screen bg-background text-foreground font-body overflow-x-hidden transition-colors duration-200 ${
      navPosition === 'top' ? 'flex-col' : ''
    }`}>
      <ScrollToTop />
      <NavBar
        expanded={sidebarExpanded}
        setExpanded={setSidebarExpanded}
        theme={theme}
        toggleTheme={toggleTheme}
        navPosition={navPosition}
        setNavPosition={setNavPosition}
      />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 min-h-screen transition-all duration-300 ease-in-out ${
          navPosition === 'left'
            ? `${sidebarExpanded ? 'lg:pl-60' : 'lg:pl-[72px]'} pt-14 lg:pt-0`
            : 'pt-14 lg:pt-14'
        }`}
      >
        {/* Top breadcrumb bar — editorial, minimal (only in left mode) */}
        {navPosition === 'left' && (
          <header className="hidden lg:flex sticky top-0 z-30 h-12 bg-background/80 backdrop-blur-sm border-b border-border/60 items-center px-6 transition-colors duration-200">
            <div className="flex items-center gap-2">
              <span className="text-label font-semibold text-muted/50">
                Glasshouse
              </span>
              <span className="text-muted/25 text-xs">/</span>
              <span className="text-body-sm font-semibold text-foreground">
                {getPageTitle()}
              </span>
            </div>
          </header>
        )}

        <StatusBanner rerank={rerank} />
        {loadError && (
          <div className="mx-auto w-full max-w-7xl px-4 pt-4">
            <div className="rounded border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
              Backend unreachable: {loadError} — start it with{' '}
              <code className="font-mono text-xs text-rose-400 bg-black/40 px-1.5 py-0.5 rounded border border-white/5">
                uvicorn web.backend.main:app --port 8000
              </code>
            </div>
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="flex-1"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </div>
      <CandidateDrawer candidateId={drawerId} onClose={closeDrawer} />
    </div>
  );
}
