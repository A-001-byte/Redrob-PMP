import { AlertTriangle, CircleAlert, Info, Sparkles } from 'lucide-react';
import { buildProbes, buildStrengths } from '../../utils/probes.js';

const SEVERITY = {
  high: { icon: AlertTriangle, tone: 'text-red-400', chip: 'bg-red-400/10 text-red-400' },
  medium: { icon: CircleAlert, tone: 'text-amber-400', chip: 'bg-amber-400/10 text-amber-400' },
  low: { icon: Info, tone: 'text-slate-400', chip: 'bg-slate-400/10 text-slate-400' },
};

/** "What to probe in the interview" — deterministic guidance derived from
 *  the candidate's own record; every line traces to a data point. */
export default function InterviewPrep({ data }) {
  const strengths = buildStrengths(data);
  const probes = buildProbes(data);

  if (!strengths.length && !probes.length) return null;

  return (
    <div className="space-y-3">
      {strengths.length > 0 && (
        <ul className="space-y-1.5">
          {strengths.map((s) => (
            <li key={s} className="flex items-start gap-2 text-sm text-slate-300">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
              {s}
            </li>
          ))}
        </ul>
      )}

      {probes.length > 0 && (
        <div className="space-y-2">
          {probes.map((p) => {
            const cfg = SEVERITY[p.severity];
            const Icon = cfg.icon;
            return (
              <div key={p.title} className="rounded-md border border-border bg-surface-hover/50 p-3">
                <div className="flex items-center gap-2">
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg.tone}`} aria-hidden="true" />
                  <span className={`text-xs font-medium ${cfg.tone}`}>{p.title}</span>
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 font-heading text-[10px] uppercase ${cfg.chip}`}
                  >
                    {p.severity}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{p.question}</p>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-slate-600">
        Generated deterministically from this candidate&apos;s record — no inference beyond the data.
      </p>
    </div>
  );
}
