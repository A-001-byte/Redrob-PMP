import { useEffect, useState } from 'react';
import { ChevronDown, ExternalLink, Scale, HelpCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getFairness } from '../utils/api.js';

const REPORT_URL =
  'https://github.com/A-001-byte/Redrob-PMP/blob/main/submission/fairness_report.md';

function RatioRow({ row }) {
  const pct = Math.min(100, Math.max(2, row.impact_ratio * 100));
  const ok = !row.flagged;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 py-2.5 border-b border-border/60 last:border-none">
      {/* Group Title */}
      <div className="w-44 shrink-0">
        <span className="text-xs font-bold text-primary block truncate" title={row.group}>
          {row.group}
        </span>
        <span className="text-[10px] text-muted font-bold uppercase tracking-wider">
          {row.top100_count}/100 ranked · pool {row.pool_share_pct}%
        </span>
      </div>

      {/* Progress Track and Threshold Line */}
      <div className="flex-1 flex items-center gap-3">
        <div className="relative h-2 flex-1 rounded bg-sidebar border border-border overflow-hidden">
          {/* 80% Threshold Line */}
          <div className="absolute inset-y-0 left-[80%] w-px bg-border-cream/80 border-l border-dashed border-primary/20" aria-hidden="true" title="80% threshold" />
          <div
            className={`h-full rounded-sm transition-all duration-500 ${ok ? 'bg-success' : 'bg-warning'}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Ratio Value Badge */}
        <div className="w-16 shrink-0 text-right flex items-center justify-end gap-1.5 font-mono">
          <span
            className={`text-xs font-bold ${
              ok ? 'text-success' : 'text-warning'
            }`}
          >
            {row.impact_ratio.toFixed(3)}
          </span>
          {ok ? (
            <CheckCircle className="h-3.5 w-3.5 text-success shrink-0" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 animate-pulse" />
          )}
        </div>
      </div>
    </div>
  );
}

export default function FairnessPanel() {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || report || error) return;
    getFairness()
      .then(setReport)
      .catch((e) => setError(String(e.message || e)));
  }, [open, report, error]);

  return (
    <section className="bg-surface border border-border rounded shadow-sm hover-lift transition-all duration-150">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 px-6 py-4.5 text-left focus:outline-none"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/5 border border-primary/10 text-primary">
          <Scale className="h-4 w-4" aria-hidden="true" />
        </div>
        
        <div>
          <span className="font-heading text-sm font-bold text-primary block">
            Fairness Audit
          </span>
          <span className="text-[10px] text-muted font-bold uppercase tracking-wider mt-0.5 block">
            Adverse impact checks vs the qualified pool (Four-Fifths Rule compliance)
          </span>
        </div>

        <ChevronDown
          className={`ml-auto h-4 w-4 text-muted transition-transform duration-300 ${
            open ? 'rotate-180 text-primary' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-6 py-5 space-y-5">
          {error && (
            <div className="text-xs text-destructive bg-destructive/5 border border-destructive/15 p-3.5 rounded">
              {error.includes('404')
                ? 'Audit report not generated yet. Please run `python pipeline/fairness_audit.py` in the terminal.'
                : `Could not load audit report logs: ${error}`}
            </div>
          )}
          
          {!report && !error && (
            <div className="space-y-3">
              <div className="h-10 animate-skeleton rounded border border-border bg-surface" />
              <div className="h-28 animate-skeleton rounded border border-border bg-surface" />
            </div>
          )}

          {report && (
            <>
              {/* Disclaimer and report actions */}
              <div className="bg-background border border-border rounded p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="text-xs leading-relaxed text-muted max-w-3xl font-medium">
                  {report.disclaimer}
                </div>
                
                <a
                  href={REPORT_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 shrink-0 rounded border border-border bg-surface text-[10px] font-bold text-muted px-4 py-2 hover:bg-surface-hover transition-all active:scale-95"
                >
                  <span>View full audit logs</span>
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              </div>
 
              {/* Methodology details */}
              <div className="text-xs text-muted leading-relaxed bg-sidebar/55 border border-border rounded p-4 flex gap-2">
                <HelpCircle className="h-4 w-4 text-secondary shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-primary">Methodology:</span> Qualified pool represents{' '}
                  <span className="font-bold text-primary font-mono">{report.methodology.qualified_pool_count.toLocaleString()}</span> of{' '}
                  <span className="font-bold text-primary font-mono">{report.methodology.total_candidates.toLocaleString()}</span> screened profiles (
                  {report.methodology.qualified_pool_definition}). Bars represent each proxy group's selection impact ratio vs the best-selected group.
                  The dashed marker indicates the <span className="font-bold text-success font-mono">0.80 (four-fifths)</span> threshold. Amber rows represent groups flagged for review.
                </div>
              </div>

              {/* Attributes details */}
              <div className="space-y-6 pt-2">
                {report.attributes.map((attr) => (
                  <div key={attr.attribute} className="border border-border bg-background/40 rounded p-4 shadow-sm">
                    <h4 className="font-heading text-xs font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-sm bg-secondary" />
                      {attr.attribute} Proxy Groups
                    </h4>
                    <div className="divide-y divide-border/60">
                      {attr.rows.map((r) => (
                        <RatioRow key={r.group} row={r} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
