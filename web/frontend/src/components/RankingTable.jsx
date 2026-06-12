import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BookmarkCheck, Download, Search } from 'lucide-react';
import { exportUrl } from '../utils/api.js';
import { STATUSES, exportShortlistCsv, useShortlist } from '../context/ShortlistContext.jsx';
import {
  PART_COLORS,
  PART_LABELS,
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

function Sparkbar({ parts }) {
  const entries = Object.entries(PART_COLORS).map(([k, color]) => ({
    key: k,
    color,
    value: Math.max(0, parts?.[k] ?? 0),
  }));
  const title = entries
    .map((e) => `${PART_LABELS[e.key]}: ${e.value.toFixed(3)}`)
    .join('\n');
  return (
    <div
      className="flex h-2.5 w-24 overflow-hidden rounded-sm bg-muted"
      title={title}
    >
      {entries.map((e) => (
        <div
          key={e.key}
          style={{ flexGrow: e.value, backgroundColor: e.color }}
          className="h-full"
        />
      ))}
    </div>
  );
}

function ScoreCell({ score }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`font-heading text-sm font-medium ${scoreTextColor(score)}`}>
        {fmtScore(score)}
      </span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${scoreColor(score)}`}
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

  const toggleSort = (key) => {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(key === 'rank'); // rank reads best ascending, scores descending
    }
  };

  const inputCls =
    'rounded-md border border-border bg-gray-900 px-2.5 py-1.5 text-sm text-slate-200 ' +
    'placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
    'transition-colors duration-150';

  return (
    <section className="rounded-lg border border-border bg-surface">
      {/* filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title…"
            className={`${inputCls} w-48 pl-8`}
          />
        </div>
        <select
          value={loc}
          onChange={(e) => setLoc(e.target.value)}
          className={`${inputCls} cursor-pointer`}
          aria-label="Filter by location"
        >
          {LOCATIONS.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        <div className="flex items-center gap-1 text-sm text-slate-500">
          <input
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            placeholder="Min"
            inputMode="decimal"
            className={`${inputCls} w-16`}
            aria-label="Minimum score"
          />
          –
          <input
            value={maxScore}
            onChange={(e) => setMaxScore(e.target.value)}
            placeholder="Max"
            inputMode="decimal"
            className={`${inputCls} w-16`}
            aria-label="Maximum score"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`${inputCls} cursor-pointer`}
          aria-label="Filter by shortlist status"
        >
          <option value="Any">Any status</option>
          <option value="Tagged">Tagged ({taggedCount})</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500">
          {rows.length} of {candidates.length}
        </span>
        {taggedCount > 0 && (
          <button
            type="button"
            onClick={() => exportShortlistCsv(entries, candidates)}
            className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-md border
                       border-border px-3 py-1.5 text-sm text-emerald-400 transition-colors
                       duration-200 hover:bg-surface-hover focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
            Shortlist ({taggedCount})
          </button>
        )}
        <a
          href={exportUrl}
          download="submission.csv"
          className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-md border
                     border-border px-3 py-1.5 text-sm text-slate-300 transition-colors
                     duration-200 hover:bg-surface-hover hover:text-foreground focus:outline-none
                     focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Export CSV
        </a>
      </div>

      {/* table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-slate-500">
              {onToggleSelect && <th className="w-8 pl-3" aria-label="Compare" />}
              {SORT_FIELDS.slice(0, 1).map((f) => (
                <SortTh key={f.key} field={f} sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} className="w-16 pl-4" />
              ))}
              <th className="px-3 py-2.5 font-medium">Candidate</th>
              <th className="px-3 py-2.5 font-medium">Title</th>
              <th className="px-3 py-2.5 font-medium">Location</th>
              <SortTh field={SORT_FIELDS[1]} sortKey={sortKey} sortAsc={sortAsc} onSort={toggleSort} />
              <th className="px-3 py-2.5 font-medium">
                <span className="flex items-center gap-2">
                  Parts
                  <span className="hidden gap-1 font-normal normal-case xl:flex">
                    {Object.entries(PART_COLORS).map(([k, c]) => (
                      <span key={k} className="flex items-center gap-0.5 text-[10px] text-slate-500">
                        <span className="h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: c }} />
                        {PART_LABELS[k]}
                      </span>
                    ))}
                  </span>
                </span>
              </th>
              <th className="px-3 py-2.5 pr-4 font-medium">Reasoning</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.candidate_id}
                onClick={() => onSelect(c.candidate_id)}
                className="cursor-pointer border-b border-border/40 transition-colors
                           duration-150 last:border-b-0 hover:bg-surface-hover"
              >
                {onToggleSelect && (
                  <td className="py-2 pl-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected?.has(c.candidate_id) ?? false}
                      onChange={() => onToggleSelect(c.candidate_id)}
                      aria-label={`Select ${c.candidate_id} for comparison`}
                      className="h-3.5 w-3.5 cursor-pointer accent-blue-500"
                    />
                  </td>
                )}
                <td className="py-2 pl-4 font-heading text-slate-500">
                  <span className="flex items-center gap-1">
                    {c.rank}
                    {typeof c.movement === 'number' && c.movement !== 0 && (
                      <span
                        className={`font-heading text-[10px] ${
                          c.movement > 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                        title={`${Math.abs(c.movement)} place${Math.abs(c.movement) === 1 ? '' : 's'} ${
                          c.movement > 0 ? 'up' : 'down'
                        } vs official ranking`}
                      >
                        {c.movement > 0 ? `▲${c.movement}` : `▼${-c.movement}`}
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 font-heading text-xs text-secondary">
                  <span className="flex items-center gap-1.5">
                    {entries[c.candidate_id]?.status && (
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          STATUSES.find((s) => s.value === entries[c.candidate_id].status)?.dot ??
                          'bg-slate-500'
                        }`}
                        title={entries[c.candidate_id].status}
                        aria-hidden="true"
                      />
                    )}
                    {c.candidate_id}
                  </span>
                </td>
                <td className="max-w-[16rem] truncate px-3 py-2 font-medium text-slate-300">
                  {c.title || '--'}
                </td>
                <td className="px-3 py-2 text-slate-500">{c.location || '--'}</td>
                <td className="px-3 py-2">
                  <ScoreCell score={c.score} />
                </td>
                <td className="px-3 py-2">
                  <Sparkbar parts={c.parts} />
                </td>
                <td className="max-w-[22rem] px-3 py-2 pr-4 text-slate-500">
                  <span className="group relative block">
                    {truncate(c.reasoning, 80)}
                    {c.reasoning && c.reasoning.length > 80 && (
                      <span
                        className="invisible absolute bottom-full right-0 z-20 mb-1 w-80
                                   rounded-md border border-border bg-gray-900 p-2.5 text-xs
                                   leading-relaxed text-slate-300 opacity-0 shadow-lg
                                   transition-opacity duration-200 group-hover:visible
                                   group-hover:opacity-100"
                      >
                        {c.reasoning}
                      </span>
                    )}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={onToggleSelect ? 8 : 7}
                  className="px-4 py-10 text-center text-sm text-slate-500"
                >
                  {candidates.length === 0
                    ? 'No submission yet — click Re-rank to run the pipeline.'
                    : 'No candidates match the current filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* secondary sort chips for part-level fields */}
      <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs text-slate-500">
        Sort by:
        {SORT_FIELDS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => toggleSort(f.key)}
            className={`cursor-pointer rounded-full border px-2.5 py-0.5 transition-colors duration-150
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          sortKey === f.key
                            ? 'border-primary bg-primary text-on-primary shadow-glow-sm'
                            : 'border-border text-slate-400 hover:bg-surface-hover hover:text-slate-300'
                        }`}
          >
            {f.label}
            {sortKey === f.key && (sortAsc ? ' ↑' : ' ↓')}
          </button>
        ))}
      </div>
    </section>
  );
}

function SortTh({ field, sortKey, sortAsc, onSort, className = '' }) {
  const active = sortKey === field.key;
  const Icon = sortAsc ? ArrowUp : ArrowDown;
  return (
    <th className={`px-3 py-2.5 font-medium ${className}`}>
      <button
        type="button"
        onClick={() => onSort(field.key)}
        className="flex cursor-pointer items-center gap-1 uppercase tracking-wide
                   transition-colors duration-150 hover:text-secondary focus:outline-none
                   focus-visible:ring-2 focus-visible:ring-ring"
      >
        {field.label}
        {active && <Icon className="h-3 w-3" aria-hidden="true" />}
      </button>
    </th>
  );
}
