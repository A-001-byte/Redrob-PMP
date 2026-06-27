import { useState } from 'react';
import { ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { DEFAULT_WEIGHTS } from '../../utils/whatif.js';
import { PART_COLORS } from '../../utils/formatters.js';

const RECRUITER_LABELS = {
  career: {
    label: 'Academic & Career Prestige',
    desc: 'Prioritizes histories at top-tier universities and product-engineering employers.',
  },
  semantic: {
    label: 'Contextual Role Alignment',
    desc: 'Evaluates semantic matches between JD details and candidate profiles using AI embeddings.',
  },
  skill: {
    label: 'Technical Stack Evidence',
    desc: 'Matches direct keyword and skill evidence found in career history and projects.',
  },
  assessment: {
    label: 'Verified Skill Assessments',
    desc: 'Weights by verified screening platform assessment scores (demotes candidates failing hard gates).',
  },
  experience: {
    label: 'Tenure & Geography Fit',
    desc: 'Aligns candidate profiles against targeted experience levels (YoE) and local office hubs.',
  },
};

/** "What if my team weighs the signals differently?" — live re-blend of the
 *  interpretable composite. The official submission ranking is never touched. */
export default function WhatIfPanel({ weights, onChange, active }) {
  const [open, setOpen] = useState(false);
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;

  return (
    <section
      className={`rounded border transition-all duration-150 ${
        active 
          ? 'bg-secondary/5 border-secondary/30 shadow-sm' 
          : 'bg-surface border-border hover:border-primary/20 shadow-sm hover-lift'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between sm:justify-start gap-3 px-5 py-4 text-left focus:outline-none"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10 border border-primary/20 text-primary shrink-0">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-heading text-sm font-bold text-primary tracking-tight">
              Hiring Criteria Calibration Console
            </span>
            <span className="text-[11px] text-muted font-medium mt-0.5">
              Profile weighting simulator — adjust AI signal prioritizations to customize matching criteria
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-auto font-mono">
          {active && (
            <span className="rounded-sm bg-secondary/10 border border-secondary/20 px-2.5 py-0.5 text-[9px] uppercase text-secondary font-bold tracking-widest animate-pulse">
              Calibration Active
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 text-muted transition-transform duration-300 ${
              open ? 'rotate-180 text-primary' : ''
            }`}
            aria-hidden="true"
          />
        </div>
      </button>

      {open && (
        <div className="border-t border-border bg-surface-hover/50 px-5 py-4 space-y-5">
          <div className="space-y-4">
            {Object.keys(DEFAULT_WEIGHTS).map((k) => {
              const labelInfo = RECRUITER_LABELS[k] || { label: k, desc: '' };
              return (
                <div key={k} className="flex flex-col md:flex-row md:items-start gap-3 text-xs border-b border-border/30 pb-3 last:border-none last:pb-0">
                  <div className="w-full md:w-56 shrink-0">
                    <span className="flex items-center gap-2 text-muted font-mono font-semibold uppercase tracking-wider">
                      <span
                        className="h-2 w-2 rounded-sm shadow-sm shrink-0"
                        style={{ backgroundColor: PART_COLORS[k] }}
                        aria-hidden="true"
                      />
                      {labelInfo.label}
                    </span>
                    <p className="text-[10px] text-muted font-normal mt-1 leading-relaxed">
                      {labelInfo.desc}
                    </p>
                  </div>
                  <div className="flex-1 flex items-center gap-4 w-full pt-1">
                    <input
                      type="range"
                      min="0"
                      max="0.5"
                      step="0.01"
                      value={weights[k]}
                      onChange={(e) => onChange({ ...weights, [k]: parseFloat(e.target.value) })}
                      aria-label={`${labelInfo.label} weight`}
                      className="flex-1 h-1.5 cursor-pointer rounded-lg appearance-none bg-border accent-secondary focus:outline-none"
                    />
                    <span className="w-24 shrink-0 text-right font-mono text-muted">
                      <strong className="text-primary font-bold">{weights[k].toFixed(2)}</strong>
                      <span className="text-muted/70 font-medium"> ({Math.round((weights[k] / total) * 100)}%)</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-4 border-t border-border pt-4 text-[10px] font-medium text-muted">
            <span className="leading-relaxed">
              Weights normalize dynamically. Subscores, anti-fit penalties, and location multipliers reapply live. The submission-spec logic remains unaffected.
            </span>
            <button
              type="button"
              onClick={() => onChange({ ...DEFAULT_WEIGHTS })}
              disabled={!active}
              className="sm:ml-auto flex shrink-0 cursor-pointer items-center gap-1.5 rounded
                         border border-border bg-surface px-4 py-1.5 text-xs font-semibold text-primary transition-all
                         duration-150 hover:bg-surface-hover hover:text-secondary disabled:cursor-not-allowed disabled:opacity-30 active:scale-[0.97]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reset to Official Weights</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
