/** Shared dark-theme chart chrome: card shell, axis/grid constants, and a
 *  dark tooltip (recharts' default tooltip is white). */

export const AXIS_TICK = { fill: '#94A3B8', fontSize: 11, fontFamily: '"Fira Code", monospace' };
export const GRID_STROKE = '#1E293B';
export const CURSOR_FILL = { fill: 'rgba(96, 165, 250, 0.08)' };

export function DarkTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-surface-hover px-3 py-2 text-xs shadow-lg">
      {label !== undefined && (
        <div className="mb-1 font-heading font-medium text-slate-300">{label}</div>
      )}
      {payload.map((p) => (
        <div key={p.dataKey ?? p.name} className="flex items-center gap-2 py-0.5">
          <span
            className="h-2 w-2 shrink-0 rounded-sm"
            style={{ backgroundColor: p.color ?? p.payload?.fill }}
          />
          <span className="text-slate-400">{p.name}</span>
          <span className="ml-auto pl-3 font-heading text-slate-200">
            {formatter ? formatter(p.value, p) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ChartCard({ title, insight, children }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <h3 className="mb-1 font-heading text-xs font-semibold uppercase tracking-wide text-foreground">
        {title}
      </h3>
      {insight && <p className="mb-3 text-xs text-slate-500">{insight}</p>}
      {children}
    </div>
  );
}
