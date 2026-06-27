import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, FileUp, Loader2, Upload, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
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
  const [uploadTab, setUploadTab] = useState('upload'); // 'upload' | 'paste'
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  
  const fileRef = useRef(null);
  const ids = parseIds(text);

  const handleTextChange = (val) => {
    setText(val);
    setError(null);
    setResult(null);
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      handleTextChange(await file.text());
    }
    e.target.value = '';
  };

  const onDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = () => {
    setIsDragOver(false);
  };

  const onDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
        setFileName(file.name);
        handleTextChange(await file.text());
      } else {
        setError('Unsupported format. Please upload a .csv or .txt file.');
        setResult(null);
      }
    }
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

  const clearUpload = () => {
    setText('');
    setFileName('');
    setResult(null);
    setError(null);
  };

  return (
    <section className="bg-surface border border-border rounded overflow-hidden transition-all duration-150">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 px-6 py-4.5 text-left focus:outline-none"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10 border border-primary/20 text-primary">
          <FileUp className="h-4 w-4" aria-hidden="true" />
        </div>
        
        <div>
          <span className="font-heading text-sm font-bold text-primary block">
            Preview Custom Candidate List
          </span>
          <span className="text-caption text-muted font-medium mt-0.5 block">
            Scoring-only trial on up to {MAX_IDS} candidate IDs (organizer verification)
          </span>
        </div>

        <ChevronDown
          className={`ml-auto h-4 w-4 text-muted transition-transform duration-300 ${
            open ? 'rotate-180 text-primary' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border bg-surface-hover/50 overflow-hidden"
          >
            <div className="p-6 space-y-5">
              {/* Tab Selector bar */}
              <div className="flex gap-1.5 p-1 bg-surface-hover rounded border border-border self-start w-fit">
                <button
                  type="button"
                  onClick={() => { setUploadTab('upload'); setError(null); }}
                  className={`flex items-center gap-1.5 px-4.5 py-2 text-xs font-semibold rounded transition-all ${
                    uploadTab === 'upload'
                      ? 'bg-surface border border-border text-primary'
                      : 'text-muted hover:text-primary'
                  }`}
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Upload File</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setUploadTab('paste'); setError(null); }}
                  className={`flex items-center gap-1.5 px-4.5 py-2 text-xs font-semibold rounded transition-all ${
                    uploadTab === 'paste'
                      ? 'bg-surface border border-border text-primary'
                      : 'text-muted hover:text-primary'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Paste Text</span>
                </button>
              </div>

              {/* Upload Input Fields */}
              <div className="space-y-4">
                {uploadTab === 'upload' ? (
                  <div
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={() => fileRef.current?.click()}
                    className={`border-2 border-dashed rounded p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-150 text-center relative ${
                      isDragOver
                        ? 'border-secondary bg-secondary/5'
                        : fileName
                          ? 'border-success/30 bg-success/5'
                          : 'border-border hover:border-secondary/30 bg-surface'
                    }`}
                  >
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".csv,.txt"
                      onChange={onFile}
                      className="hidden"
                    />

                    {fileName ? (
                      <>
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-success/10 border border-success/25 text-success mb-3 animate-breathe">
                          <CheckCircle2 className="h-5 w-5" />
                        </div>
                        <span className="text-xs font-bold text-primary block">{fileName}</span>
                        <span className="text-caption text-muted font-semibold mt-1">
                          {ids.length} valid candidate IDs parsed
                        </span>
                        
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); clearUpload(); }}
                          className="mt-3 text-caption font-bold text-destructive hover:text-destructive/80 hover:underline"
                        >
                          Remove file
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-background border border-border text-muted mb-3 group-hover:text-secondary transition-colors">
                          <Upload className="h-5 w-5" />
                        </div>
                        <span className="text-xs font-bold text-primary block">
                          Drag & drop candidate list file here
                        </span>
                        <span className="text-caption text-muted font-semibold mt-1">
                          Supports .csv or .txt (comma or line separated values)
                        </span>
                      </>
                    )}
                  </div>
                ) : (
                  <textarea
                    value={text}
                    onChange={(e) => handleTextChange(e.target.value)}
                    rows={4}
                    placeholder={'Paste candidate IDs (one per line or comma-separated)\nCAND_0046525, CAND_0081846…'}
                    className="w-full rounded border border-border bg-surface px-4 py-3 font-mono text-xs text-primary placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all duration-150"
                  />
                )}

                {/* Submitting buttons and indicators */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1.5 text-label text-muted uppercase pl-1">
                    {ids.length > 0 ? (
                      <span className="text-secondary">{ids.length} / {MAX_IDS} candidate IDs detected</span>
                    ) : (
                      <span>Waiting for input</span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={run}
                    disabled={!ids.length || busy}
                    className="flex cursor-pointer items-center justify-center gap-2 rounded bg-primary hover:bg-primary/90 text-white font-semibold text-xs px-5 py-2 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed border border-primary/20"
                  >
                    {busy ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Scoring...</span>
                      </>
                    ) : (
                      <span>Score subset</span>
                    )}
                  </button>
                </div>

                {error && (
                  <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 p-3 rounded flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="font-mono">{error}</span>
                  </div>
                )}
              </div>

              {/* Scored subset visualizer card list */}
              <AnimatePresence>
                {result && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="pt-4 border-t border-border space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-primary font-heading uppercase tracking-wider">
                          Scored Subset Details
                        </span>
                        <span className="px-2 py-0.5 rounded-sm border border-tertiary/20 text-label text-tertiary uppercase">
                          {result.total_scored} Scored
                        </span>
                      </div>
                      
                      {result.note && (
                        <span className="text-caption text-muted font-medium italic">
                          * {result.note}
                        </span>
                      )}
                    </div>

                    {result.unknown_ids.length > 0 && (
                      <div className="text-body-sm text-destructive bg-destructive/10 border border-destructive/20 p-3 rounded flex flex-wrap gap-1 items-center font-mono">
                        <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mr-1" />
                        <span className="font-bold mr-1">Unknown IDs:</span>
                        {result.unknown_ids.map((id) => (
                          <span key={id} className="bg-surface px-1 py-0.5 rounded border border-destructive/20">{id}</span>
                        ))}
                      </div>
                    )}

                    {/* Table grid */}
                    <div className="max-h-72 overflow-auto rounded border border-border bg-surface">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-surface-hover text-label uppercase text-muted border-b border-border">
                          <tr>
                            <th className="px-4 py-2.5 font-bold">#</th>
                            <th className="px-4 py-2.5 font-bold">Candidate ID</th>
                            <th className="px-4 py-2.5 font-bold">Job Title</th>
                            <th className="px-4 py-2.5 font-bold">Location</th>
                            <th className="px-4 py-2.5 font-bold">Score</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {result.results.map((r) => (
                            <tr
                              key={r.candidate_id}
                              onClick={() => onSelect(r.candidate_id)}
                              className="cursor-pointer transition-colors duration-150 hover:bg-surface-hover"
                            >
                              <td className="px-4 py-2 font-heading italic text-sm text-primary">{r.rank}</td>
                              <td className="px-4 py-2 font-mono text-primary font-semibold group-hover:text-secondary">
                                {r.candidate_id}
                              </td>
                              <td className="max-w-[14rem] truncate px-4 py-2 font-semibold text-primary">{r.title || '--'}</td>
                              <td className="px-4 py-2 text-muted font-medium">{r.location || '--'}</td>
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-3">
                                  <span className={`font-mono text-xs font-bold w-12 ${scoreTextColor(r.score)}`}>
                                    {fmtScore(r.score)}
                                  </span>
                                  <div className="h-1.5 w-14 overflow-hidden rounded bg-background border border-border">
                                    <div
                                      className={`h-full ${scoreColor(r.score)} rounded`}
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
