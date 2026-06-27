import { motion } from 'framer-motion';
import { Filter } from 'lucide-react';

const STAGE_META = [
  { label: 'Corpus Pool', detail: 'Total candidate screening pool', color: 'bg-foreground/20' },
  { label: 'L0 · Dense FAISS', detail: 'Dense vector search vs JD embedding', color: 'bg-tertiary' },
  { label: 'L1 · Hybrid Fusion', detail: 'RRF fusion of dense + BM25 scores', color: 'bg-accent' },
  { label: 'L2 · Cross-Encoder', detail: 'Deep semantic MS-MARCO re-ranking', color: 'bg-secondary' },
  { label: 'L3 · Composite Score', detail: 'Weighted multidimensional scoring', color: 'bg-primary' },
  { label: 'Final Top 100', detail: 'Defensible safety-validated cohort', color: 'bg-success' },
];

export default function FunnelChart({ funnel }) {
  if (!funnel?.stages) return null;
  const counts = [funnel.corpus, ...funnel.stages];
  const maxLog = Math.log10(Math.max(...counts));

  // Logarithmic scaling for visual representation of high-density filters
  const widthPct = (c) => Math.max(8, (Math.log10(Math.max(c, 1)) / maxLog) * 100);

  return (
    <div className="bg-surface border border-border rounded p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/5 border border-primary/10 text-primary">
            <Filter className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-heading text-sm font-bold text-primary">Ranking Funnel</h3>
            <p className="text-[10px] text-muted font-bold uppercase tracking-wider mt-0.5">Logarithmic scale pipeline progression</p>
          </div>
        </div>
        
        <div>
          <span className="px-3 py-1 rounded bg-sidebar border border-border text-[9px] font-bold text-muted uppercase tracking-widest">
            6 Pipeline Layers
          </span>
        </div>
      </div>

      <div className="space-y-4.5">
        {counts.map((count, i) => {
          const meta = STAGE_META[i];
          const previousCount = i > 0 ? counts[i - 1] : counts[0];
          const conversionRate = i > 0 ? (count / previousCount) * 100 : 100;

          return (
            <div key={meta.label} className="relative group">
              <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-xs">
                {/* Stage Info */}
                <div className="w-44 shrink-0" title={meta.detail}>
                  <div className="font-heading font-bold text-primary text-sm group-hover:text-secondary transition-colors">
                    {meta.label}
                  </div>
                  <div className="text-[10px] text-muted font-medium truncate mt-0.5">
                    {meta.detail}
                  </div>
                </div>

                {/* Progress Visual Bar */}
                <div className="h-3 flex-1 overflow-hidden rounded bg-sidebar border border-border relative flex items-center">
                  <motion.div
                    className={`h-full rounded ${meta.color}`}
                    initial={{ width: 0 }}
                    whileInView={{ width: `${widthPct(count)}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: i * 0.06 }}
                  />
                </div>

                {/* Statistics & Conversion pills */}
                <div className="flex items-center gap-3 shrink-0 justify-between md:justify-end">
                  {i > 0 && (
                    <span className="px-2.5 py-0.5 rounded bg-sidebar border border-border text-[9px] font-bold text-muted uppercase tracking-widest" title="Conversion from previous stage">
                      {conversionRate >= 100 ? '100%' : `${conversionRate.toFixed(1)}% filter`}
                    </span>
                  )}
                  <span className="font-mono font-bold text-primary w-16 text-right">
                    {count.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Funnel safety check audit logs */}
      <div className="mt-6 pt-5 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-background border border-border rounded px-4 py-3.5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className={`h-2 w-2 rounded-full ${funnel.l5_demotions ? 'bg-warning animate-pulse' : 'bg-success'}`} />
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted">
                L5 Assessment Demotions
              </div>
              <div className="text-[10px] text-muted/80 font-medium mt-0.5">
                Failed safety thresholds
              </div>
            </div>
          </div>
          <span className={`font-mono text-xs font-bold ${funnel.l5_demotions ? 'text-warning' : 'text-muted'}`}>
            {funnel.l5_demotions} candidates
          </span>
        </div>

        <div className="bg-background border border-border rounded px-4 py-3.5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className={`h-2 w-2 rounded-full ${funnel.l6_replacements ? 'bg-destructive animate-pulse' : 'bg-success'}`} />
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted">
                L6 Safety Replacements
              </div>
              <div className="text-[10px] text-muted/80 font-medium mt-0.5">
                Honeypot or blacklisted profiles
              </div>
            </div>
          </div>
          <span className={`font-mono text-xs font-bold ${funnel.l6_replacements ? 'text-destructive' : 'text-muted'}`}>
            {funnel.l6_replacements} candidates
          </span>
        </div>
      </div>
    </div>
  );
}
