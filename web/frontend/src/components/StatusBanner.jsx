import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

export default function StatusBanner({ rerank }) {
  const { status, message, progress } = rerank;

  return (
    <AnimatePresence>
      {status !== 'idle' && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="overflow-hidden border-b border-border bg-surface"
        >
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
        {status === 'running' && (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
        )}
        {status === 'success' && (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
        )}
        {status === 'error' && (
          <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        )}
        <span
          className={`text-sm font-medium ${
            status === 'error'
              ? 'text-destructive'
              : status === 'success'
                ? 'text-success'
                : 'text-muted'
          }`}
        >
          {status === 'success' ? `✓ ${message}` : message}
        </span>
        {status === 'running' && (
          <div className="ml-auto flex w-1/3 min-w-32 items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded bg-muted">
              <div
                className="h-full rounded bg-primary animate-bar-pulse transition-[width] duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="font-heading text-xs text-muted">{progress}%</span>
          </div>
        )}
      </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
