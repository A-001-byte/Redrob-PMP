import { motion } from 'framer-motion';
import { Filter } from 'lucide-react';

/** Stage metadata for the six-layer funnel; counts come from /api/metrics
 *  (corpus size + rank_timing.json's funnel array). */
const STAGE_META = [
  { label: 'Corpus', detail: 'all candidates', color: '#475569' },
  { label: 'L0 · FAISS', detail: 'dense retrieval vs JD embedding', color: '#93C5FD' },
  { label: 'L1 · Hybrid', detail: 'RRF fusion of dense + BM25', color: '#60A5FA' },
  { label: 'L2 · Cross-encoder', detail: 'ms-marco re-rank', color: '#3B82F6' },
  { label: 'L3 · Composite', detail: 'interpretable weighted score', color: '#2563EB' },
  { label: 'Final 100', detail: 'after L5 gate + L6 safety', color: '#1E40AF' },
];

export default function FunnelChart({ funnel }) {
  if (!funnel?.stages) return null;
  const counts = [funnel.corpus, ...funnel.stages];
  const maxLog = Math.log10(Math.max(...counts));
  // Log-scale widths: 100K → 100 spans three orders of magnitude, so a
  // linear scale would make every stage after L0 invisible.
  const widthPct = (c) => Math.max(6, (Math.log10(Math.max(c, 1)) / maxLog) * 100);

  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <h3 className="mb-2.5 flex items-center gap-2 font-heading text-xs font-semibold uppercase tracking-wide text-foreground">
        <Filter className="h-3.5 w-3.5 text-secondary" aria-hidden="true" />
        Ranking Funnel
        <span className="ml-auto font-normal normal-case tracking-normal text-slate-500">
          log scale
        </span>
      </h3>
      <div className="space-y-1.5">
        {counts.map((count, i) => {
          const meta = STAGE_META[i];
          return (
            <div key={meta.label} className="flex items-center gap-2 text-xs">
              <span className="w-36 shrink-0 text-slate-400" title={meta.detail}>
                {meta.label}
              </span>
              <div className="h-3.5 flex-1 overflow-hidden rounded-sm bg-muted">
                <motion.div
                  className="flex h-full items-center rounded-sm"
                  style={{ backgroundColor: meta.color }}
                  initial={{ width: 0 }}
                  whileInView={{ width: `${widthPct(count)}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, ease: 'easeOut', delay: i * 0.06 }}
                />
              </div>
              <span className="w-16 shrink-0 text-right font-heading text-slate-300">
                {count.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-xs text-slate-500">
        L5 assessment-gate demotions:{' '}
        <span
          className={`font-heading font-medium ${
            funnel.l5_demotions ? 'text-amber-400' : 'text-slate-500'
          }`}
        >
          {funnel.l5_demotions}
        </span>
        {' · '}L6 honeypot/DQ replacements:{' '}
        <span
          className={`font-heading font-medium ${
            funnel.l6_replacements ? 'text-red-400' : 'text-slate-500'
          }`}
        >
          {funnel.l6_replacements}
        </span>
      </div>
    </div>
  );
}
