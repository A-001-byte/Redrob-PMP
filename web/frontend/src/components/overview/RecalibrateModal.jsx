import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, SlidersHorizontal, Sparkles, TrendingUp, CheckCircle2 } from 'lucide-react';

export default function RecalibrateModal({ isOpen, onClose }) {
  const [weights, setWeights] = useState({
    technical: 65,
    leadership: 40,
    culture: 50,
  });
  const [yoeToggle, setYoeToggle] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const handleApply = () => {
    setIsApplying(true);
    // Simulate API call
    setTimeout(() => {
      setIsApplying(false);
      onClose();
    }, 1500);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="recalibrate-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      >
        <motion.div
          initial={{ y: 20, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-xl overflow-hidden rounded-lg border border-border bg-surface shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-border px-6 py-5 bg-surface-hover/30">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                <h2 className="text-heading-md font-bold tracking-tight text-foreground">
                  Recalibrate Model Weights
                </h2>
              </div>
              <p className="text-body-sm text-muted max-w-md">
                Adjust scoring weights to correct for algorithmic bias in the Engineering cluster.
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Targeted Fix */}
            <div className="rounded-md border border-warning/20 bg-warning/5 p-4 flex items-start gap-4">
              <div className="mt-0.5">
                <div className={`relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full transition-colors ${yoeToggle ? 'bg-warning' : 'bg-surface-hover border border-border'}`} onClick={() => setYoeToggle(!yoeToggle)}>
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${yoeToggle ? 'translate-x-5' : 'translate-x-1'}`} />
                </div>
              </div>
              <div>
                <p className="text-body-sm font-semibold text-foreground">Down-weight "Years of Experience"</p>
                <p className="text-caption text-muted mt-0.5">Applies a 0.5x multiplier to the YOE vector to prevent tenure bias against highly skilled junior engineers.</p>
              </div>
            </div>

            {/* Sliders */}
            <div className="space-y-5">
              {[
                { id: 'technical', label: 'Technical Proficiency', val: weights.technical },
                { id: 'leadership', label: 'Leadership Potential', val: weights.leadership },
                { id: 'culture', label: 'Cultural Fit', val: weights.culture },
              ].map((item) => (
                <div key={item.id}>
                  <div className="flex justify-between mb-2">
                    <label className="text-body-sm font-semibold text-foreground">{item.label}</label>
                    <span className="font-mono text-data-sm text-muted">{item.val}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={item.val}
                    onChange={(e) => setWeights({ ...weights, [item.id]: parseInt(e.target.value) })}
                    className="h-1.5 w-full appearance-none rounded-full bg-surface-hover outline-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                </div>
              ))}
            </div>

            {/* Predictive Impact */}
            <div className="rounded-md border border-success/20 bg-success/5 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-success">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-caption font-semibold uppercase tracking-[0.06em] text-success">Predicted Impact</p>
                  <p className="text-body-sm font-semibold text-foreground mt-0.5">Diversity Lift in Top 100</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-success font-mono">
                <TrendingUp className="h-4 w-4" />
                <span className="text-data-lg font-bold">
                  +{yoeToggle ? '12.4' : '4.1'}%
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4 bg-surface/50">
            <button
              onClick={onClose}
              disabled={isApplying}
              className="rounded px-4 py-2 text-body-sm font-semibold text-muted hover:text-foreground transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={isApplying}
              className="flex items-center gap-2 rounded bg-primary px-4 py-2 text-body-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isApplying ? (
                <>
                  <Sparkles className="h-4 w-4 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Apply Recalibration
                </>
              )}
            </button>
          </div>
        </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
