import { STATUSES, useShortlist } from '../../context/ShortlistContext.jsx';

/** Status chips + a free-text note, persisted per candidate (localStorage). */
export default function ShortlistControls({ candidateId }) {
  const { entries, setStatus, setNote } = useShortlist();
  const entry = entries[candidateId] ?? {};

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => {
          const active = entry.status === s.value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => setStatus(candidateId, active ? null : s.value)}
              aria-pressed={active}
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors
                          duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            active
                              ? `border-transparent bg-surface-hover font-medium ${s.tone}`
                              : 'border-border text-slate-500 hover:bg-surface-hover hover:text-slate-300'
                          }`}
            >
              <span
                className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                  active ? s.dot : 'bg-slate-600'
                }`}
                aria-hidden="true"
              />
              {s.label}
            </button>
          );
        })}
      </div>
      <textarea
        value={entry.note ?? ''}
        onChange={(e) => setNote(candidateId, e.target.value)}
        rows={2}
        placeholder="Private note for this candidate (stored locally)…"
        className="w-full rounded-md border border-border bg-surface-hover/50 px-3 py-2 text-xs
                   text-slate-300 placeholder:text-slate-600 focus:outline-none
                   focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}
