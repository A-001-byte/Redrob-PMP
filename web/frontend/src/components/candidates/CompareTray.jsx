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
          initial={{ y: 80, opacity: 0, x: '-50%' }}
          animate={{ y: 0, opacity: 1, x: '-50%' }}
          exit={{ y: 80, opacity: 0, x: '-50%' }}
          transition={{ type: 'spring', damping: 24, stiffness: 280 }}
          className="fixed bottom-6 left-1/2 z-30"
        >
          <div className="bg-surface flex items-center gap-4.5 rounded border border-border py-2.5 pl-5 pr-2.5 shadow-lg">
            <span className="font-heading text-xs font-semibold text-primary">
              {ids.length} selected
              <span className="text-muted font-medium"> / 3</span>
            </span>
            <button
              type="button"
              onClick={() => navigate(`/compare?ids=${ids.join(',')}`)}
              disabled={ids.length < 2}
              className="flex cursor-pointer items-center gap-2 rounded bg-primary hover:bg-primary/90 text-white font-semibold text-xs px-4.5 py-2 transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.97]"
            >
              <GitCompareArrows className="h-4 w-4" aria-hidden="true" />
              <span>Compare candidates</span>
            </button>
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear selection"
              className="cursor-pointer rounded p-1.5 text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-primary focus:outline-none"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
