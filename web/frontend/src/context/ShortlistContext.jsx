import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const KEY = 'redrob-shortlist-v1';
const ShortlistContext = createContext(null);

export const STATUSES = [
  { value: 'shortlisted', label: 'Shortlisted', tone: 'text-emerald-400', dot: 'bg-emerald-400' },
  { value: 'contacted', label: 'Contacted', tone: 'text-blue-300', dot: 'bg-blue-400' },
  { value: 'rejected', label: 'Rejected', tone: 'text-red-400', dot: 'bg-red-400' },
];

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

/** Recruiter working state (status + note per candidate), persisted in
 *  localStorage — survives reloads, never touches the pipeline or backend. */
export function ShortlistProvider({ children }) {
  const [entries, setEntries] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(entries));
    } catch {
      /* storage full/blocked — state still works in-memory */
    }
  }, [entries]);

  const setStatus = useCallback((id, status) => {
    setEntries((prev) => {
      const next = { ...prev };
      const cur = next[id] ?? {};
      if (!status && !cur.note) delete next[id];
      else next[id] = { ...cur, status: status || undefined, ts: Date.now() };
      return next;
    });
  }, []);

  const setNote = useCallback((id, note) => {
    setEntries((prev) => {
      const next = { ...prev };
      const cur = next[id] ?? {};
      if (!note.trim() && !cur.status) delete next[id];
      else next[id] = { ...cur, note, ts: Date.now() };
      return next;
    });
  }, []);

  return (
    <ShortlistContext.Provider value={{ entries, setStatus, setNote }}>
      {children}
    </ShortlistContext.Provider>
  );
}

export function useShortlist() {
  const ctx = useContext(ShortlistContext);
  if (!ctx) throw new Error('useShortlist must be used inside <ShortlistProvider>');
  return ctx;
}

/** Client-side CSV export of the recruiter's working list. */
export function exportShortlistCsv(entries, candidates) {
  const byId = Object.fromEntries(candidates.map((c) => [c.candidate_id, c]));
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = Object.entries(entries)
    .map(([id, e]) => ({ id, ...e, c: byId[id] }))
    .sort((a, b) => (a.c?.rank ?? 999) - (b.c?.rank ?? 999));
  const csv = [
    'candidate_id,rank,score,title,location,status,note',
    ...rows.map((r) =>
      [
        r.id,
        r.c?.rank ?? '',
        r.c?.score ?? '',
        esc(r.c?.title),
        esc(r.c?.location),
        r.status ?? '',
        esc(r.note),
      ].join(',')
    ),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'shortlist.csv';
  a.click();
  URL.revokeObjectURL(url);
}
