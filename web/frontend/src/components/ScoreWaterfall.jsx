import { PART_COLORS, PART_LABELS } from '../utils/formatters.js';

/** Waterfall of the composite: each weighted part floats at the running
 *  total, adjustments push it up/down, the clamped base subtotals it, and
 *  the multiplier chain scales it to the final composite. Parts arrive
 *  weight-applied from scorer.py — no weights duplicated here. Shared by
 *  the candidate drawer and the compare page. */
export default function ScoreWaterfall({ parts }) {
  const main = ['semantic', 'career', 'skill', 'experience', 'assessment'];
  const adj = ['trajectory', 'consistency', 'anchor_penalty'];

  const steps = [];
  let run = 0;
  for (const k of main) {
    const d = parts[k] ?? 0;
    steps.push({ k, delta: d, start: run, color: PART_COLORS[k] });
    run += d;
  }
  for (const k of adj) {
    const d = parts[k] ?? 0;
    steps.push({ k, delta: d, start: run, color: d < 0 ? 'var(--danger)' : 'var(--accent)' });
    run += d;
  }

  const base = parts.base ?? Math.max(0, Math.min(1, run));
  const avail = parts.availability_multiplier ?? 1;
  const dq = parts.dq_multiplier ?? 1;
  const hp = parts.honeypot_multiplier ?? 1;
  const composite = parts.composite ?? base * avail * dq * hp;
  const scale = Math.max(0.3, run, base, composite);
  const pct = (x) => `${Math.max(0, (x / scale) * 100)}%`;

  const Bar = ({ label, start, width, color, value, tone = 'text-muted' }) => (
    <div className="flex items-center gap-2 text-caption">
      <span className="w-24 shrink-0 text-muted">{label}</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded bg-background border border-border">
        <div
          className="absolute h-full rounded"
          style={{
            left: pct(start),
            width: `max(2px, ${pct(width)})`,
            backgroundColor: color,
          }}
        />
      </div>
      <span className={`w-14 shrink-0 text-right font-mono ${tone}`}>{value}</span>
    </div>
  );

  return (
    <div className="space-y-1.5">
      {steps.map(({ k, delta, start, color }) => (
        <Bar
          key={k}
          label={PART_LABELS[k]}
          start={Math.min(start, start + delta)}
          width={Math.abs(delta)}
          color={color}
          value={`${delta < 0 ? '-' : '+'}${Math.abs(delta).toFixed(3)}`}
          tone={
            delta < 0 ? 'text-destructive font-semibold' : delta === 0 ? 'text-muted/50' : 'text-primary'
          }
        />
      ))}
      <div className="border-t border-border pt-1.5">
        <Bar
          label={Math.abs(run - base) > 1e-9 ? 'Base (clamped)' : 'Base'}
          start={0}
          width={base}
          color="var(--muted)"
          value={base.toFixed(3)}
          tone="font-semibold text-primary"
        />
      </div>
      <div className="text-caption text-muted font-mono pl-26">
        × availability{' '}
        <span className="font-mono font-semibold text-primary">{avail.toFixed(2)}</span>
        {dq !== 1 && (
          <span className="text-destructive font-semibold"> · × disqualified {dq.toFixed(2)}</span>
        )}
        {hp !== 1 && <span className="text-destructive font-semibold"> · × honeypot {hp.toFixed(2)}</span>}
      </div>
      <Bar
        label="Composite"
        start={0}
        width={composite}
        color="var(--secondary)"
        value={composite.toFixed(4)}
        tone="font-bold text-secondary"
      />
    </div>
  );
}
