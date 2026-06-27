import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, ShieldAlert, Activity, FileDown, SlidersHorizontal, Info } from 'lucide-react';
import { fadeUp } from '../motion/presets.js';

const MOCK_ANOMALIES = [
  {
    id: 'anom-1',
    type: 'Score Drift Detected',
    severity: 'warning',
    time: '12m ago',
    cluster: 'Engineering',
    desc: 'Model is heavily weighting "Years of Experience" over "Technical Proficiency" for recent cohorts.',
    hypothesis: 'Recent ingest included 500+ senior profiles, skewing baseline distribution curves.',
    impact: 'Potential bias against high-skill junior candidates (diversity penalty).',
    action: 'Recalibrate Model',
  },
  {
    id: 'anom-2',
    type: 'Trust Flag Pattern',
    severity: 'critical',
    time: '1h ago',
    cluster: 'Sales',
    desc: 'Detected 14 resumes with identical synthetic career timeline patterns.',
    hypothesis: 'Possible coordinated bot submission or shared resume-farm template.',
    impact: 'Corrupted cohort scoring if left in active pipeline.',
    action: 'Purge Candidates',
  },
  {
    id: 'anom-3',
    type: 'Sourcing Volume Spike',
    severity: 'info',
    time: '45m ago',
    cluster: 'Product Management',
    desc: 'Intake volume exceeded standard deviation by +300% in last hour.',
    hypothesis: 'Viral job post or successful scraping operation on external board.',
    impact: 'System under heavy load; ranking velocity may decrease temporarily.',
    action: 'Acknowledge',
  },
];

export default function AnomaliesDeepDive({ isOpen, onClose, onRecalibrate }) {
  const [selectedAnomalyId, setSelectedAnomalyId] = useState(MOCK_ANOMALIES[0]?.id ?? null);
  const selectedAnomaly = MOCK_ANOMALIES.find((anom) => anom.id === selectedAnomalyId) ?? MOCK_ANOMALIES[0] ?? null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="anomalies-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-md"
      >
        <motion.div
          initial={{ y: 20, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          className="flex h-full max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-surface-hover/30">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-label text-muted">Command Center</span>
                <span className="text-muted">/</span>
                <span className="text-label text-danger font-semibold">Anomaly Investigation</span>
              </div>
              <h2 className="text-heading-md font-bold tracking-tight text-foreground">
                Forensic Analysis & Resolution
              </h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-2 text-muted hover:bg-surface-hover hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Left Col: Analysis & List */}
            <div className="flex flex-1 flex-col overflow-y-auto border-r border-border p-6">
              
              <div className="mb-6 rounded-md border border-border bg-background p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-label text-muted">Score Drift Analysis: Engineering Cluster</h3>
                  <span className="rounded bg-warning/10 px-2 py-0.5 font-mono text-data-sm text-warning">+12% Variance</span>
                </div>
                {/* Chart Placeholder */}
                <div className="relative h-48 w-full overflow-hidden rounded border border-border/40 bg-surface-hover/20">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Activity className="h-10 w-10 text-muted/30" />
                  </div>
                  <svg className="absolute inset-0 h-full w-full opacity-40" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <path d="M0,80 Q25,70 50,85 T100,60 L100,100 L0,100 Z" fill="currentColor" className="text-warning/20" />
                    <path d="M0,80 Q25,70 50,85 T100,60" fill="none" stroke="currentColor" strokeWidth="2" className="text-warning" />
                    <path d="M0,60 Q25,60 50,60 T100,60" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="text-primary/50" />
                  </svg>
                </div>
              </div>

              <h3 className="mb-3 text-label text-muted">Detected Anomalies Log</h3>
              <div className="rounded-md border border-border">
                <table className="w-full text-left text-body-sm">
                  <thead className="bg-surface-hover/50">
                    <tr>
                      <th className="px-4 py-2 text-label text-muted">Severity</th>
                      <th className="px-4 py-2 text-label text-muted">Type / Cluster</th>
                      <th className="px-4 py-2 text-label text-muted">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_ANOMALIES.map((anom) => (
                      <tr
                        key={anom.id}
                        onClick={() => setSelectedAnomalyId(anom.id)}
                        className={`border-t border-border bg-surface hover:bg-surface-hover/30 transition-colors cursor-pointer ${selectedAnomaly?.id === anom.id ? 'bg-surface-hover/40' : ''}`}
                      >
                        <td className="px-4 py-3">
                          {anom.severity === 'critical' ? (
                            <span className="flex w-fit items-center gap-1.5 rounded bg-danger/10 px-2 py-1 text-data-sm text-danger font-mono">
                              <ShieldAlert className="h-3.5 w-3.5" /> CRITICAL
                            </span>
                          ) : anom.severity === 'warning' ? (
                            <span className="flex w-fit items-center gap-1.5 rounded bg-warning/10 px-2 py-1 text-data-sm text-warning font-mono">
                              <AlertTriangle className="h-3.5 w-3.5" /> WARNING
                            </span>
                          ) : (
                            <span className="flex w-fit items-center gap-1.5 rounded bg-info/10 px-2 py-1 text-data-sm text-info font-mono">
                              <Info className="h-3.5 w-3.5" /> INFO
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-foreground">{anom.type}</p>
                          <p className="text-caption text-muted">{anom.cluster}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-data-sm text-muted">
                          {anom.time}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Col: Detail View */}
            <div className="w-96 flex-shrink-0 bg-surface-hover/20 p-6 flex flex-col justify-between overflow-y-auto">
              <div>
                <div className="mb-4 inline-flex items-center gap-1.5 rounded border border-warning/20 bg-warning/10 px-2.5 py-1 text-label text-warning">
                  <AlertTriangle className="h-3 w-3" />
                  <span>Active Investigation</span>
                </div>
                <h3 className="mb-2 text-heading-sm font-bold text-foreground">{selectedAnomaly?.type ?? 'Investigation'}</h3>
                <p className="mb-6 text-body-sm text-muted">{selectedAnomaly?.desc ?? 'No anomaly selected.'}</p>

                <div className="mb-4 space-y-1">
                  <span className="text-label text-muted">Root Cause Hypothesis</span>
                  <p className="rounded border border-border bg-background p-3 text-body-sm text-foreground">
                    {selectedAnomaly?.hypothesis ?? 'No hypothesis available.'}
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="text-label text-muted">Impact Assessment</span>
                  <p className="rounded border border-border bg-background p-3 text-body-sm text-foreground border-l-4 border-l-warning">
                    {selectedAnomaly?.impact ?? 'No impact available.'}
                  </p>
                </div>
              </div>

              <div className="mt-8 space-y-3">
                {selectedAnomaly?.action === 'Recalibrate Model' ? (
                  <button
                    onClick={() => {
                      onRecalibrate();
                      onClose();
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-2.5 text-body-sm font-semibold text-white transition-colors hover:bg-primary/90"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    Recalibrate Model Weights
                  </button>
                ) : (
                  <button className="flex w-full items-center justify-center gap-2 rounded bg-primary px-4 py-2.5 text-body-sm font-semibold text-white transition-colors hover:bg-primary/90">
                    {selectedAnomaly?.action ?? 'Acknowledge'}
                  </button>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <button className="flex w-full items-center justify-center gap-2 rounded border border-border bg-surface px-4 py-2 text-body-sm font-semibold text-foreground transition-colors hover:bg-surface-hover">
                    Acknowledge
                  </button>
                  <button className="flex w-full items-center justify-center gap-2 rounded border border-border bg-surface px-4 py-2 text-body-sm font-semibold text-foreground transition-colors hover:bg-surface-hover">
                    <FileDown className="h-4 w-4 text-muted" />
                    Export Log
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
