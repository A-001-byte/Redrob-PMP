import { useMemo, useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { accordionVariants, staggerItem } from './motion/presets.js';
import {
  ArrowDown,
  ArrowUp,
  BookmarkCheck,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  Inbox,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ExternalLink,
  User,
  MapPin,
  Building,
  Calendar,
  CheckCircle2,
  AlertCircle,
  BrainCircuit
} from 'lucide-react';
import { exportUrl } from '../utils/api.js';
import { STATUSES, exportShortlistCsv, useShortlist } from '../context/ShortlistContext.jsx';
import {
  PART_COLORS,
  fmtScore,
  locationBucket,
  scoreColor,
  scoreTextColor,
  scoreWidthPct,
  truncate,
} from '../utils/formatters.js';

const SORT_FIELDS = [
  { key: 'rank', label: 'Rank' },
  { key: 'score', label: 'Score' },
  { key: 'career', label: 'Career' },
  { key: 'skill', label: 'Skill' },
];

const LOCATIONS = ['All', 'Pune', 'Noida', 'Other India', 'International'];

const STATUS_THEMES = {
  shortlisted: {
    bg: 'bg-accent/10',
    text: 'text-accent border border-accent/20',
    dot: 'bg-accent',
  },
  contacted: {
    bg: 'bg-info/10',
    text: 'text-info border border-info/20',
    dot: 'bg-info',
  },
  rejected: {
    bg: 'bg-danger/10',
    text: 'text-danger border border-danger/20',
    dot: 'bg-danger',
  },
};

const RECRUITER_LEGEND = {
  career: { label: 'Academic & Career Prestige', color: 'var(--primary)' },
  semantic: { label: 'Contextual Alignment', color: 'var(--secondary)' },
  skill: { label: 'Technical Stack', color: 'var(--accent)' },
  experience: { label: 'Tenure & Geography', color: 'var(--support)' },
  assessment: { label: 'Verified Assessments', color: 'var(--accent)' },
};

function Sparkbar({ parts }) {
  const entries = Object.entries(PART_COLORS).map(([k, color]) => ({
    key: k,
    color,
    value: Math.max(0, parts?.[k] ?? 0),
  }));
  const title = entries
    .map((e) => `${RECRUITER_LEGEND[e.key]?.label || e.key}: ${e.value.toFixed(3)}`)
    .join('\n');
  return (
    <div
      className="flex h-2.5 w-24 overflow-hidden rounded bg-background/50 border border-border"
      title={title}
    >
      {entries.map((e) => (
        <div
          key={e.key}
          style={{ flexGrow: e.value, backgroundColor: e.color }}
          className="h-full border-r border-border last:border-none transition-all duration-300"
        />
      ))}
    </div>
  );
}

function ScoreCell({ score }) {
  return (
    <div className="flex items-center gap-3" aria-label={`Score: ${fmtScore(score)}`}>
      <span className={`font-mono text-data-sm w-12 tracking-tight ${scoreTextColor(score)}`}>
        {fmtScore(score)}
      </span>
      <div className="h-1.5 w-16 overflow-hidden rounded bg-background/50 border border-border/80">
        <div
          className={`h-full ${scoreColor(score)} rounded transition-all duration-500`}
          style={{ width: scoreWidthPct(score) }}
        />
      </div>
    </div>
  );
}

export default function RankingTable({ candidates, onSelect, selected, onToggleSelect }) {
  const [sortKey, setSortKey] = useState('rank');
  const [sortAsc, setSortAsc] = useState(true);
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState('All');
  const [minScore, setMinScore] = useState('');
  const [maxScore, setMaxScore] = useState('');
  const [statusFilter, setStatusFilter] = useState('Any');
  
  // Expanded row state
  const [expandedId, setExpandedId] = useState(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { entries } = useShortlist();
  const taggedCount = Object.keys(entries).length;

  const rows = useMemo(() => {
    let out = candidates;
    const needle = q.trim().toLowerCase();
    if (needle) out = out.filter((c) => (c.title || '').toLowerCase().includes(needle));
    if (loc !== 'All') out = out.filter((c) => locationBucket(c) === loc);
    const lo = parseFloat(minScore);
    const hi = parseFloat(maxScore);
    if (!Number.isNaN(lo)) out = out.filter((c) => c.score >= lo);
    if (!Number.isNaN(hi)) out = out.filter((c) => c.score <= hi);
    if (statusFilter === 'Tagged') out = out.filter((c) => entries[c.candidate_id]);
    else if (statusFilter !== 'Any')
      out = out.filter((c) => entries[c.candidate_id]?.status === statusFilter);

    const value = (c) =>
      sortKey === 'rank' ? c.rank
      : sortKey === 'score' ? c.score
      : c.parts?.[sortKey] ?? 0;
    return [...out].sort((a, b) =>
      sortAsc ? value(a) - value(b) : value(b) - value(a)
    );
  }, [candidates, q, loc, minScore, maxScore, statusFilter, entries, sortKey, sortAsc]);

  // Reset page and expansion when filters change
  useEffect(() => {
    setCurrentPage(1);
    setExpandedId(null);
  }, [q, loc, minScore, maxScore, statusFilter]);

  const totalPages = Math.ceil(rows.length / pageSize);
  
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, currentPage, pageSize]);

  const toggleSort = (key) => {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(key === 'rank');
    }
  };

  const handleResetFilters = () => {
    setQ('');
    setLoc('All');
    setMinScore('');
    setMaxScore('');
    setStatusFilter('Any');
  };

  const handleRowClick = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleRowKeyDown = (e, candidateId) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleRowClick(candidateId);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextRow = e.currentTarget.nextElementSibling;
      if (nextRow) nextRow.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevRow = e.currentTarget.previousElementSibling;
      if (prevRow) prevRow.focus();
    }
  };

  const inputCls =
    'rounded border border-border bg-background px-3 py-1.5 text-xs text-foreground ' +
    'placeholder:text-muted/65 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 ' +
    'transition-all duration-150 ease-in-out cursor-pointer hover:bg-background/80';

  const firstCellCls = "py-3.5 pl-4 border-l-[3px] border-l-transparent group-hover:border-l-secondary group-focus-visible:border-l-secondary transition-all duration-150";

  return (
    <section className="rounded-md border border-border bg-surface overflow-hidden border-t-2 border-t-primary relative flex flex-col">
      {/* ── Recruiter Toolbar Filter Bar ───────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4.5 bg-surface border-b border-border">
        {/* Left: Input Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search box */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-muted/80" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search job title…"
              className={`${inputCls} w-52 pl-9 cursor-text`}
              aria-label="Search candidates by job title"
            />
          </div>

          {/* Location filter */}
          <select
            value={loc}
            onChange={(e) => setLoc(e.target.value)}
            className={inputCls}
            aria-label="Filter by location"
          >
            {LOCATIONS.map((l) => (
              <option key={l} value={l} className="bg-surface text-foreground">{l === 'All' ? 'All Locations' : l}</option>
            ))}
          </select>

          {/* Range filter */}
          <div className="flex items-center gap-1 bg-background px-3 py-1.5 rounded border border-border">
            <input
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              placeholder="Min"
              inputMode="decimal"
              className="bg-transparent text-body-sm text-foreground w-8 text-center focus:outline-none placeholder:text-muted/65"
              aria-label="Minimum score"
            />
            <span className="text-caption text-muted px-0.5">–</span>
            <input
              value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
              placeholder="Max"
              inputMode="decimal"
              className="bg-transparent text-body-sm text-foreground w-8 text-center focus:outline-none placeholder:text-muted/65"
              aria-label="Maximum score"
            />
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={inputCls}
            aria-label="Filter by shortlist status"
          >
            <option value="Any" className="bg-surface text-foreground">Any Status</option>
            <option value="Tagged" className="bg-surface text-foreground">Tagged ({taggedCount})</option>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value} className="bg-surface text-foreground">
                {s.label}
              </option>
            ))}
          </select>

          <span className="text-label text-muted bg-background/60 border border-border px-2.5 py-1 rounded font-mono uppercase pl-2.5">
            {rows.length} matches
          </span>
        </div>

        {/* Right: Export & Shortlist Trigger Actions */}
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          {taggedCount > 0 && (
            <button
              type="button"
              onClick={() => exportShortlistCsv(entries, candidates)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded bg-secondary/10 px-4 py-2 text-body-sm font-semibold text-secondary transition-all duration-150 hover:bg-secondary/20 hover:border-secondary/30 active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-secondary"
            >
              <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Export Shortlist ({taggedCount})</span>
            </button>
          )}

          <a
            href={exportUrl}
            download="submission.csv"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-border bg-surface px-4 py-2 text-body-sm font-semibold text-foreground transition-all duration-150 hover:bg-surface-hover hover:border-border/60 active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Export CSV</span>
          </a>
        </div>
      </div>

      {/* ── Match Signals Legend ───────────────────────────────────────── */}
      <div className="flex items-center gap-3 bg-surface-hover/20 px-4 py-2.5 border-b border-border overflow-x-auto">
        <span className="text-label font-bold text-muted shrink-0 uppercase tracking-[0.06em]">Signals:</span>
        <div className="flex items-center gap-4">
          {Object.entries(RECRUITER_LEGEND).map(([k, info]) => (
            <span key={k} className="flex items-center gap-1.5 text-label text-muted uppercase whitespace-nowrap" title={info.label}>
              <span className="h-2 w-2 rounded-sm shrink-0 shadow-sm" style={{ backgroundColor: info.color }} />
              {k}
            </span>
          ))}
        </div>
      </div>

      {/* ── Candidate Table Grid ───────────────────────────────────────── */}
      <div className="overflow-x-auto relative">
        <table className="w-full text-left text-body-sm border-collapse">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-border bg-surface text-label uppercase text-muted shadow-sm">
              {onToggleSelect && (
                <th scope="col" className="w-10 pl-4 py-2.5 bg-surface text-center">
                  <span className="sr-only">Compare</span>
                </th>
              )}
              <SortTh field={SORT_FIELDS[0]} sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} className="w-16 pl-4 py-2.5 bg-surface" />
              <th scope="col" className="px-4 py-2.5 font-bold bg-surface">Candidate Dossier</th>
              <SortTh field={SORT_FIELDS[1]} sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} className="w-40 py-2.5 bg-surface" />
              <th scope="col" className="px-4 py-2.5 font-bold bg-surface">Expertise Density</th>
              <th scope="col" className="px-4 py-2.5 font-bold bg-surface">Risk & Signals</th>
              <th scope="col" className="px-4 py-2.5 pr-6 font-bold bg-surface text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {paginatedRows.map((c, rowIdx) => {
              const statusKey = entries[c.candidate_id]?.status;
              const statusTheme = statusKey ? STATUS_THEMES[statusKey] : null;
              const isExpanded = expandedId === c.candidate_id;

              return (
                <>
                  {/* Staggered row entry on pagination */}
                  <motion.tr
                    key={`row-${c.candidate_id}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, ease: 'easeOut', delay: Math.min(rowIdx * 0.025, 0.3) }}
                    tabIndex={0}
                    role="row"
                    onClick={() => handleRowClick(c.candidate_id)}
                    onKeyDown={(e) => handleRowKeyDown(e, c.candidate_id)}
                    className={`cursor-pointer transition-all duration-150 hover:bg-primary/[0.02] focus-visible:bg-surface-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 group border-b border-border last:border-0 even:bg-primary/[0.003] outline-none ${
                      isExpanded ? 'bg-primary/[0.02]' : ''
                    }`}
                  >
                    {onToggleSelect && (
                      <td className={firstCellCls} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected?.has(c.candidate_id) ?? false}
                          onChange={() => onToggleSelect(c.candidate_id)}
                          aria-label={`Select ${c.candidate_id} for comparison`}
                          className="h-3.5 w-3.5 cursor-pointer rounded border-border bg-surface text-secondary focus:ring-secondary focus:ring-offset-0 focus:ring-1"
                        />
                      </td>
                    )}
                    <td className={onToggleSelect ? "py-4 pl-4 align-top" : firstCellCls + " align-top"}>
                      <div className="flex flex-col items-center">
                        <span className="font-heading text-lg font-bold text-foreground">
                          {String(c.rank).padStart(2, '0')}
                        </span>
                        {typeof c.movement === 'number' && c.movement !== 0 && (
                          <span
                            className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-sm border mt-0.5 ${
                              c.movement > 0 
                                ? 'bg-accent/10 text-accent border-accent/15' 
                                : 'bg-danger/10 text-danger border-danger/15'
                            }`}
                          >
                            {c.movement > 0 ? `▲ ${c.movement}` : `▼ ${-c.movement}`}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top max-w-[20rem]">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-primary/10 border border-primary/20 text-primary font-bold font-heading text-sm shadow-sm group-hover:bg-primary/15 transition-colors">
                          {c.candidate_id.substring(c.candidate_id.indexOf('-') + 1, c.candidate_id.indexOf('-') + 3).toUpperCase()}
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1.5 text-body-sm font-bold text-foreground">
                            {c.candidate_id.split('-').pop()}
                            {statusTheme && (
                              <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusTheme.dot}`}
                                title={statusKey}
                                aria-hidden="true"
                              />
                            )}
                          </span>
                          <span className="text-body-sm text-muted font-medium truncate">
                            {c.title || 'Unknown Role'}
                          </span>
                          <div className="flex items-center gap-3 text-caption text-muted/80 mt-1">
                            {c.yoe !== undefined && (
                              <span className="flex items-center gap-1" title="Years of Experience">
                                <Building className="h-3 w-3 shrink-0" />
                                {c.yoe} YOE
                              </span>
                            )}
                            {c.location && (
                              <span className="flex items-center gap-1" title="Location">
                                <MapPin className="h-3 w-3 shrink-0" />
                                {c.location}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-col gap-2">
                        <ScoreCell score={c.score} />
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${
                            c.score > 0.8 
                              ? 'bg-success/10 text-success border-success/20' 
                              : c.score >= 0.6 
                                ? 'bg-warning/10 text-warning border-warning/20' 
                                : 'bg-danger/10 text-danger border-danger/20'
                          }`}>
                            {c.score > 0.8 ? 'High Confidence' : c.score >= 0.6 ? 'Moderate Fit' : 'Low Confidence'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-col gap-2.5">
                        <Sparkbar parts={c.parts} />
                        <div className="flex flex-wrap gap-1 max-w-[14rem]">
                          {c.matched_required_skills?.slice(0, 3).map((s) => (
                            <span key={s} className="text-[9px] uppercase font-mono tracking-wider bg-surface-hover/50 border border-border px-1.5 py-0.5 rounded text-muted truncate max-w-[80px]" title={s}>
                              {s}
                            </span>
                          ))}
                          {c.matched_required_skills?.length > 3 && (
                            <span className="text-[9px] uppercase font-mono bg-surface-hover/50 border border-border px-1.5 py-0.5 rounded text-muted">
                              +{c.matched_required_skills.length - 3}
                            </span>
                          )}
                          {(!c.matched_required_skills || c.matched_required_skills.length === 0) && (
                            <span className="text-[9px] uppercase font-mono text-muted/50 italic">No exact skill matches</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-col gap-1.5 items-start max-w-[10rem]">
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-info/10 text-info border border-info/20" title="Semantic Match Strength">
                          <BrainCircuit className="h-3 w-3 shrink-0" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Strong</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-support/10 text-support border border-support/20" title="Availability Signal">
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Passive</span>
                        </div>
                        {c.anomalies && c.anomalies.length > 0 && (
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-danger/10 text-danger border border-danger/20" title={`${c.anomalies.length} Risk Flags Detected`}>
                            <AlertCircle className="h-3 w-3 shrink-0" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">{c.anomalies.length} Flags</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 pr-6 align-top text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col items-end gap-2.5">
                        <button
                          type="button"
                          onClick={() => onSelect(c.candidate_id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] uppercase tracking-wider font-bold rounded bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm active:scale-95"
                        >
                          <span>Dossier</span>
                          <ExternalLink className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRowClick(c.candidate_id)}
                          className="p-1 rounded text-muted hover:text-primary hover:bg-surface-hover transition-colors flex items-center justify-center border border-transparent hover:border-border"
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </motion.tr>

                  {/* Expandable Recommendation Summary */}
                  <AnimatePresence initial={false}>
                  {isExpanded && (
                    <tr
                      key={`expand-${c.candidate_id}`}
                      className="bg-primary/[0.01]"
                    >
                      <td colSpan={onToggleSelect ? 7 : 6} className="p-0 border-none">
                        <motion.div
                          initial="collapsed"
                          animate="expanded"
                          exit="exit"
                          variants={accordionVariants}
                          className="overflow-hidden"
                        >
                          <div className="px-6 py-4.5 border-t border-b border-border/60">
                            <motion.div
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.2, ease: 'easeOut', delay: 0.08 }}
                              className="grid grid-cols-1 md:grid-cols-5 gap-6"
                            >
                              {/* AI Recommendation Summary */}
                              <div className="md:col-span-3 space-y-2">
                                <div className="flex items-center gap-1.5 text-primary text-label uppercase font-mono">
                                  <Sparkles className="h-3.5 w-3.5" />
                                  <span>AI Sourcing Recommendation</span>
                                </div>
                                <motion.p
                                  initial={{ opacity: 0, y: 4 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ duration: 0.25, ease: 'easeOut', delay: 0.15 }}
                                  className="text-body-sm leading-relaxed text-foreground bg-surface border border-border/80 rounded p-3.5 italic font-medium"
                                >
                                  "{c.reasoning || 'No matching justification available.'}"
                                </motion.p>
                              </div>

                              {/* Skill Matching coverage */}
                              <div className="md:col-span-2 space-y-3">
                                <div className="text-label text-muted uppercase font-mono">
                                  JD Technical Stack Coverage
                                </div>
                                
                                {/* Required Skills */}
                                <div className="space-y-1.5">
                                  <div className="text-label text-muted uppercase font-mono flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3 text-accent" />
                                    <span>Required Skills Matched</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {c.matched_required_skills && c.matched_required_skills.length > 0 ? (
                                      c.matched_required_skills.map((s) => (
                                        <span key={s} className="rounded bg-accent/10 border border-accent/20 px-2 py-0.5 text-label font-mono text-accent uppercase">
                                          {s}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="text-caption text-muted italic">No required skill evidence found</span>
                                    )}
                                  </div>
                                </div>

                                {/* Nice-to-have Skills */}
                                <div className="space-y-1.5 pt-1">
                                  <div className="text-label text-muted uppercase font-mono flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3 text-muted" />
                                    <span>Nice-to-Have Skills Matched</span>
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {c.matched_nicetohave_skills && c.matched_nicetohave_skills.length > 0 ? (
                                      c.matched_nicetohave_skills.map((s) => (
                                        <span key={s} className="rounded bg-sidebar border border-border px-2 py-0.5 text-label font-mono text-muted uppercase">
                                          {s}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="text-caption text-muted italic">No nice-to-have skill evidence found</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          </div>
                        </motion.div>
                      </td>
                    </tr>
                  )}
                  </AnimatePresence>
                </>
              );
            })}
          </tbody>
        </table>

        {/* ── Empty State Dashboard ────────────────────────────────────── */}
        {rows.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded bg-background border border-border text-muted mb-4">
              <Inbox className="h-6 w-6" />
            </div>
            <h3 className="text-heading-sm font-bold text-foreground tracking-tight">No candidates found</h3>
            <p className="text-body-sm text-muted font-medium max-w-sm mt-1">
              {candidates.length === 0
                ? 'No pipeline results available yet. Run a candidate re-ranking pipeline execution.'
                : 'No candidates matched your current search filters.'}
            </p>
            {candidates.length > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-4 rounded border border-border bg-surface px-4 py-2 text-body-sm font-semibold text-foreground transition-all duration-150 hover:bg-surface-hover hover:text-primary hover:border-border/60 active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Recruiter Dashboard Pagination & Secondary Sorting Footer ────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border-t border-border bg-surface">
        {/* Secondary Part-Level Sort Pills */}
        <div className="flex flex-wrap items-center gap-2 text-muted font-mono text-label uppercase">
          <span>Sort By:</span>
          <div className="flex items-center gap-1 bg-background/50 border border-border p-0.5 rounded">
            {SORT_FIELDS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => toggleSort(f.key)}
                className={`cursor-pointer rounded px-2.5 py-0.5 transition-all duration-150 text-label uppercase focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary ${
                  sortKey === f.key
                    ? 'bg-primary text-white'
                    : 'text-muted hover:bg-surface hover:text-foreground'
                }`}
              >
                {f.label}
                {sortKey === f.key && (sortAsc ? ' ↑' : ' ↓')}
              </button>
            ))}
          </div>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
            <span className="text-caption text-muted uppercase">
              Showing {Math.min(rows.length, (currentPage - 1) * pageSize + 1)}-{Math.min(rows.length, currentPage * pageSize)} of {rows.length}
            </span>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-border bg-surface text-muted hover:bg-surface-hover hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                aria-label="Previous Page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {Array.from({ length: totalPages }, (_, idx) => {
                const p = idx + 1;
                const isActive = currentPage === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCurrentPage(p)}
                    className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded text-caption font-bold transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary ${
                      isActive
                        ? 'bg-primary text-white border border-primary'
                        : 'border border-border bg-surface text-muted hover:bg-surface-hover hover:text-foreground'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-border bg-surface text-muted hover:bg-surface-hover hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                aria-label="Next Page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="rounded border border-border bg-surface px-2 py-1 text-caption text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
              aria-label="Items per page"
            >
              {[10, 25, 50, 100].map((sz) => (
                <option key={sz} value={sz} className="bg-surface text-foreground">{sz} / Page</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </section>
  );
}

function SortTh({ field, sortKey, sortAsc, onSort, className = '' }) {
  const active = sortKey === field.key;
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 font-bold text-left ${className}`}
      aria-sort={active ? (sortAsc ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(field.key)}
        className="flex cursor-pointer items-center gap-1.5 uppercase text-label text-muted hover:text-foreground transition-all duration-150 focus-visible:ring-1 focus-visible:ring-primary/50 focus-visible:outline-none rounded px-1 py-0.5"
      >
        <span>{field.label}</span>
        {active ? (
          <motion.span
            key={sortAsc ? 'asc' : 'desc'}
            initial={{ rotate: sortAsc ? 180 : -180, opacity: 0.3 }}
            animate={{ rotate: 0, opacity: 1 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="flex items-center justify-center shrink-0"
          >
            {sortAsc ? (
              <ArrowUp className="h-3 w-3 text-secondary" aria-hidden="true" />
            ) : (
              <ArrowDown className="h-3 w-3 text-secondary" aria-hidden="true" />
            )}
          </motion.span>
        ) : (
          <span className="w-3 h-3 block shrink-0" />
        )}
      </button>
    </th>
  );
}
