import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Radar, RefreshCw } from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { timeAgo } from '../utils/formatters.js';

const ROUTES = [
  { to: '/', label: 'Overview', end: true },
  { to: '/candidates', label: 'Candidates' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/talent-market', label: 'Market' },
  { to: '/methodology', label: 'Methodology' },
];

const SECTIONS = [
  { id: 'metrics', label: 'Metrics' },
  { id: 'funnel', label: 'Funnel' },
  { id: 'top', label: 'Top 100' },
];

/** Highlights the Overview section currently in view (scroll-spy). */
function useActiveSection(enabled) {
  const [active, setActive] = useState(null);
  useEffect(() => {
    if (!enabled) {
      setActive(null);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: '-40% 0px -55% 0px' }
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [enabled]);
  return active;
}

export default function NavBar() {
  const { results, health, rerank, startRerank } = useData();
  const { pathname } = useLocation();
  const onOverview = pathname === '/';
  const activeSection = useActiveSection(onOverview);
  const reranking = rerank.status === 'running';

  // re-render every 30s so "Last ranked: X ago" stays current
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const healthy = health?.status === 'ok' && health?.artifacts_loaded;

  return (
    <header className="sticky top-0 z-30 border-b border-border glass-strong">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <NavLink to="/" className="flex shrink-0 items-center gap-2.5">
          <Radar className="h-6 w-6 text-secondary text-glow" aria-hidden="true" />
          <span className="hidden font-heading text-lg font-semibold text-foreground text-glow lg:inline">
            Redrob Ranker
          </span>
        </NavLink>

        <nav className="flex items-center gap-1 overflow-x-auto" aria-label="Pages">
          {ROUTES.map((r) => (
            <NavLink
              key={r.to}
              to={r.to}
              end={r.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors duration-150
                 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                   isActive
                     ? 'bg-surface-hover font-medium text-foreground'
                     : 'text-slate-400 hover:bg-surface-hover hover:text-slate-200'
                 }`
              }
            >
              {r.label}
            </NavLink>
          ))}
        </nav>

        {onOverview && (
          <nav
            className="hidden items-center gap-1 border-l border-border pl-3 xl:flex"
            aria-label="Overview sections"
          >
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() =>
                  document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' })
                }
                className={`cursor-pointer rounded-full px-2.5 py-0.5 text-xs transition-colors
                            duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                              activeSection === s.id
                                ? 'bg-primary/20 text-secondary'
                                : 'text-slate-500 hover:text-slate-300'
                            }`}
              >
                {s.label}
              </button>
            ))}
          </nav>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-4">
          <span className="hidden text-xs text-slate-500 md:inline">
            Last ranked: {timeAgo(results.generated_at)}
          </span>
          <span
            className="flex items-center gap-1.5 text-xs text-slate-400"
            title={
              healthy
                ? 'Backend healthy, artifacts loaded'
                : 'Backend unreachable or artifacts missing'
            }
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                healthy ? 'bg-emerald-500 animate-pulse-glow' : 'bg-destructive'
              }`}
            />
            <span className="hidden sm:inline">{healthy ? 'API healthy' : 'API down'}</span>
          </span>
          <button
            type="button"
            onClick={startRerank}
            disabled={reranking}
            className="flex cursor-pointer items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm
                       font-medium text-on-primary transition-all duration-200
                       hover:bg-amber-600 hover:shadow-glow-amber focus:outline-none focus-visible:ring-2
                       focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
                       disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${reranking ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">{reranking ? 'Ranking…' : 'Re-rank'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
