import { useEffect, useState } from 'react';
import { Radar, RefreshCw } from 'lucide-react';
import { timeAgo } from '../utils/formatters.js';

export default function Header({ generatedAt, health, reranking, onRerank }) {
  // re-render every 30s so "Last ranked: X ago" stays current
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const healthy = health?.status === 'ok' && health?.artifacts_loaded;

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Radar className="h-6 w-6 text-primary" aria-hidden="true" />
          <h1 className="font-heading text-lg font-semibold text-foreground">
            Redrob Ranker
          </h1>
        </div>
        <span className="hidden text-sm text-slate-500 sm:inline">
          Last ranked: {timeAgo(generatedAt)}
        </span>
        <div className="ml-auto flex items-center gap-4">
          <span
            className="flex items-center gap-1.5 text-xs text-slate-500"
            title={
              healthy
                ? 'Backend healthy, artifacts loaded'
                : 'Backend unreachable or artifacts missing'
            }
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                healthy ? 'bg-emerald-500' : 'bg-destructive'
              }`}
            />
            {healthy ? 'API healthy' : 'API down'}
          </span>
          <button
            type="button"
            onClick={onRerank}
            disabled={reranking}
            className="flex cursor-pointer items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm
                       font-medium text-on-primary transition-colors duration-200
                       hover:bg-amber-700 focus:outline-none focus-visible:ring-2
                       focus-visible:ring-ring focus-visible:ring-offset-2
                       disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${reranking ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {reranking ? 'Ranking…' : 'Re-rank'}
          </button>
        </div>
      </div>
    </header>
  );
}
