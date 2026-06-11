import { useRef, useState } from 'react';
import { ChevronDown, FileUp, Loader2 } from 'lucide-react';
import { postPreview } from '../utils/api.js';
import { fmtScore, scoreColor, scoreTextColor, scoreWidthPct } from '../utils/formatters.js';

const MAX_IDS = 200;
const ID_RE = /CAND_\d{7}/g;

function parseIds(text) {
  const ids = [...new Set(text.match(ID_RE) || [])];
  return ids.slice(0, MAX_IDS);
}

export default function UploadPanel({ onSelect }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const ids = parseIds(text);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (file) setText(await file.text());
    e.target.value = '';
  };

  const run = async () => {
    if (!ids.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await postPreview(ids));
    } catch (err) {
      setError(String(err.message || err));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left
                   transition-colors duration-150 hover:bg-muted/50
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <FileUp className="h-4 w-4 text-secondary" aria-hidden="true" />
        <span className="font-heading text-sm font-semibold text-foreground">
          Preview a custom candidate list
        </span>
        <span className="text-xs text-slate-400">
          scoring-only run on up to {MAX_IDS} IDs — for organizer verification
        </span>
        <ChevronDown
          className={`ml-auto h-4 w-4 text-slate-400 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="flex-1">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                placeholder={'Paste candidate IDs (one per line or comma-separated)\nCAND_0046525, CAND_0081846…'}
                className="w-full rounded-md border border-border bg-white px-3 py-2
                           font-heading text-xs focus:outline-none focus-visible:ring-2
                           focus-visible:ring-ring"
              />
              <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-500">
                <span>{ids.length} valid ID{ids.length === 1 ? '' : 's'} detected</span>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="cursor-pointer text-primary underline-offset-2 transition-colors
                             duration-150 hover:underline focus:outline-none
                             focus-visible:ring-2 focus-visible:ring-ring"
                >
                  …or upload a CSV file
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={onFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={run}
                  disabled={!ids.length || busy}
                  className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-md
                             bg-primary px-3.5 py-1.5 text-sm font-medium text-on-primary
                             transition-colors duration-200 hover:bg-blue-900
                             focus:outline-none focus-visible:ring-2 focus-visible:ring-ring
                             focus-visible:ring-offset-2 disabled:cursor-not-allowed
                             disabled:opacity-50"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Score subset
                </button>
              </div>
              {error && <div className="mt-2 text-xs text-destructive">{error}</div>}
            </div>
          </div>

          {result && (
            <div className="mt-3">
              <div className="mb-1.5 flex items-baseline gap-3 text-xs text-slate-500">
                <span className="font-heading font-semibold text-foreground">
                  {result.total_scored} scored
                </span>
                {result.unknown_ids.length > 0 && (
                  <span className="text-destructive">
                    {result.unknown_ids.length} unknown: {result.unknown_ids.join(', ')}
                  </span>
                )}
                <span className="italic">{result.note}</span>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-md border border-border">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-muted text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Candidate</th>
                      <th className="px-3 py-2 font-medium">Title</th>
                      <th className="px-3 py-2 font-medium">Location</th>
                      <th className="px-3 py-2 font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((r) => (
                      <tr
                        key={r.candidate_id}
                        onClick={() => onSelect(r.candidate_id)}
                        className="cursor-pointer border-t border-border/60 transition-colors
                                   duration-150 hover:bg-muted/60"
                      >
                        <td className="px-3 py-1.5 font-heading text-slate-500">{r.rank}</td>
                        <td className="px-3 py-1.5 font-heading text-xs text-primary">
                          {r.candidate_id}
                        </td>
                        <td className="max-w-[14rem] truncate px-3 py-1.5">{r.title || '--'}</td>
                        <td className="px-3 py-1.5 text-slate-500">{r.location || '--'}</td>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`font-heading text-xs font-medium ${scoreTextColor(r.score)}`}>
                              {fmtScore(r.score)}
                            </span>
                            <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                              <div
                                className={`h-full ${scoreColor(r.score)}`}
                                style={{ width: scoreWidthPct(r.score) }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
