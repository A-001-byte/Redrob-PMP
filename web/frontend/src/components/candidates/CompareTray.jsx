import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { GitCompareArrows, X } from 'lucide-react';

/** Floating tray shown while 2–3 candidates are check-selected in the table. */
export default function CompareTray({ ids, onClear }) {
  const navigate = useNavigate();

  return (
    <AnimatePresence>
      {ids.length >= 1 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 300 }}
          className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2"
        >
          <div className="glass-strong flex items-center gap-3 rounded-full border border-border
                          py-2 pl-5 pr-2 shadow-glow">
            <span className="font-heading text-xs text-slate-300">
              {ids.length} selected
              <span className="text-slate-500"> / 3</span>
            </span>
            <button
              type="button"
              onClick={() => navigate(`/compare?ids=${ids.join(',')}`)}
              disabled={ids.length < 2}
              className="flex cursor-pointer items-center gap-2 rounded-full bg-primary px-4 py-1.5
                         text-sm font-medium text-on-primary transition-all duration-200
                         hover:bg-blue-800 hover:shadow-glow focus:outline-none
                         focus-visible:ring-2 focus-visible:ring-ring
                         disabled:cursor-not-allowed disabled:opacity-50"
            >
              <GitCompareArrows className="h-4 w-4" aria-hidden="true" />
              Compare
            </button>
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear selection"
              className="cursor-pointer rounded-full p-1.5 text-slate-500 transition-colors
                         duration-150 hover:bg-surface-hover hover:text-slate-300
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
