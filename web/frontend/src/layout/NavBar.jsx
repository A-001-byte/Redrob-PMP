import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radar,
  RefreshCw,
  LayoutGrid,
  Users,
  Columns3,
  BarChart3,
  Globe,
  BrainCircuit,
  BookOpen,
  ClipboardList,
  Settings,
  Sun,
  Moon,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { timeAgo } from '../utils/formatters.js';

/* ─── Navigation Architecture ─────────────────────────────────────────
 * Groups are semantic clusters, not arbitrary lists.
 * Each group is separated by a hairline + generous whitespace.
 * ────────────────────────────────────────────────────────────────────── */

const NAV_GROUPS = [
  {
    label: 'Workspace',
    items: [
      { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
      { to: '/candidates', label: 'Candidates', icon: Users },
      { to: '/compare', label: 'Compare', icon: Columns3 },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/talent-market', label: 'Talent Market', icon: Globe },
      { to: '/ai-insights', label: 'AI Insights', icon: BrainCircuit, placeholder: true },
    ],
  },
  {
    label: 'Pipeline',
    items: [
      { to: '/methodology', label: 'Ranking Methodology', icon: BookOpen },
      { to: '/audit-trail', label: 'Audit Trail', icon: ClipboardList, placeholder: true },
    ],
  },
];

export default function NavBar({ expanded, setExpanded, theme, toggleTheme, navPosition, setNavPosition }) {
  const { results, health, rerank, startRerank } = useData();
  const { pathname } = useLocation();
  const reranking = rerank.status === 'running';

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = () => setActiveDropdown(null);
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  // Tick every 30s so "Last sync" stays fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const healthy = health?.status === 'ok' && health?.artifacts_loaded;

  /* ── Shared sub-components ──────────────────────────────────────── */

  const BrandMark = ({ onClick }) => (
    <NavLink
      to="/"
      onClick={onClick}
      className="group flex items-center gap-2.5 px-1 transition-colors duration-200"
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/8 text-primary transition-all duration-500 group-hover:bg-primary/12">
        <Radar className="h-4 w-4 transition-transform duration-700 group-hover:rotate-90" />
      </div>
      <span className="text-body-sm font-semibold tracking-tight text-foreground transition-colors duration-200 group-hover:text-primary">
        Glasshouse
      </span>
    </NavLink>
  );

  const GroupLabel = ({ label }) => (
    <span
      className="block px-3 pb-2 pt-0 text-label text-muted/70 select-none uppercase"
      aria-hidden="true"
    >
      {label}
    </span>
  );

  const NavItem = ({ item, onClick, isTop = false }) => {
    const Icon = item.icon;
    const isActive =
      pathname === item.to || (item.to !== '/' && pathname.startsWith(item.to));

    return (
      <NavLink
        to={item.placeholder ? '#' : item.to}
        end={item.end}
        onClick={(e) => {
          if (item.placeholder) e.preventDefault();
          onClick?.();
        }}
        className={`group relative flex items-center gap-2 px-3 transition-colors duration-200 outline-none ${
          isTop ? 'h-[38px] text-body-sm rounded hover:bg-surface-hover/20' : 'py-[7px] text-body-sm'
        } ${
          isActive
            ? 'font-semibold text-foreground'
            : item.placeholder
              ? 'cursor-default text-muted/40'
              : 'text-muted hover:text-foreground'
        }`}
        tabIndex={item.placeholder ? -1 : 0}
        aria-current={isActive ? 'page' : undefined}
      >
        {/* Active indicator — bottom for top nav, left for sidebar */}
        {isActive && (
          <motion.span
            layoutId={isTop ? 'nav-active-accent-top' : 'nav-active-accent'}
            className={isTop 
              ? 'absolute bottom-0 left-3 right-3 h-[2px] bg-primary' 
              : 'absolute left-0 top-1 bottom-1 w-[2px] bg-primary'}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          />
        )}
        <Icon
          className={`${isTop ? 'h-3.5 w-3.5' : 'h-[15px] w-[15px]'} shrink-0 transition-colors duration-200 ${
            isActive
              ? 'text-primary'
              : item.placeholder
                ? 'text-muted/30'
                : 'text-muted/60 group-hover:text-muted'
          }`}
        />
        <span className="truncate">{item.label}</span>
        {item.placeholder && (
          <span className="rounded-sm bg-muted/8 px-1 py-0.5 text-label uppercase text-muted/40">
            Soon
          </span>
        )}
      </NavLink>
    );
  };

  const SystemSection = () => (
    <div className="flex flex-col gap-0.5">
      <NavLink
        to="#"
        onClick={(e) => e.preventDefault()}
        className="group flex items-center gap-3 px-3 py-[7px] text-body-sm font-medium text-muted/40 cursor-default"
        tabIndex={-1}
      >
        <Settings className="h-[15px] w-[15px] shrink-0 text-muted/30" />
        <span>Settings</span>
        <span className="ml-auto rounded-sm bg-muted/8 px-1.5 py-0.5 text-label uppercase text-muted/40">
          Soon
        </span>
      </NavLink>
    </div>
  );

  const StatusFooter = () => (
    <div className="flex flex-col gap-3">
      {/* Re-rank Pipeline */}
      <button
        type="button"
        onClick={startRerank}
        disabled={reranking}
        className="flex w-full items-center justify-center gap-2 rounded bg-primary px-3 py-2 text-body-sm font-semibold text-white transition-all duration-200 hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${reranking ? 'animate-spin' : ''}`} />
        <span>{reranking ? 'Running Pipeline…' : 'Re-rank Pipeline'}</span>
      </button>

      {/* Status indicators */}
      <div className="space-y-2 px-0.5">
        {/* Pipeline Status */}
        <div className="flex items-center justify-between">
          <span className="text-caption text-muted/60">Pipeline Status</span>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-[5px] w-[5px]">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                  reranking
                    ? 'bg-support'
                    : rerank.status === 'error'
                      ? 'bg-danger'
                      : 'bg-accent'
                }`}
              />
              <span
                className={`relative inline-flex h-[5px] w-[5px] rounded-full ${
                  reranking
                    ? 'bg-support'
                    : rerank.status === 'error'
                      ? 'bg-danger'
                      : 'bg-accent'
                }`}
              />
            </span>
            <span
              className={`text-caption ${
                reranking
                  ? 'text-support'
                  : rerank.status === 'error'
                    ? 'text-danger'
                    : 'text-accent'
              }`}
            >
              {reranking ? 'Processing' : rerank.status === 'error' ? 'Error' : 'Idle'}
            </span>
          </div>
        </div>

        {/* API Health */}
        <div className="flex items-center justify-between">
          <span className="text-caption text-muted/60">API Health</span>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-[5px] w-[5px]">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                  healthy ? 'bg-accent' : 'bg-danger'
                }`}
              />
              <span
                className={`relative inline-flex h-[5px] w-[5px] rounded-full ${
                  healthy ? 'bg-accent' : 'bg-danger'
                }`}
              />
            </span>
            <span
              className={`text-caption ${
                healthy ? 'text-accent' : 'text-danger'
              }`}
            >
              {healthy ? 'Operational' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Last Sync */}
        <div className="flex items-center justify-between">
          <span className="text-caption text-muted/60">Last Sync</span>
          <span className="font-mono text-data-sm text-muted/80">
            {results.generated_at ? timeAgo(results.generated_at) : '—'}
          </span>
        </div>
      </div>
    </div>
  );

  /* ── 1. Top Navigation Bar ───────────────────────────────────────── */
  if (navPosition === 'top') {
    return (
      <>
        <header className="fixed top-0 left-0 right-0 z-40 hidden lg:flex h-14 bg-sidebar border-b border-border items-center justify-between px-6 transition-colors duration-200">
          <div className="flex items-center gap-8">
            <BrandMark />

            {/* Top Links with dropdown menus */}
            <nav className="flex items-center gap-2.5" aria-label="Main navigation">
              {NAV_GROUPS.map((group) => {
                const isGroupActive = group.items.some(
                  (item) => pathname === item.to || (item.to !== '/' && pathname.startsWith(item.to))
                );

                return (
                  <div key={group.label} className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDropdown(activeDropdown === group.label ? null : group.label);
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-body-sm rounded transition-all duration-200 outline-none cursor-pointer ${
                        isGroupActive
                          ? 'text-foreground bg-surface/60 border border-border/60 font-semibold'
                          : 'text-muted hover:text-foreground hover:bg-surface-hover/20 font-medium'
                      }`}
                    >
                      <span>{group.label}</span>
                      <ChevronDown
                        className={`h-3.5 w-3.5 text-muted/60 transition-transform duration-200 ${
                          activeDropdown === group.label ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    <AnimatePresence>
                      {activeDropdown === group.label && (
                        <motion.div
                          initial={{ opacity: 0, y: 4, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 4, scale: 0.98 }}
                          transition={{ duration: 0.12 }}
                          className="absolute top-full left-0 mt-1.5 z-50 w-48 rounded-md border border-border bg-sidebar p-1"
                        >
                          <div className="flex flex-col gap-0.5">
                            {group.items.map((item) => {
                              const Icon = item.icon;
                              const isActive =
                                pathname === item.to || (item.to !== '/' && pathname.startsWith(item.to));

                              return (
                                <NavLink
                                  key={item.to}
                                  to={item.placeholder ? '#' : item.to}
                                  end={item.end}
                                  onClick={(e) => {
                                    if (item.placeholder) e.preventDefault();
                                    setActiveDropdown(null);
                                  }}
                                  className={`group flex items-center gap-2.5 px-2.5 py-1.5 text-body-sm rounded transition-colors duration-150 outline-none ${
                                    isActive
                                      ? 'bg-primary/8 text-primary font-semibold'
                                      : item.placeholder
                                        ? 'text-muted/30 cursor-default font-medium'
                                        : 'text-muted hover:text-foreground hover:bg-surface-hover/30 font-medium'
                                  }`}
                                  tabIndex={item.placeholder ? -1 : 0}
                                >
                                  <Icon
                                    className={`h-4 w-4 ${
                                      isActive ? 'text-primary' : 'text-muted/50 group-hover:text-muted'
                                    }`}
                                  />
                                  <span>{item.label}</span>
                                  {item.placeholder && (
                                    <span className="ml-auto rounded bg-muted/8 px-1 py-0.5 text-label uppercase text-muted/40">
                                      Soon
                                    </span>
                                  )}
                                </NavLink>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </nav>
          </div>

          {/* Right side options */}
          <div className="flex items-center gap-4">
            {/* Status indicators */}
            <div className="flex items-center gap-3.5 text-caption text-muted">
              {/* Pipeline Status */}
              <div className="flex items-center gap-1.5" title="Pipeline Status">
                <span className="relative flex h-[5px] w-[5px]">
                  <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                    reranking ? 'bg-support' : rerank.status === 'error' ? 'bg-danger' : 'bg-accent'
                  }`} />
                  <span className={`relative inline-flex h-[5px] w-[5px] rounded-full ${
                    reranking ? 'bg-support' : rerank.status === 'error' ? 'bg-danger' : 'bg-accent'
                  }`} />
                </span>
                <span className="font-semibold">{reranking ? 'Pipeline Running' : rerank.status === 'error' ? 'Pipeline Error' : 'Pipeline Idle'}</span>
              </div>

              {/* API Health */}
              <div className="flex items-center gap-1.5" title="API Health">
                <span className="relative flex h-[5px] w-[5px]">
                  <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                    healthy ? 'bg-accent' : 'bg-danger'
                  }`} />
                  <span className={`relative inline-flex h-[5px] w-[5px] rounded-full ${
                    healthy ? 'bg-accent' : 'bg-danger'
                  }`} />
                </span>
                <span className="font-semibold">{healthy ? 'API OK' : 'API Offline'}</span>
              </div>
            </div>

            {/* Re-rank Pipeline */}
            <button
              type="button"
              onClick={startRerank}
              disabled={reranking}
              className="flex items-center justify-center gap-1.5 rounded bg-primary px-3 py-1.5 text-caption font-semibold text-white transition-all duration-200 hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <RefreshCw className={`h-3 w-3 ${reranking ? 'animate-spin' : ''}`} />
              <span>{reranking ? 'Running…' : 'Re-rank'}</span>
            </button>

            {/* Theme toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'light' ? 'Dark Mode' : 'Light Mode'}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted/60 hover:text-foreground hover:bg-surface-hover/30 transition-colors duration-200 cursor-pointer"
            >
              {theme === 'light' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Switch Layout back to Sidebar */}
            <button
              type="button"
              onClick={() => setNavPosition('left')}
              title="Switch to Sidebar Layout"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted/60 hover:text-foreground hover:bg-surface-hover/30 transition-colors duration-200 cursor-pointer"
            >
              <Columns3 className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Mobile Header (same structure) */}
        <header className="fixed top-0 left-0 right-0 z-40 lg:hidden h-14 bg-sidebar border-b border-border flex items-center justify-between px-4">
          <BrandMark />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:text-foreground transition-colors duration-200 cursor-pointer"
              title="Toggle theme"
            >
              {theme === 'light' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setIsMobileOpen(true)}
              aria-label="Open navigation menu"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-muted hover:text-foreground transition-colors duration-200 cursor-pointer"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Mobile Drawer */}
        <AnimatePresence>
          {isMobileOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileOpen(false)}
                className="fixed inset-0 z-50 bg-foreground/8 lg:hidden"
              />
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 260 }}
                className="fixed inset-y-0 left-0 z-50 w-[280px] bg-sidebar border-r border-border flex flex-col lg:hidden"
              >
                {/* Drawer Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-4">
                  <BrandMark onClick={() => setIsMobileOpen(false)} />
                  <button
                    type="button"
                    onClick={() => setIsMobileOpen(false)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:text-foreground transition-colors duration-200 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Drawer Nav */}
                <nav className="flex-1 overflow-y-auto px-3 space-y-0" aria-label="Mobile navigation">
                  {NAV_GROUPS.map((group, gi) => (
                    <div key={group.label}>
                      {gi > 0 && (
                        <div className="mx-2 my-4 border-t border-border/60" />
                      )}
                      <GroupLabel label={group.label} />
                      <div className="flex flex-col gap-[2px]">
                        {group.items.map((item) => (
                          <NavItem
                            key={item.to}
                            item={item}
                            onClick={() => !item.placeholder && setIsMobileOpen(false)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  <div>
                    <div className="mx-2 my-4 border-t border-border/60" />
                    <GroupLabel label="System" />
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          toggleTheme();
                          setIsMobileOpen(false);
                        }}
                        className="group flex w-full items-center gap-3 px-3 py-[7px] text-body-sm font-medium text-muted transition-colors duration-200 hover:text-foreground outline-none cursor-pointer"
                      >
                        {theme === 'light' ? <Sun className="h-[15px] w-[15px] text-muted/60" /> : <Moon className="h-[15px] w-[15px] text-muted/60" />}
                        <span>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNavPosition('left');
                          setIsMobileOpen(false);
                        }}
                        className="group flex w-full items-center gap-3 px-3 py-[7px] text-body-sm font-medium text-muted transition-colors duration-200 hover:text-foreground outline-none cursor-pointer"
                      >
                        <Columns3 className="h-[15px] w-[15px] text-muted/60" />
                        <span>Sidebar Layout</span>
                      </button>
                    </div>
                  </div>
                </nav>

                {/* Drawer Bottom */}
                <div className="border-t border-border px-4 py-4">
                  <StatusFooter />
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </>
    );
  }

  /* ── 2. Desktop Rail (Left Mode) ────────────────────────────────── */
  return (
    <>
      <aside
        className={`fixed left-0 top-0 bottom-0 z-40 hidden lg:flex flex-col bg-sidebar border-r border-border transition-[width] duration-300 ease-in-out ${
          expanded ? 'w-60' : 'w-[72px]'
        }`}
      >
        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="absolute -right-3 top-7 z-50 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-muted hover:text-primary hover:border-primary/30 transition-all duration-200 focus:outline-none"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? (
            <ChevronLeft className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>


        <AnimatePresence mode="wait" initial={false}>
        {expanded ? (
          /* ── Expanded State ──────────────────────────────────────── */
          <motion.div
            key="sidebar-expanded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="flex h-full flex-col"
          >
            {/* Brand and Actions */}
            <div className="flex items-center justify-between px-5 pt-6 pb-6">
              <BrandMark />
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={toggleTheme}
                  title={theme === 'light' ? 'Dark Mode' : 'Light Mode'}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted/60 hover:text-foreground hover:bg-surface-hover/20 transition-all duration-200 cursor-pointer"
                >
                  {theme === 'light' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setNavPosition('top')}
                  title="Switch to Top Navigation"
                  className="flex h-7 w-7 items-center justify-center rounded text-muted/60 hover:text-foreground hover:bg-surface-hover/20 transition-all duration-200 cursor-pointer"
                >
                  <Columns3 className="h-3.5 w-3.5 rotate-90" />
                </button>
              </div>
            </div>

            {/* Navigation Groups */}
            <nav className="flex-1 overflow-y-auto px-3 space-y-0" aria-label="Main navigation">
              {NAV_GROUPS.map((group, gi) => (
                <div key={group.label}>
                  {gi > 0 && (
                    <div className="mx-2 my-4 border-t border-border/60" />
                  )}
                  <GroupLabel label={group.label} />
                  <div className="flex flex-col gap-[2px]">
                    {group.items.map((item) => (
                      <NavItem key={item.to} item={item} />
                    ))}
                  </div>
                </div>
              ))}

              {/* System group */}
              <div>
                <div className="mx-2 my-4 border-t border-border/60" />
                <GroupLabel label="System" />
                <SystemSection />
              </div>
            </nav>

            {/* Bottom Status */}
            <div className="border-t border-border px-4 py-4">
              <StatusFooter />
            </div>
          </motion.div>
        ) : (
          /* ── Collapsed State ─────────────────────────────────────── */
          <motion.div
            key="sidebar-collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="flex h-full flex-col items-center"
          >
            {/* Brand icon only */}
            <div className="pt-6 pb-5">
              <NavLink to="/" className="group flex h-8 w-8 items-center justify-center rounded-md bg-primary/8 text-primary hover:bg-primary/12 transition-all duration-300">
                <Radar className="h-4.5 w-4.5 transition-transform duration-700 group-hover:rotate-90" />
              </NavLink>
            </div>

            {/* Collapsed nav icons */}
            <nav className="flex-1 flex flex-col items-center gap-1 px-2 overflow-y-auto" aria-label="Main navigation">
              {NAV_GROUPS.flatMap((group, gi) => {
                const els = group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.to || (item.to !== '/' && pathname.startsWith(item.to));
                  return (
                    <NavLink
                      key={item.to}
                      to={item.placeholder ? '#' : item.to}
                      end={item.end}
                      onClick={(e) => item.placeholder && e.preventDefault()}
                      title={item.label}
                      className={`relative flex h-9 w-9 items-center justify-center rounded-md transition-all duration-200 ${
                        isActive
                          ? 'text-primary'
                          : item.placeholder
                            ? 'text-muted/25 cursor-default'
                            : 'text-muted/50 hover:text-foreground hover:bg-surface-hover/40'
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="nav-active-accent"
                          className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-primary"
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        />
                      )}
                      <Icon className="h-4 w-4" />
                    </NavLink>
                  );
                });
                // Add separator between groups
                if (gi > 0) {
                  return [
                    <div key={`sep-${gi}`} className="my-2 w-5 border-t border-border/50" />,
                    ...els,
                  ];
                }
                return els;
              })}

              {/* System icons */}
              <div className="my-2 w-5 border-t border-border/50" />
              <button
                type="button"
                title="Settings (Coming soon)"
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted/25 cursor-default"
                tabIndex={-1}
              >
                <Settings className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                title={theme === 'light' ? 'Dark Mode' : 'Light Mode'}
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted/50 hover:text-foreground transition-colors duration-200 cursor-pointer"
              >
                {theme === 'light' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => setNavPosition('top')}
                title="Switch to Top Navigation"
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted/50 hover:text-foreground transition-colors duration-200 cursor-pointer"
              >
                <Columns3 className="h-4 w-4 rotate-90" />
              </button>
            </nav>

            {/* Collapsed bottom */}
            <div className="border-t border-border px-2 py-3 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={startRerank}
                disabled={reranking}
                title="Re-rank Pipeline"
                className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-white hover:bg-primary/90 transition-all duration-200 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`h-4 w-4 ${reranking ? 'animate-spin' : ''}`} />
              </button>
              <div
                className="flex h-5 w-5 items-center justify-center"
                title={healthy ? 'API Operational' : 'API Offline'}
              >
                <span className="relative flex h-[6px] w-[6px]">
                  <span
                    className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                      healthy ? 'bg-accent' : 'bg-danger'
                    }`}
                  />
                  <span
                    className={`relative inline-flex h-[6px] w-[6px] rounded-full ${
                      healthy ? 'bg-accent' : 'bg-danger'
                    }`}
                  />
                </span>
              </div>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </aside>

      {/* ── Mobile Header ───────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-40 lg:hidden h-14 bg-sidebar border-b border-border flex items-center justify-between px-4">
        <BrandMark />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:text-foreground transition-colors duration-200 cursor-pointer"
            title="Toggle theme"
          >
            {theme === 'light' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setIsMobileOpen(true)}
            aria-label="Open navigation menu"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-muted hover:text-foreground transition-colors duration-200 cursor-pointer"
          >
            <Menu className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ── Mobile Drawer ───────────────────────────────────────────── */}
      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileOpen(false)}
              className="fixed inset-0 z-50 bg-foreground/8 lg:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 260 }}
              className="fixed inset-y-0 left-0 z-50 w-[280px] bg-sidebar border-r border-border flex flex-col lg:hidden"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-4">
                <BrandMark onClick={() => setIsMobileOpen(false)} />
                <button
                  type="button"
                  onClick={() => setIsMobileOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:text-foreground transition-colors duration-200 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Drawer Nav */}
              <nav className="flex-1 overflow-y-auto px-3 space-y-0" aria-label="Mobile navigation">
                {NAV_GROUPS.map((group, gi) => (
                  <div key={group.label}>
                    {gi > 0 && (
                      <div className="mx-2 my-4 border-t border-border/60" />
                    )}
                    <GroupLabel label={group.label} />
                    <div className="flex flex-col gap-[2px]">
                      {group.items.map((item) => (
                        <NavItem
                          key={item.to}
                          item={item}
                          onClick={() => !item.placeholder && setIsMobileOpen(false)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                <div>
                  <div className="mx-2 my-4 border-t border-border/60" />
                  <GroupLabel label="System" />
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        toggleTheme();
                        setIsMobileOpen(false);
                      }}
                      className="group flex w-full items-center gap-3 px-3 py-[7px] text-body-sm font-medium text-muted transition-colors duration-200 hover:text-foreground outline-none cursor-pointer"
                    >
                      {theme === 'light' ? <Sun className="h-[15px] w-[15px] text-muted/60 animate-none" /> : <Moon className="h-[15px] w-[15px] text-muted/60" />}
                      <span>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNavPosition('top');
                        setIsMobileOpen(false);
                      }}
                      className="group flex w-full items-center gap-3 px-3 py-[7px] text-body-sm font-medium text-muted transition-colors duration-200 hover:text-foreground outline-none cursor-pointer"
                    >
                      <Columns3 className="h-[15px] w-[15px] text-muted/60 rotate-90" />
                      <span>Top Navigation</span>
                    </button>
                  </div>
                </div>
              </nav>

              {/* Drawer Bottom */}
              <div className="border-t border-border px-4 py-4">
                <StatusFooter />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
