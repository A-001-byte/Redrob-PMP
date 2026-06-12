import { motion } from 'framer-motion';

const MS_PER_MONTH = 30.44 * 24 * 3600 * 1000;
const BAR_COLORS = ['#60A5FA', '#3B82F6', '#818CF8', '#93C5FD', '#2563EB'];

function parseStart(d) {
  if (!d) return null;
  const t = Date.parse(d);
  return Number.isNaN(t) ? null : t;
}

/** Horizontal Gantt of career history — overlaps and gaps become visible
 *  at a glance (the honeypot timeline check, drawn). Falls back to nothing
 *  when start dates are missing; the textual history below still shows. */
export default function CareerTimeline({ history }) {
  const roles = (history ?? [])
    .map((j) => {
      const start = parseStart(j.start_date);
      if (start === null) return null;
      const end = j.is_current
        ? Date.now()
        : start + (j.duration_months ?? 0) * MS_PER_MONTH;
      return { ...j, start, end: Math.max(end, start + MS_PER_MONTH) };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  if (roles.length < 2) return null;

  const min = roles[0].start;
  const max = Math.max(...roles.map((r) => r.end));
  const span = max - min || 1;
  const pct = (t) => ((t - min) / span) * 100;

  const firstYear = new Date(min).getFullYear() + 1;
  const lastYear = new Date(max).getFullYear();
  const step = Math.max(1, Math.ceil((lastYear - firstYear) / 6));
  const years = [];
  for (let y = firstYear; y <= lastYear; y += step) years.push(y);

  return (
    <div className="mb-4">
      <div className="relative rounded-md border border-border bg-surface-hover/40 px-2 pb-5 pt-2">
        {/* year gridlines */}
        {years.map((y) => {
          const x = pct(Date.UTC(y, 0, 1));
          if (x < 2 || x > 98) return null;
          return (
            <div key={y}>
              <div
                className="absolute bottom-5 top-2 w-px bg-border/60"
                style={{ left: `${x}%` }}
                aria-hidden="true"
              />
              <span
                className="absolute bottom-0.5 -translate-x-1/2 font-heading text-[9px] text-slate-600"
                style={{ left: `${x}%` }}
              >
                {y}
              </span>
            </div>
          );
        })}

        <div className="space-y-1">
          {roles.map((r, i) => (
            <div key={`${r.company}-${r.start}`} className="relative h-4">
              <motion.div
                className={`absolute top-0.5 h-3 rounded-sm ${
                  r.is_current ? 'shadow-glow-emerald' : ''
                }`}
                style={{
                  left: `${pct(r.start)}%`,
                  backgroundColor: r.is_current ? '#34D399' : BAR_COLORS[i % BAR_COLORS.length],
                }}
                initial={{ width: 0 }}
                whileInView={{ width: `${Math.max(1.5, pct(r.end) - pct(r.start))}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.05 }}
                title={`${r.title ?? '?'} @ ${r.company ?? '?'} · ${r.duration_months ?? '?'} mo${
                  r.is_current ? ' · current' : ''
                }`}
              />
            </div>
          ))}
        </div>
      </div>
      <p className="mt-1 text-[10px] text-slate-600">
        Hover a bar for the role · green = current · gaps and overlaps are real data
      </p>
    </div>
  );
}
