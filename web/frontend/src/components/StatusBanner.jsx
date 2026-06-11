import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

export default function StatusBanner({ rerank }) {
  const { status, message, progress } = rerank;
  if (status === 'idle') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-border bg-white"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
        {status === 'running' && (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
        )}
        {status === 'success' && (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
        )}
        {status === 'error' && (
          <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        )}
        <span
          className={`text-sm font-medium ${
            status === 'error'
              ? 'text-destructive'
              : status === 'success'
                ? 'text-emerald-600'
                : 'text-slate-600'
          }`}
        >
          {status === 'success' ? `✓ ${message}` : message}
        </span>
        {status === 'running' && (
          <div className="ml-auto flex w-1/3 min-w-32 items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="font-heading text-xs text-slate-500">{progress}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
