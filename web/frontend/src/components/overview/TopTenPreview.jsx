import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { fadeUp, stagger } from '../motion/presets.js';
import {
  PART_COLORS,
  PART_LABELS,
  fmtScore,
  scoreColor,
  scoreTextColor,
  scoreWidthPct,
} from '../../utils/formatters.js';

function MiniSparkbar({ parts }) {
  const entries = Object.entries(PART_COLORS).map(([k, color]) => ({
    key: k,
    color,
    value: Math.max(0, parts?.[k] ?? 0),
  }));
  const title = entries.map((e) => `${PART_LABELS[e.key]}: ${e.value.toFixed(3)}`).join('\n');
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-sm bg-muted" title={title}>
      {entries.map((e) => (
        <div key={e.key} style={{ flexGrow: e.value, backgroundColor: e.color }} className="h-full" />
      ))}
    </div>
  );
}

export default function TopTenPreview({ candidates, onSelect }) {
  const top = candidates.slice(0, 10);

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold text-foreground">The top 10</h2>
          <p className="mt-1 text-sm text-slate-500">
            Click any card for the full profile and score waterfall.
          </p>
        </div>
        <Link
          to="/candidates"
          className="flex shrink-0 items-center gap-1.5 text-sm text-secondary transition-colors
                     duration-150 hover:text-blue-300 focus:outline-none focus-visible:ring-2
                     focus-visible:ring-ring"
        >
          View all 100 <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      {top.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-slate-500">
          No submission yet — click Re-rank to run the pipeline.
        </div>
      ) : (
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          variants={stagger}
          className="grid gap-3 sm:grid-cols-2"
        >
          {top.map((c) => (
            <motion.button
              key={c.candidate_id}
              variants={fadeUp}
              type="button"
              onClick={() => onSelect(c.candidate_id)}
              className="glass hover-lift cursor-pointer rounded-xl border border-border p-4
                         text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg
                             bg-primary/20 font-heading text-sm font-bold text-secondary"
                >
                  {c.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-200">
                    {c.title || '--'}
                  </div>
                  <div className="truncate font-heading text-xs text-slate-500">
                    {c.candidate_id} · {c.location || '--'}
                  </div>
                </div>
                <span className={`font-heading text-sm font-semibold ${scoreTextColor(c.score)}`}>
                  {fmtScore(c.score)}
                </span>
              </div>
              <div className="mt-3 space-y-1.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full ${scoreColor(c.score)}`}
                    style={{ width: scoreWidthPct(c.score) }}
                  />
                </div>
                <MiniSparkbar parts={c.parts} />
              </div>
            </motion.button>
          ))}
        </motion.div>
      )}
    </div>
  );
}
