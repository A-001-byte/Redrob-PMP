/** Shared theme-aware chart chrome: card shell, axis/grid constants, and a
 *  theme-aware tooltip. */

export const AXIS_TICK = { fill: '#8B8D98', fontSize: 11, fontFamily: '"JetBrains Mono", monospace' };
export const GRID_STROKE = 'var(--border)';
export const CURSOR_FILL = { fill: '#8B8D98', fillOpacity: 0.15 };

export function DarkTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-border bg-surface px-4 py-2.5 text-xs shadow-sm">
      {label !== undefined && (
        <div className="mb-1.5 font-heading font-bold text-foreground">{label}</div>
      )}
      {payload.map((p) => (
        <div key={p.dataKey ?? p.name} className="flex items-center gap-2 py-0.5 font-mono">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: p.color ?? p.payload?.fill }}
          />
          <span className="text-muted">{p.name}</span>
          <span className="ml-auto pl-3 font-semibold text-foreground">
            {formatter ? formatter(p.value, p) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ChartCard({ title, insight, children }) {
  return (
    <div className="rounded border border-border bg-surface px-5 py-4 shadow-sm">
      <h3 className="mb-1 font-heading text-sm font-bold tracking-tight text-foreground">
        {title}
      </h3>
      {insight && <p className="mb-4 text-xs text-muted font-body">{insight}</p>}
      {children}
    </div>
  );
}
