import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, MapPin } from 'lucide-react';
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
    <div className="flex h-1.5 w-full overflow-hidden rounded bg-sidebar" title={title}>
      {entries.map((e) => (
        <div key={e.key} style={{ flexGrow: e.value, backgroundColor: e.color }} className="h-full first:rounded-l last:rounded-r border-r border-background/20 last:border-none" />
      ))}
    </div>
  );
}

export default function TopTenPreview({ candidates, onSelect }) {
  const top = candidates.slice(0, 10);

  return (
    <div className="space-y-4">

      {top.length === 0 ? (
        <div className="rounded border border-border bg-surface/30 px-4 py-16 text-center text-xs text-muted">
          No submission yet — click Re-rank to run the pipeline.
        </div>
      ) : (
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1 }}
          variants={stagger}
          className="grid gap-4 sm:grid-cols-2"
        >
          {top.map((c) => (
            <motion.button
              key={c.candidate_id}
              variants={fadeUp}
              type="button"
              onClick={() => onSelect(c.candidate_id)}
              className="bg-surface border border-border hover:border-primary/45 rounded p-5 text-left focus:outline-none transition-all duration-150 cursor-pointer flex flex-col justify-between group relative overflow-hidden"
            >
              <div className="flex items-start gap-4">
                {/* Rank indicator circle */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-primary text-on-primary font-extrabold text-caption">
                  #{c.rank}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-body-sm font-semibold text-foreground tracking-wide group-hover:text-primary transition-colors">
                     {c.title || 'Untitled Candidate'}
                  </div>
                  <div className="flex items-center gap-1.5 text-caption text-muted font-medium truncate mt-1">
                    <span className="font-mono text-muted bg-sidebar border border-border px-1.5 py-0.5 rounded-sm">
                      {c.candidate_id.slice(0, 8)}
                    </span>
                    <span>·</span>
                    <span className="flex items-center gap-0.5">
                      <MapPin className="h-3 w-3 text-muted" />
                      {c.location || 'Unknown'}
                    </span>
                  </div>
                </div>

                {/* Score badge indicator */}
                <div className={`shrink-0 font-heading text-caption font-bold px-2.5 py-1 rounded-sm border ${
                  c.score > 0.8 
                    ? 'bg-success/10 border-success/20 text-success'
                    : c.score >= 0.6 
                      ? 'bg-warning/10 border-warning/20 text-warning'
                      : 'bg-destructive/10 border-destructive/20 text-destructive'
                }`}>
                  {fmtScore(c.score)}
                </div>
              </div>

              {/* Progress bars & Sparkbar details */}
              <div className="mt-5 space-y-3.5">
                {/* Composite Score Progress */}
                <div>
                  <div className="flex justify-between text-label uppercase text-muted mb-1.5">
                    <span>Composite Score</span>
                    <span className={scoreTextColor(c.score)}>{(c.score * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded bg-sidebar border border-border">
                    <div
                      className={`h-full rounded ${scoreColor(c.score)}`}
                      style={{ width: scoreWidthPct(c.score) }}
                    />
                  </div>
                </div>

                {/* Segmented component scores breakdown */}
                <div>
                  <div className="text-label uppercase text-muted mb-1.5">
                    Component Breakdown
                  </div>
                  <MiniSparkbar parts={c.parts} />
                </div>
              </div>
            </motion.button>
          ))}
        </motion.div>
      )}

      {top.length > 0 && (
        <div className="mt-8 flex justify-center">
          <Link
            to="/candidates"
            className="inline-flex items-center gap-2 rounded border border-border bg-sidebar text-body-sm font-semibold text-muted px-6 py-2.5 hover:bg-surface-hover hover:text-primary hover:border-primary/20 transition-all duration-150"
          >
            <span>Explore all 100 ranked candidates</span>
            <ArrowRight className="h-4 w-4 text-primary" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
