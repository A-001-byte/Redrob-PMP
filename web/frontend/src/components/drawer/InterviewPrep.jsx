import { useState } from 'react';
import { AlertTriangle, CircleAlert, Info, CheckCircle2 } from 'lucide-react';
import { buildProbes, buildStrengths } from '../../utils/probes.js';

const SEVERITY = {
  high: { 
    icon: AlertTriangle, 
    tone: 'text-destructive', 
    chip: 'bg-destructive/10 border-destructive/20 text-destructive',
    card: 'border-destructive/20 bg-destructive/5'
  },
  medium: { 
    icon: CircleAlert, 
    tone: 'text-warning', 
    chip: 'bg-warning/10 border-warning/20 text-warning',
    card: 'border-warning/20 bg-warning/5'
  },
  low: { 
    icon: Info, 
    tone: 'text-muted', 
    chip: 'bg-surface-hover border-border text-muted',
    card: 'border-border bg-surface-hover'
  },
};

export default function InterviewPrep({ data }) {
  const strengths = buildStrengths(data);
  const probes = buildProbes(data);
  
  // Interactive checklist states
  const [checkedStrengths, setCheckedStrengths] = useState({});
  const [checkedProbes, setCheckedProbes] = useState({});

  if (!strengths.length && !probes.length) {
    return (
      <div className="text-body-sm text-muted font-medium py-2">
        No candidate strengths or probe points logged for this profile.
      </div>
    );
  }

  const toggleStrength = (idx) => {
    setCheckedStrengths(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const toggleProbe = (title) => {
    setCheckedProbes(prev => ({
      ...prev,
      [title]: !prev[title]
    }));
  };

  return (
    <div className="space-y-6">
      {/* Candidate Strengths Checklist */}
      {strengths.length > 0 && (
        <div className="border border-border bg-surface-hover rounded p-4">
          <h4 className="font-mono text-label uppercase text-muted mb-3.5 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-sm bg-success" />
            Key Strengths Checklist
          </h4>
          <div className="space-y-2">
            {strengths.map((s, idx) => (
              <label 
                key={idx} 
                className="flex items-start gap-3 text-body-sm text-foreground font-medium cursor-pointer select-none group"
              >
                <input
                  type="checkbox"
                  checked={!!checkedStrengths[idx]}
                  onChange={() => toggleStrength(idx)}
                  className="mt-0.5 h-3.5 w-3.5 cursor-pointer rounded border-border bg-surface text-primary focus:ring-primary focus:ring-offset-0 focus:ring-1"
                />
                <span className={`group-hover:text-primary transition-colors ${checkedStrengths[idx] ? 'line-through text-muted font-normal' : ''}`}>
                  {s}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Recommended Probing Questions */}
      {probes.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-mono text-label uppercase text-muted flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-sm bg-primary" />
            Recruiter Probe Questions Checklist
          </h4>
          
          <div className="space-y-2.5">
            {probes.map((p) => {
              const cfg = SEVERITY[p.severity] || SEVERITY.low;
              const Icon = cfg.icon;
              const isChecked = !!checkedProbes[p.title];
              
              return (
                <label 
                  key={p.title} 
                  className={`flex items-start gap-3 rounded border p-4 transition-all duration-150 cursor-pointer select-none ${cfg.card} ${
                    isChecked ? 'opacity-65 grayscale bg-sidebar border-border/60' : 'hover:border-primary/20'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleProbe(p.title)}
                    className="mt-1 h-3.5 w-3.5 cursor-pointer rounded border-border bg-surface text-primary focus:ring-primary focus:ring-offset-0 focus:ring-1 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg.tone}`} aria-hidden="true" />
                        <span className={`text-body-sm font-bold tracking-wide truncate ${cfg.tone} ${isChecked ? 'line-through' : ''}`}>
                          {p.title}
                        </span>
                      </div>
                      <span
                        className={`rounded border px-2 py-0.5 font-mono text-label uppercase shrink-0 sm:ml-auto ${cfg.chip}`}
                      >
                        {p.severity} Priority
                      </span>
                    </div>
                    <p className={`text-body-sm leading-relaxed text-foreground font-medium ${isChecked ? 'line-through text-muted font-normal' : ''}`}>
                      {p.question}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-label font-mono uppercase text-muted/70">
        * Generated dynamically from candidate history metrics to prepare the sourcing interview panel.
      </p>
    </div>
  );
}
