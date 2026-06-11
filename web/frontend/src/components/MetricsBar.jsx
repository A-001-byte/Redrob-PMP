import { fmtScore } from '../utils/formatters.js';

function MetricCard({ label, value, tone = 'text-foreground', hint }) {
  return (
    <div
      className="rounded-lg border border-border bg-white px-4 py-3"
      title={hint}
    >
      <div className={`font-heading text-2xl font-semibold ${tone}`}>
        {value}
      </div>
      <div className="mt-0.5 text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
    </div>
  );
}

export default function MetricsBar({ metrics }) {
  if (!metrics) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="h-[74px] animate-pulse rounded-lg border border-border bg-muted"
          />
        ))}
      </div>
    );
  }

  const zeroGood = (n) => (n === 0 ? 'text-emerald-600' : 'text-destructive');

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <MetricCard
        label="Honeypots in top 100"
        value={metrics.honeypot_count}
        tone={zeroGood(metrics.honeypot_count)}
        hint="Fabricated profiles — must be 0"
      />
      <MetricCard
        label="Disqualified in top 100"
        value={metrics.disqualified_count}
        tone={zeroGood(metrics.disqualified_count)}
        hint="Hard-disqualified candidates — must be 0"
      />
      <MetricCard label="Mean score · top 10" value={fmtScore(metrics.mean_score_top10)} />
      <MetricCard label="Mean score · top 50" value={fmtScore(metrics.mean_score_top50)} />
      <MetricCard
        label="Candidates ranked"
        value={metrics.total_count}
        hint={
          metrics.last_run_time_seconds
            ? `Last pipeline run: ${metrics.last_run_time_seconds}s`
            : undefined
        }
      />
    </div>
  );
}
