import { useState } from 'react';
import { ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { DEFAULT_WEIGHTS } from '../../utils/whatif.js';
import { PART_COLORS, PART_LABELS } from '../../utils/formatters.js';

/** "What if my team weighs the signals differently?" — live re-blend of the
 *  interpretable composite. The official submission ranking is never touched. */
export default function WhatIfPanel({ weights, onChange, active }) {
  const [open, setOpen] = useState(false);
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;

  return (
    <section
      className={`rounded-lg border bg-surface ${active ? 'border-amber-500/40' : 'border-border'}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left
                   transition-colors duration-150 hover:bg-surface-hover
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <SlidersHorizontal className="h-4 w-4 text-secondary" aria-hidden="true" />
        <span className="font-heading text-sm font-semibold text-foreground">
          What-if re-weighting
        </span>
        <span className="text-xs text-slate-500">
          re-blend the composite live — proves the score is no black box
        </span>
        {active && (
          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 font-heading text-[10px] uppercase text-amber-400">
            active
          </span>
        )}
        <ChevronDown
          className={`ml-auto h-4 w-4 text-slate-500 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3">
          <div className="space-y-2.5">
            {Object.keys(DEFAULT_WEIGHTS).map((k) => (
              <div key={k} className="flex items-center gap-3 text-sm">
                <span className="flex w-28 shrink-0 items-center gap-1.5 text-slate-400">
                  <span
                    className="h-2 w-2 rounded-sm"
                    style={{ backgroundColor: PART_COLORS[k] }}
                    aria-hidden="true"
                  />
                  {PART_LABELS[k]}
                </span>
                <input
                  type="range"
                  min="0"
                  max="0.5"
                  step="0.01"
                  value={weights[k]}
                  onChange={(e) => onChange({ ...weights, [k]: parseFloat(e.target.value) })}
                  aria-label={`${PART_LABELS[k]} weight`}
                  className="flex-1 cursor-pointer accent-blue-500"
                />
                <span className="w-20 shrink-0 text-right font-heading text-xs text-slate-300">
                  {weights[k].toFixed(2)}
                  <span className="text-slate-600"> ({Math.round((weights[k] / total) * 100)}%)</span>
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3 border-t border-border pt-3 text-xs text-slate-500">
            <span>
              Weights normalize to 100%. Adjustments, penalties, and the availability
              multiplier reapply exactly as in scorer.py — the official submission is unchanged.
            </span>
            <button
              type="button"
              onClick={() => onChange({ ...DEFAULT_WEIGHTS })}
              disabled={!active}
              className="ml-auto flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md
                         border border-border px-3 py-1.5 text-slate-300 transition-colors
                         duration-150 hover:bg-surface-hover focus:outline-none
                         focus-visible:ring-2 focus-visible:ring-ring
                         disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reset to official
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
