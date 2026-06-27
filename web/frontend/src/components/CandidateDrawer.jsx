import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Briefcase,
  ClipboardList,
  GraduationCap,
  ScrollText,
  SlidersHorizontal,
  Wrench,
  X,
  MapPin,
  Calendar,
  Building,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  MessageSquare
} from 'lucide-react';
import InterviewPrep from './drawer/InterviewPrep.jsx';
import CareerTimeline from './drawer/CareerTimeline.jsx';
import ShortlistControls from './drawer/ShortlistControls.jsx';
import ScoreWaterfall from './ScoreWaterfall.jsx';
import { getCandidate } from '../utils/api.js';
import { fmtScore, v } from '../utils/formatters.js';
import { useShortlist } from '../context/ShortlistContext.jsx';
import { buildProbes } from '../utils/probes.js';
import { staggerContainer, staggerItem, reasoningReveal } from './motion/presets.js';

const STATUS_THEMES = {
  shortlisted: {
    bg: 'bg-accent/10',
    text: 'text-accent border border-accent/20',
    dot: 'bg-accent',
  },
  contacted: {
    bg: 'bg-info/10',
    text: 'text-info border border-info/20',
    dot: 'bg-info',
  },
  rejected: {
    bg: 'bg-danger/10',
    text: 'text-danger border border-danger/20',
    dot: 'bg-danger',
  },
};

function Row({ label, value }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4 py-2 border-b border-border/40 text-body-sm">
      <span className="text-muted font-medium">{label}</span>
      <span className="text-left sm:text-right font-semibold text-primary font-mono">{value}</span>
    </div>
  );
}

function SkillChips({ skills, tone }) {
  if (!skills || !skills.length) return <span className="text-xs text-muted font-medium">None listed</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {skills.map((s) => (
        <span key={s} className={`rounded border px-2.5 py-0.5 text-label font-mono uppercase ${tone}`}>
          {s}
        </span>
      ))}
    </div>
  );
}

function KpiCard({ label, value }) {
  return (
    <div className="bg-background/40 border border-border/60 p-3.5 rounded flex flex-col justify-between h-full hover:border-primary/20 transition-all">
      <span className="text-label font-mono uppercase text-muted/80">{label}</span>
      <span className="text-body-sm font-semibold text-primary mt-1.5 font-mono truncate">{value}</span>
    </div>
  );
}

function SkillsAuditMeter({ score }) {
  const pct = `${Math.min(100, Math.max(2, (score / 1.1) * 100))}%`;
  return (
    <div className="bg-surface-hover/30 border border-border/60 rounded p-4.5">
      <div className="flex justify-between items-center mb-2">
        <span className="text-label font-mono uppercase text-muted/80">Skills Match Subscore</span>
        <span className="font-mono text-body-sm font-bold text-accent">{fmtScore(score)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded bg-background border border-border/60">
        <div
          className="h-full bg-accent rounded transition-all duration-500"
          style={{ width: pct }}
        />
      </div>
    </div>
  );
}

function AccordionSection({ title, icon: Icon, isOpen, onToggle, summary, children }) {
  return (
    <div className="border border-border bg-surface rounded-lg overflow-hidden transition-all duration-150">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-surface-hover transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1 pr-3">
          {Icon && <Icon className="h-4.5 w-4.5 text-muted shrink-0" />}
          <span className="font-heading text-body-sm font-bold text-foreground truncate">{title}</span>
          {summary && <div className="ml-auto shrink-0 flex items-center">{summary}</div>}
        </div>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-muted/50 shrink-0 ml-2"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="overflow-hidden"
          >
            <div className="p-5 border-t border-border/60 bg-surface-hover/20 space-y-5">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function CandidateDrawer({ candidateId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  
  const [openSections, setOpenSections] = useState({
    executiveSummary: true,
    aiExplanation: false,
    skills: false,
    careerTimeline: false,
    education: false,
    experience: false,
    hiringSignals: false,
    interviewSuggestions: false,
    notes: false,
  });

  const open = candidateId !== null;

  const { entries } = useShortlist();
  const statusKey = candidateId ? entries[candidateId]?.status : null;
  const statusTheme = statusKey ? STATUS_THEMES[statusKey] : null;

  useEffect(() => {
    if (!candidateId) return;
    setData(null);
    setError(null);
    setOpenSections({
      executiveSummary: true,
      aiExplanation: false,
      skills: false,
      careerTimeline: false,
      education: false,
      experience: false,
      hiringSignals: false,
      interviewSuggestions: false,
      notes: false,
    });
    let cancelled = false;
    getCandidate(candidateId)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(String(e.message || e)));
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const closeRef = useRef(null);
  const restoreRef = useRef(null);
  useEffect(() => {
    if (open) {
      restoreRef.current = document.activeElement;
      requestAnimationFrame(() => closeRef.current?.focus());
    } else if (restoreRef.current) {
      restoreRef.current.focus?.();
      restoreRef.current = null;
    }
  }, [open]);

  const toggleSection = (key) => {
    setOpenSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const expandAll = () => {
    setOpenSections({
      executiveSummary: true,
      aiExplanation: true,
      skills: true,
      careerTimeline: true,
      education: true,
      experience: true,
      hiringSignals: true,
      interviewSuggestions: true,
      notes: true,
    });
  };

  const collapseAll = () => {
    setOpenSections({
      executiveSummary: false,
      aiExplanation: false,
      skills: false,
      careerTimeline: false,
      education: false,
      experience: false,
      hiringSignals: false,
      notes: false,
    });
  };

  const role = data?.current_role;
  const sys = data?.system_scores;
  const beh = data?.behavioral;
  const parts = data?.rank_detail?.parts;

  // Derives structured strengths and flags from score variables for AI Match Summary tab
  const getExecutiveSummary = () => {
    const strengthsList = [];
    const adjList = [];

    if (parts) {
      // Core strengths
      if (parts.career > 0.2) {
        strengthsList.push({
          title: "Academic & Career Prestige",
          desc: `High quality background history at premium employers / tier-1 academic institutions (+${parts.career.toFixed(3)}).`
        });
      }
      if (parts.semantic > 0.18) {
        strengthsList.push({
          title: "Contextual Role Alignment",
          desc: `Strong semantic similarity between candidate profile context and job description (+${parts.semantic.toFixed(3)}).`
        });
      }
      if (parts.skill > 0.15) {
        strengthsList.push({
          title: "JD Technical Stack Fit",
          desc: `Direct evidence matching core required and nice-to-have skill definitions (+${parts.skill.toFixed(3)}).`
        });
      }
      if (parts.assessment > 0.1) {
        strengthsList.push({
          title: "Verified Assessments",
          desc: `Independent testing cleared successfully, verifying core skill proficiencies (+${parts.assessment.toFixed(3)}).`
        });
      }
      if (parts.experience > 0.08) {
        strengthsList.push({
          title: "Tenure & Geography Match",
          desc: `Target years of experience and local hub proximity fit perfectly (+${parts.experience.toFixed(3)}).`
        });
      }

      // Core adjustments / flags
      if (parts.trajectory > 0) {
        strengthsList.push({
          title: "Positive Career Growth Vector",
          desc: `Career trajectory showing growth in responsibilities and title escalation (+${parts.trajectory.toFixed(3)} adjustment).`
        });
      } else if (parts.trajectory < 0) {
        adjList.push({
          title: "Negative Career Growth Vector",
          desc: `Score adjusted due to titles or stints signaling stagnant growth (${parts.trajectory.toFixed(3)} adjustment).`,
          severity: 'warning'
        });
      }

      if (parts.consistency < 0) {
        adjList.push({
          title: "Profile Inconsistency Match",
          desc: `Self-declared summary contradicts the chronological career history history (${parts.consistency.toFixed(3)} penalty).`,
          severity: 'warning'
        });
      }

      if (parts.anchor_penalty < 0) {
        adjList.push({
          title: "Industry Alignment Penalty",
          desc: `Background is dominated by service-firm consultants or non-product consulting profiles (${parts.anchor_penalty.toFixed(3)} penalty).`,
          severity: 'warning'
        });
      }
    } else {
      if (sys?.career_score > 0.7) {
        strengthsList.push({
          title: "High Career Score Candidate",
          desc: `High quality background history matching premium tier-1 metrics (${(sys.career_score).toFixed(2)}).`
        });
      }
      if (sys?.skill_score > 0.6) {
        strengthsList.push({
          title: "High Skills Score Candidate",
          desc: `Candidate possesses a strong matching percentage of the target technical stack (${(sys.skill_score).toFixed(2)}).`
        });
      }
      if (sys?.experience_score > 0.6) {
        strengthsList.push({
          title: "High Experience Fit Candidate",
          desc: `Candidate years of experience and local proximity match requirements (${(sys.experience_score).toFixed(2)}).`
        });
      }
    }

    // Availability multiplier details
    const availMult = sys?.availability_multiplier ?? 1;
    if (availMult < 1.0) {
      adjList.push({
        title: "Low Sourcing Attainability",
        desc: `Matching score reduced due to low platform activity, low response rate, or long notice period (${availMult.toFixed(2)}x multiplier).`,
        severity: 'warning'
      });
    } else if (availMult > 1.0) {
      strengthsList.push({
        title: "High Sourcing Attainability",
        desc: `Highly reachable talent showing prompt response rates, short notice, or open to work (${availMult.toFixed(2)}x boost).`
      });
    }

    // Honeypot / DQ flags
    if (sys?.is_honeypot) {
      adjList.push({
        title: "Critical Integrity Flag: Honeypot trapped",
        desc: `Trap reasons: ${sys.honeypot_reasons?.join(', ') || 'synthetic timeline or inflated skills detected'}. Profile completely eliminated from the top 100 queue.`,
        severity: 'danger'
      });
    }

    if (sys?.disqualifier_flag) {
      adjList.push({
        title: "Hard Disqualification Triggered",
        desc: `Disqualified reasons: ${sys.disqualifier_reasons?.join(', ') || 'does not meet baseline criteria'}. Match score heavily demoted.`,
        severity: 'danger'
      });
    }

    return { strengths: strengthsList, adjustments: adjList };
  };

  const { strengths: execStrengths, adjustments: execAdjustments } = data ? getExecutiveSummary() : { strengths: [], adjustments: [] };
  const probes = data ? buildProbes(data) : [];

  return (
    <AnimatePresence>
      {/* Backdrop overlay */}
      {open && (
        <motion.div
          key="overlay"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-40 bg-black/40"
          aria-hidden="true"
        />
      )}
      
      {/* Side sheet drawer */}
      {open && (
        <motion.aside
          key="drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Candidate profile summary"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 280 }}
          className="fixed right-0 top-0 z-50 h-full w-full max-w-xl overflow-hidden border-l-2 border-border bg-surface flex flex-col"
        >
          {/* Drawer Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-4 sm:px-6 py-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-caption font-semibold bg-background border border-border px-2 py-0.5 rounded text-muted flex items-center gap-1.5">
                  {statusTheme && (
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusTheme.dot}`}
                      title={statusKey}
                      aria-hidden="true"
                    />
                  )}
                  {candidateId.slice(0, 16)}
                </span>
                {sys?.is_honeypot && (
                  <span className="px-2 py-0.5 rounded bg-destructive/10 border border-destructive/20 text-label text-destructive uppercase animate-pulse">
                    Honeypot
                  </span>
                )}
                {sys?.disqualifier_flag && (
                  <span className="px-2 py-0.5 rounded bg-destructive/10 border border-destructive/20 text-label text-destructive uppercase">
                    Disqualified
                  </span>
                )}
              </div>
              
              <h2 className="font-heading text-heading-sm sm:text-heading-md font-bold text-primary tracking-tight mt-1.5 truncate max-w-xs sm:max-w-md">
                {role?.title || 'Untitled Profile'}
              </h2>
              
              <p className="text-caption text-muted font-medium mt-1 flex items-center gap-1.5">
                <Building className="h-3 w-3 text-muted/60" />
                <span>{v(role?.company)}</span>
                <span>·</span>
                <MapPin className="h-3 w-3 text-muted/60" />
                <span>{v(role?.location)}</span>
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              {data?.rank_detail && (
                <div className="text-right">
                  <span className="block text-label uppercase text-muted font-mono">
                    Rank #{data.rank_detail.rank}
                  </span>
                  <span className={`block font-heading text-heading-lg font-extrabold tracking-tight ${
                    data.rank_detail.composite > 0.8 ? 'text-success' : data.rank_detail.composite >= 0.6 ? 'text-warning' : 'text-destructive'
                  }`}>
                    {fmtScore(data.rank_detail.composite)}
                  </span>
                </div>
              )}
              
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Close sheet"
                className="cursor-pointer rounded border border-border bg-surface text-muted hover:bg-surface-hover hover:text-primary p-1.5 transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Drawer Body Container */}
          <div className="flex-1 overflow-y-auto flex flex-col">
            {error && <div className="px-4 sm:px-6 py-6 text-sm text-destructive bg-destructive/10 border border-destructive/20 m-4 sm:m-6 rounded">{error}</div>}
            
            {!data && !error && open && (
              <div className="space-y-4 px-4 sm:px-6 py-6 flex-1 overflow-y-auto">
                {/* Skeleton header */}
                <div className="flex items-center justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="h-3 w-32 animate-skeleton rounded" />
                    <div className="h-5 w-48 animate-skeleton rounded" />
                  </div>
                  <div className="h-10 w-20 animate-skeleton rounded" />
                </div>
                {/* Skeleton KPI row */}
                <div className="grid grid-cols-3 gap-3">
                  {Array.from({ length: 3 }, (_, i) => (
                    <div key={i} className="h-16 animate-skeleton rounded border border-border/40" />
                  ))}
                </div>
                {/* Skeleton accordion sections */}
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={`s${i}`} className="animate-skeleton rounded border border-border/40" style={{ animationDelay: `${i * 100}ms` }}>
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <div className="h-5 w-5 rounded bg-surface-hover/50" />
                      <div className="h-4 w-32 rounded bg-surface-hover/50" />
                      <div className="ml-auto h-4 w-20 rounded bg-surface-hover/50" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {data && (
              <>
                {/* Master expand/collapse controls bar */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface/80 backdrop-blur-md px-4 sm:px-6 py-2 text-caption"
                >
                  <span className="text-muted font-semibold font-mono tracking-wide uppercase">Hiring Intelligence Workspace</span>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={expandAll}
                      className="cursor-pointer text-primary hover:text-primary-hover font-semibold transition-colors focus:outline-none focus-visible:underline"
                    >
                      Expand All
                    </button>
                    <span className="text-muted/40 font-light">|</span>
                    <button
                      type="button"
                      onClick={collapseAll}
                      className="cursor-pointer text-primary hover:text-primary-hover font-semibold transition-colors focus:outline-none focus-visible:underline"
                    >
                      Collapse All
                    </button>
                  </div>
                </motion.div>

                <motion.div
                  variants={staggerContainer}
                  initial="hidden"
                  animate="show"
                  className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 pb-16"
                >
                  {/* 1. Executive Summary */}
                  <motion.div variants={staggerItem}>
                  <AccordionSection
                    title="Executive Summary"
                    icon={Sparkles}
                    isOpen={openSections.executiveSummary}
                    onToggle={() => toggleSection('executiveSummary')}
                    summary={
                      <div className="flex items-center gap-1.5">
                        {sys?.is_honeypot && (
                          <span className="rounded bg-destructive/10 border border-destructive/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-destructive uppercase">
                            Honeypot
                          </span>
                        )}
                        {sys?.disqualifier_flag && (
                          <span className="rounded bg-destructive/10 border border-destructive/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-destructive uppercase">
                            DQ
                          </span>
                        )}
                        {!sys?.is_honeypot && !sys?.disqualifier_flag && data?.rank_detail?.composite && (
                          <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                            data.rank_detail.composite > 0.8 ? 'bg-success/10 text-success border border-success/20' : data.rank_detail.composite >= 0.6 ? 'bg-warning/10 text-warning border border-warning/20' : 'bg-destructive/10 text-destructive border border-destructive/20'
                          }`}>
                            {data.rank_detail.composite > 0.8 ? 'High Match' : data.rank_detail.composite >= 0.6 ? 'Moderate' : 'Low Match'}
                          </span>
                        )}
                      </div>
                    }
                  >
                    {role.headline && (
                      <div className="bg-surface border border-border rounded p-3 text-body-sm italic text-primary leading-relaxed">
                        "{role.headline}"
                      </div>
                    )}
                    
                    {data.summary_text && (
                      <motion.p
                        variants={reasoningReveal}
                        initial="hidden"
                        animate={openSections.executiveSummary ? 'show' : 'hidden'}
                        className="text-body-sm leading-relaxed text-foreground font-medium italic"
                      >
                        "{data.summary_text}"
                      </motion.p>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border/40 pt-4">
                      {/* Strengths */}
                      <div className="space-y-2.5">
                        <h5 className="text-label uppercase text-success flex items-center gap-1.5 font-mono">
                          <ThumbsUp className="h-3.5 w-3.5 text-success" />
                          Core Strengths
                        </h5>
                        {execStrengths.length === 0 ? (
                          <p className="text-body-sm text-muted">No major matching strengths identified.</p>
                        ) : (
                          <ul className="space-y-2">
                            {execStrengths.map((str, idx) => (
                              <li key={idx} className="text-body-sm bg-success/5 border border-success/15 rounded p-2.5">
                                <strong className="block font-semibold text-foreground">{str.title}</strong>
                                <span className="text-muted text-caption leading-relaxed mt-0.5 block">{str.desc}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* Risk Adjustments */}
                      <div className="space-y-2.5">
                        <h5 className="text-label uppercase text-warning flex items-center gap-1.5 font-mono">
                          <ThumbsDown className="h-3.5 w-3.5 text-warning" />
                          Risk Adjustments
                        </h5>
                        {execAdjustments.length === 0 ? (
                          <div className="rounded border border-success/20 bg-success/5 p-3 flex items-center gap-2 text-body-sm text-success font-medium">
                            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                            <span>No matching flags or score deductions detected.</span>
                          </div>
                        ) : (
                          <ul className="space-y-2">
                            {execAdjustments.map((adj, idx) => (
                              <li key={idx} className="text-body-sm bg-warning/5 border border-warning/15 rounded p-2.5">
                                <strong className={`block font-semibold ${adj.severity === 'danger' ? 'text-danger' : 'text-warning'}`}>{adj.title}</strong>
                                <span className="text-muted text-caption leading-relaxed mt-0.5 block">{adj.desc}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </AccordionSection>
                  </motion.div>

                  {/* 2. AI Explanation */}
                  <motion.div variants={staggerItem}>
                  <AccordionSection
                    title="AI Explanation"
                    icon={SlidersHorizontal}
                    isOpen={openSections.aiExplanation}
                    onToggle={() => toggleSection('aiExplanation')}
                    summary={
                      data?.rank_detail ? (
                        <span className="font-mono text-xs font-bold text-primary">Score: {fmtScore(data.rank_detail.composite)}</span>
                      ) : (
                        <span className="font-mono text-xs font-bold text-muted">No Rank Details</span>
                      )
                    }
                  >
                    {parts && (
                      <div className="space-y-4">
                        <div className="border border-border/60 bg-surface-hover/30 rounded p-4">
                          <ScoreWaterfall parts={parts} />
                        </div>
                      </div>
                    )}
                    
                    <div className="border border-border bg-surface-hover/30 rounded p-4 space-y-3">
                      <h4 className="font-mono text-label uppercase text-muted font-bold">System Calculations Breakdown</h4>
                      <div className="space-y-3">
                        {sys?.career_subscores && (
                          <div className="space-y-2 pb-2 border-b border-border/40">
                            <div className="flex justify-between text-body-sm font-mono">
                              <span className="text-muted font-medium">Career Match Score</span>
                              <span className="font-semibold text-primary">{fmtScore(sys.career_score)}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-caption pl-3 text-muted">
                              <div>Company Type: <strong className="text-foreground font-semibold">{v(sys.career_subscores.company_type)}</strong></div>
                              <div>Role Relevance: <strong className="text-foreground font-semibold">{v(sys.career_subscores.role_relevance)}</strong></div>
                              <div>Production Signal: <strong className="text-foreground font-semibold">{v(sys.career_subscores.production_signal)}</strong></div>
                              <div>Domain Indicator: <strong className="text-foreground font-semibold">{v(sys.career_subscores.domain_indicator)}</strong></div>
                              <div className="col-span-2">Tenure Stability: <strong className="text-foreground font-semibold">{v(sys.career_subscores.tenure_stability)}</strong></div>
                            </div>
                          </div>
                        )}
                        
                        {sys?.experience_subscores && (
                          <div className="space-y-2 pb-2 border-b border-border/40">
                            <div className="flex justify-between text-body-sm font-mono">
                              <span className="text-muted font-medium">Experience Fit Score</span>
                              <span className="font-semibold text-primary">{fmtScore(sys.experience_score)}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-caption pl-3 text-muted">
                              <div>YoE Fit: <strong className="text-foreground font-semibold">{v(sys.experience_subscores.yoe_fit)}</strong></div>
                              <div>Location Fit: <strong className="text-foreground font-semibold">{v(sys.experience_subscores.location_fit)}</strong></div>
                              <div>Education Tier: <strong className="text-foreground font-semibold">{v(sys.experience_subscores.education_tier)}</strong></div>
                            </div>
                          </div>
                        )}

                        <div className="space-y-2 pt-1">
                          <div className="flex justify-between text-body-sm font-mono">
                            <span className="text-muted font-medium">Assessment Score</span>
                            <span className="font-semibold text-primary">{fmtScore(sys.assessment_score)}</span>
                          </div>
                          <div className="flex justify-between text-body-sm font-mono">
                            <span className="text-muted font-medium">Availability Multiplier</span>
                            <span className="font-semibold text-primary">×{Number(sys.availability_multiplier).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-body-sm font-mono">
                            <span className="text-muted font-medium">Trajectory Adjustment</span>
                            <span className={`font-semibold ${sys.trajectory_adjustment >= 0 ? 'text-accent' : 'text-danger'}`}>
                              {sys.trajectory_adjustment > 0 ? '+' : ''}{sys.trajectory_adjustment}
                            </span>
                          </div>
                          <div className="flex justify-between text-body-sm font-mono">
                            <span className="text-muted font-medium">Disqualified Flag</span>
                            <span className={`font-semibold ${sys.disqualifier_flag ? 'text-danger' : 'text-muted'}`}>
                              {sys.disqualifier_flag ? `Yes (${sys.disqualifier_reasons?.join('; ')})` : 'No'}
                            </span>
                          </div>
                          <div className="flex justify-between text-body-sm font-mono">
                            <span className="text-muted font-medium">Honeypot Audit</span>
                            <span className={`font-semibold ${sys.is_honeypot ? 'text-danger' : 'text-muted'}`}>
                              {sys.is_honeypot ? `Yes (${sys.honeypot_reasons?.join('; ')})` : 'No'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </AccordionSection>
                  </motion.div>

                  {/* 3. Skills */}
                  <motion.div variants={staggerItem}>
                  <AccordionSection
                    title="Skills"
                    icon={Wrench}
                    isOpen={openSections.skills}
                    onToggle={() => toggleSection('skills')}
                    summary={
                      <span className="rounded bg-secondary/10 border border-secondary/20 px-2 py-0.5 font-mono text-caption text-secondary">
                        {data.matched_skills?.required?.length || 0} Required Matched
                      </span>
                    }
                  >
                    {sys?.skill_score !== undefined && (
                      <SkillsAuditMeter score={sys.skill_score} />
                    )}

                    <div className="bg-surface-hover/30 border border-border/60 rounded p-4 space-y-4">
                      <div>
                        <div className="mb-2 text-label font-mono uppercase text-muted/80 font-bold">JD Required Skills</div>
                        <SkillChips
                          skills={data.matched_skills?.required}
                          tone="bg-secondary/10 border border-secondary/20 text-secondary"
                        />
                      </div>
                      <div className="pt-3 border-t border-border/40">
                        <div className="mb-2 text-label font-mono uppercase text-muted/80 font-bold">Nice-to-have Skills</div>
                        <SkillChips
                          skills={data.matched_skills?.nice_to_have}
                          tone="bg-background/40 border border-border text-muted"
                        />
                      </div>
                    </div>
                  </AccordionSection>
                  </motion.div>

                  {/* 4. Career Timeline */}
                  <motion.div variants={staggerItem}>
                  <AccordionSection
                    title="Career Timeline"
                    icon={ScrollText}
                    isOpen={openSections.careerTimeline}
                    onToggle={() => toggleSection('careerTimeline')}
                    summary={
                      <span className="text-caption text-muted font-semibold font-mono">
                        {data.career_history?.length || 0} Stints
                      </span>
                    }
                  >
                    <CareerTimeline history={data.career_history} />
                  </AccordionSection>
                  </motion.div>

                  {/* 5. Education */}
                  <motion.div variants={staggerItem}>
                  <AccordionSection
                    title="Education"
                    icon={GraduationCap}
                    isOpen={openSections.education}
                    onToggle={() => toggleSection('education')}
                    summary={
                      data.education?.[0] ? (
                        <span className="rounded bg-tertiary/10 border border-tertiary/20 px-2 py-0.5 font-mono text-caption text-tertiary">
                          {data.education[0].degree} ({data.education[0].tier} Tier)
                        </span>
                      ) : null
                    }
                  >
                    <div className="grid gap-3">
                      {data.education && data.education.length > 0 ? (
                        data.education.map((e, i) => (
                          <div key={i} className="bg-surface border border-border rounded p-4 hover:border-primary/20 transition-colors">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h4 className="text-body-sm font-bold text-foreground">{v(e.degree)}</h4>
                                <p className="text-caption text-muted font-semibold mt-0.5">{v(e.field)}</p>
                              </div>
                              <span className="px-2 py-0.5 rounded bg-tertiary/10 border border-tertiary/20 text-label uppercase text-tertiary font-mono">
                                {v(e.tier)} Tier
                              </span>
                            </div>
                            
                            <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between text-caption text-muted font-semibold uppercase font-mono">
                              <span>Institution: <strong className="text-primary font-bold">{v(e.institution)}</strong></span>
                              <span>Grade: <strong className="text-primary font-bold">{v(e.grade)}</strong></span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-body-sm text-muted font-medium py-2">No education records logged.</div>
                      )}
                    </div>
                  </AccordionSection>
                  </motion.div>

                  {/* 6. Experience */}
                  <motion.div variants={staggerItem}>
                  <AccordionSection
                    title="Experience"
                    icon={Briefcase}
                    isOpen={openSections.experience}
                    onToggle={() => toggleSection('experience')}
                    summary={
                      <span className="text-caption text-muted font-semibold font-mono">
                        {role.years_of_experience || 0} Years Exp
                      </span>
                    }
                  >
                    <div className="space-y-4">
                      {data.career_history.length === 0 ? (
                        <div className="text-body-sm text-muted font-medium py-2">No career history entries logged.</div>
                      ) : (
                        <ol className="relative border-l border-border/60 ml-3 space-y-6 pt-2">
                          {data.career_history.map((j, i) => (
                            <li key={i} className="ml-5 relative group">
                              <span className="absolute -left-[26px] top-1.5 flex h-2.5 w-2.5 items-center justify-center rounded bg-surface border border-border/60 group-hover:border-secondary transition-colors">
                                {j.is_current && <span className="absolute h-1.5 w-1.5 rounded-sm bg-success animate-ping" />}
                              </span>

                              <div className="flex flex-wrap items-center justify-between gap-2.5">
                                <div className="text-body-sm font-bold text-foreground">
                                  {v(j.title)}{' '}
                                  <span className="font-normal text-muted font-body">@ {v(j.company)}</span>
                                </div>
                                
                                {j.is_current && (
                                  <span className="rounded bg-success/10 border border-success/20 px-2 py-0.5 text-label font-bold text-success uppercase tracking-widest">
                                    Current
                                  </span>
                                )}
                              </div>
                              
                              <div className="text-caption text-muted font-mono mt-1">
                                {v(j.duration_months)} Months · {v(j.industry)} · {v(j.company_size)}
                              </div>

                              {j.description && (
                                <p className="mt-2 text-body-sm leading-relaxed text-muted font-medium bg-surface-hover/30 border border-border/50 rounded p-3">
                                  {j.description}
                                </p>
                              )}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </AccordionSection>
                  </motion.div>

                  {/* 7. Hiring Signals */}
                  <motion.div variants={staggerItem}>
                  <AccordionSection
                    title="Hiring Signals"
                    icon={Activity}
                    isOpen={openSections.hiringSignals}
                    onToggle={() => toggleSection('hiringSignals')}
                    summary={
                      <span className="text-caption text-muted font-semibold font-mono">
                        {beh.notice_period_days != null ? `${beh.notice_period_days}d notice` : ''} {beh.open_to_work ? '· Open to Work' : ''}
                      </span>
                    }
                  >
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <KpiCard label="Last Active" value={`${v(beh.last_active_date)} (${v(beh.days_inactive, 'd ago')})`} />
                      <KpiCard label="Response Rate" value={v(beh.recruiter_response_rate)} />
                      <KpiCard label="Interview Rate" value={v(beh.interview_completion_rate)} />
                      <KpiCard label="Acceptance Rate" value={v(beh.offer_acceptance_rate)} />
                      <KpiCard label="Notice Period" value={v(beh.notice_period_days, ' days')} />
                      <KpiCard label="Open to Work" value={beh.open_to_work ? 'Yes' : 'No'} />
                      <KpiCard label="Relocate" value={beh.willing_to_relocate == null ? '--' : beh.willing_to_relocate ? 'Yes' : 'No'} />
                      <KpiCard label="Work Mode" value={v(beh.preferred_work_mode)} />
                      <KpiCard label="GitHub Score" value={v(beh.github_activity_score)} />
                      <KpiCard label="Saved (30d)" value={v(beh.saved_by_recruiters_30d)} />
                      <KpiCard label="Applied (30d)" value={v(beh.applications_submitted_30d)} />
                    </div>
                  </AccordionSection>
                  </motion.div>

                  {/* 8. Interview Suggestions */}
                  <motion.div variants={staggerItem}>
                  <AccordionSection
                    title="Interview Suggestions"
                    icon={ClipboardList}
                    isOpen={openSections.interviewSuggestions}
                    onToggle={() => toggleSection('interviewSuggestions')}
                    summary={
                      probes.length > 0 ? (
                        <span className="rounded bg-info/10 border border-info/20 px-2 py-0.5 font-mono text-caption text-info">
                          {probes.length} Probing Questions
                        </span>
                      ) : null
                    }
                  >
                    <InterviewPrep data={data} />
                  </AccordionSection>
                  </motion.div>

                  {/* 9. Notes */}
                  <motion.div variants={staggerItem}>
                  <AccordionSection
                    title="Notes"
                    icon={MessageSquare}
                    isOpen={openSections.notes}
                    onToggle={() => toggleSection('notes')}
                    summary={
                      statusKey ? (
                        <span className={`rounded px-2.5 py-0.5 font-mono text-caption font-bold uppercase ${statusTheme.text}`}>
                          {statusKey}
                        </span>
                      ) : (
                        <span className="text-caption text-muted font-medium">Unscheduled</span>
                      )
                    }
                  >
                    <div className="space-y-4 bg-surface-hover/20 border border-border/60 rounded p-4">
                      <ShortlistControls candidateId={candidateId} />
                    </div>
                  </AccordionSection>
                  </motion.div>
                </motion.div>
              </>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
