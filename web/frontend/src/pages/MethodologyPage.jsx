import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Database,
  Search,
  Layers,
  Cpu,
  Calculator,
  ShieldCheck,
  CheckCircle2,
  ChevronDown,
  AlertTriangle,
  Ban,
  Lock,
  Timer,
  Sparkles
} from 'lucide-react';
import Reveal from '../components/motion/Reveal.jsx';
import { pageEnter } from '../components/motion/presets.js';
import { PART_COLORS, PART_LABELS } from '../utils/formatters.js';

function Connector({ countReduction }) {
  return (
    <div className="flex flex-col items-center my-1">
      <div className="h-6 w-0.5 bg-border/60" />
      {countReduction && (
        <span className="bg-surface-hover border border-border/60 px-2 py-0.5 rounded font-mono text-[10px] font-bold text-primary my-1">
          {countReduction}
        </span>
      )}
      <div className="h-6 w-0.5 bg-border/60" />
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-surface border border-border/80 text-muted/60 shadow-sm">
        <ChevronDown className="h-3 w-3" />
      </div>
    </div>
  );
}

function PipelineStage({ id, number, title, icon: Icon, subtitle, output, isOpen, onToggle, children }) {
  const panelId = `pipeline-stage-${id}`;
  const buttonId = `pipeline-stage-${id}-button`;

  return (
    <div className="border border-border bg-surface rounded-xl overflow-hidden transition-all duration-150 hover:border-border/80 shadow-sm">
      <button
        id={buttonId}
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="w-full flex flex-col md:flex-row md:items-center justify-between px-6 py-4 text-left hover:bg-surface-hover transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
      >
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="h-10 w-10 shrink-0 rounded-lg bg-surface-hover border border-border flex items-center justify-center text-primary">
            {Icon && <Icon className="h-5 w-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-primary">Stage {number}</span>
              <span className="text-muted/40">·</span>
              <span className="text-muted/80 text-caption font-semibold">{subtitle}</span>
            </div>
            <h3 className="font-heading text-base font-bold text-foreground mt-0.5">{title}</h3>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-3 md:mt-0 shrink-0">
          <div className="bg-background border border-border px-3 py-1 rounded font-mono text-xs font-bold text-foreground">
            {output}
          </div>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-muted/50 hidden md:block"
          >
            <ChevronDown className="h-4 w-4" />
          </motion.div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={panelId}
            role="region"
            aria-labelledby={buttonId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="overflow-hidden"
          >
            <div className="p-6 border-t border-border/60 bg-surface-hover/10 space-y-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function MethodologyPage() {
  const [openStages, setOpenStages] = useState({
    1: true,
    2: false,
    3: false,
    4: false,
    5: false,
    6: false,
    7: false
  });

  const toggleStage = (num) => {
    setOpenStages(prev => ({
      ...prev,
      [num]: !prev[num]
    }));
  };

  const expandAll = () => {
    setOpenStages({
      1: true,
      2: true,
      3: true,
      4: true,
      5: true,
      6: true,
      7: true
    });
  };

  const collapseAll = () => {
    setOpenStages({
      1: false,
      2: false,
      3: false,
      4: false,
      5: false,
      6: false,
      7: false
    });
  };

  return (
    <motion.main {...pageEnter} className="mx-auto max-w-4xl px-4 py-12 space-y-8">
      {/* Title */}
      <div className="text-center space-y-3">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-foreground">Interactive AI Pipeline Narrative</h1>
        <p className="mx-auto max-w-2xl text-sm text-muted font-body">
          Explore the seven sequential stages of the Redrob Candidate Ranker. Fast, CPU-only approximate filters sweep 100K profiles, deep joint-attention Cross-encoders score the survivors, and hard safety gates audit the final Top 100 output.
        </p>

        <div className="pt-2 flex justify-center gap-3">
          <button
            type="button"
            onClick={expandAll}
            className="cursor-pointer text-xs font-semibold text-primary hover:underline focus:outline-none"
          >
            Expand All Stages
          </button>
          <span className="text-muted/40 font-light">|</span>
          <button
            type="button"
            onClick={collapseAll}
            className="cursor-pointer text-xs font-semibold text-primary hover:underline focus:outline-none"
          >
            Collapse All Stages
          </button>
        </div>
      </div>

      <div className="relative pt-4">
        {/* Stage 1: Candidate Pool */}
        <PipelineStage
          number="1"
          title="Candidate Pool (Initial Database)"
          icon={Database}
          subtitle="Input corpus of raw candidate profiles"
          output="100,000 Profiles"
          isOpen={openStages[1]}
          onToggle={() => toggleStage(1)}
        >
          <p className="text-body-sm leading-relaxed text-muted font-medium">
            The initial, unstructured labor market database containing all indexed candidates. Each candidate profile includes self-declared skills, education credentials, career history duration, and behavioral indicators.
          </p>
          <div className="rounded-lg border border-border bg-background p-4 flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold uppercase text-muted/70">Database Source</span>
            <span className="font-mono text-xs font-bold text-foreground">candidates.jsonl (100K entries)</span>
          </div>
        </PipelineStage>

        <Connector countReduction="Filter −95,000" />

        {/* Stage 2: Semantic Retrieval */}
        <PipelineStage
          number="2"
          title="Semantic Retrieval (FAISS Dense Search)"
          icon={Search}
          subtitle="Fast approximate nearest neighbor vector search"
          output="5,000 Profiles"
          isOpen={openStages[2]}
          onToggle={() => toggleStage(2)}
        >
          <p className="text-body-sm leading-relaxed text-muted font-medium">
            Exact inner-product search over L2-normalized 384-dimensional career text embeddings (<code className="text-primary font-mono text-xs">all-MiniLM-L6-v2</code>) against the job description embedding. FAISS index scan runs in ~10 ms, filtering out 95% of irrelevant candidates early.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-border bg-background rounded p-3 text-center">
              <span className="block text-[9px] font-mono uppercase text-muted/70">Embedding Model</span>
              <span className="block text-body-sm font-bold text-foreground mt-0.5 font-mono">MiniLM-L6-v2</span>
            </div>
            <div className="border border-border bg-background rounded p-3 text-center">
              <span className="block text-[9px] font-mono uppercase text-muted/70">FAISS Search Speed</span>
              <span className="block text-body-sm font-bold text-success mt-0.5 font-mono">~10 ms</span>
            </div>
          </div>
        </PipelineStage>

        <Connector countReduction="Filter −4,500" />

        {/* Stage 3: Hybrid Fusion */}
        <PipelineStage
          number="3"
          title="Hybrid Fusion (Reciprocal Rank Fusion)"
          icon={Layers}
          subtitle="Fusing semantic vectors with lexical BM25 scores"
          output="500 Profiles"
          isOpen={openStages[3]}
          onToggle={() => toggleStage(3)}
        >
          <p className="text-body-sm leading-relaxed text-muted font-medium">
            Applies Reciprocal Rank Fusion (weighted 70% semantic, 30% lexical, constant <code className="text-primary font-mono text-xs">k=60</code>). This rank-based fusion prevents score-scale mismatch, ensuring candidates with matching exact keywords and strong semantic backgrounds are surfaced.
          </p>
          <div className="border border-border bg-background rounded-lg p-4 space-y-2">
            <span className="text-[10px] font-mono font-bold uppercase text-muted/70 block">RRF Fusion Formula & Weights</span>
            <div className="flex h-3.5 overflow-hidden rounded-sm bg-muted">
              <div className="h-full bg-primary" style={{ width: '70%' }} title="70% Semantic Weight" />
              <div className="h-full bg-info" style={{ width: '30%' }} title="30% Lexical Weight" />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-muted/80">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-primary" /> 70% Semantic (Vector match)</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-info" /> 30% Lexical (BM25 Keyword search)</span>
            </div>
          </div>
        </PipelineStage>

        <Connector countReduction="Filter −300" />

        {/* Stage 4: Cross-Encoder */}
        <PipelineStage
          number="4"
          title="Cross-Encoder Re-ranking (Deep Attention)"
          icon={Cpu}
          subtitle="Heavy joint-attention transformer scoring"
          output="200 Profiles"
          isOpen={openStages[4]}
          onToggle={() => toggleStage(4)}
        >
          <p className="text-body-sm leading-relaxed text-muted font-medium">
            The Joint-attention Cross-Encoder model (<code className="text-primary font-mono text-xs">ms-marco-MiniLM-L-6-v2</code>) evaluates candidate career descriptions jointly against the Job Description query. It is highly accurate but computationally expensive (taking ~80% of total pipeline run time).
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-border bg-background rounded p-3 text-center">
              <span className="block text-[9px] font-mono uppercase text-muted/70">Re-ranking Model</span>
              <span className="block text-body-sm font-bold text-foreground mt-0.5 font-mono">ms-marco-MiniLM-L-6-v2</span>
            </div>
            <div className="border border-border bg-background rounded p-3 text-center">
              <span className="block text-[9px] font-mono uppercase text-muted/70">Time Share</span>
              <span className="block text-body-sm font-bold text-warning mt-0.5 font-mono">~80% Pipeline Cost</span>
            </div>
          </div>
        </PipelineStage>

        <Connector countReduction="Filter −50" />

        {/* Stage 5: Composite Scoring */}
        <PipelineStage
          number="5"
          title="Interpretable Composite Scoring"
          icon={Calculator}
          subtitle="Multi-criteria weighted formula + adjustments"
          output="150 Profiles"
          isOpen={openStages[5]}
          onToggle={() => toggleStage(5)}
        >
          <p className="text-body-sm leading-relaxed text-muted font-medium">
            Calculates the base match score using a transparent weighted formula over five criteria families: Career Quality, Semantic Fit, Skill Match, Assessments, and Experience Fit. Adjusts scores dynamically based on trajectory, consistency, and anti-fit penalties.
          </p>
          <div className="border border-border bg-background rounded-lg p-5 space-y-4">
            <span className="text-[10px] font-mono font-bold uppercase text-muted/70 block">Five Core Scoring Criteria Weights</span>
            <div className="space-y-3">
              {[
                { label: 'Career Quality (Company / Institution prestige)', w: 0.30, key: 'career' },
                { label: 'Semantic Fit (JD Contextual matching)', w: 0.25, key: 'semantic' },
                { label: 'Skill Match (Required JD Stack density)', w: 0.20, key: 'skill' },
                { label: 'Verified Assessments (Hard testing scores)', w: 0.15, key: 'assessment' },
                { label: 'Experience Fit (Target YOE & Location)', w: 0.10, key: 'experience' }
              ].map(({ label, w, key }) => (
                <div key={key} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-muted/90">{label}</span>
                    <span className="font-mono text-foreground">{w * 100}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-surface border border-border/40">
                    <div className="h-full rounded-sm" style={{ width: `${w * 100}%`, backgroundColor: PART_COLORS[key] }} />
                  </div>
                </div>
              ))}
            </div>
            
            <div className="pt-3 border-t border-border/40 grid grid-cols-2 gap-3 text-caption text-muted/80 font-mono">
              <div>Trajectory Boost/Penalty: <span className="text-foreground font-semibold">±0.05</span></div>
              <div>Profile Consistency: <span className="text-foreground font-semibold">±0.03</span></div>
              <div>Consultant Anchor Penalty: <span className="text-danger font-semibold">−0.10</span></div>
              <div>Availability Multiplier: <span className="text-success font-semibold">0.10x – 1.25x</span></div>
            </div>
          </div>
        </PipelineStage>

        <Connector countReduction="Filter −50" />

        {/* Stage 6: Safety Filters */}
        <PipelineStage
          number="6"
          title="Safety Filters & Assessment Gates"
          icon={ShieldCheck}
          subtitle="Integrity checks and disqualification rules"
          output="100 Profiles"
          isOpen={openStages[6]}
          onToggle={() => toggleStage(6)}
        >
          <p className="text-body-sm leading-relaxed text-muted font-medium">
            Applies zero-tolerance gates: checks for skill-duration fraud, impossible overlapping timelines, and assessment contradictions. Disqualified profiles and Honeypots are filtered out, demoted, or replaced by clean backup candidates.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Honeypot traps */}
            <div className="border border-border/60 bg-danger/5 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-danger shrink-0" />
                <span className="text-[10px] font-mono font-bold uppercase text-danger">Honeypot Traps (Auto-Eliminated)</span>
              </div>
              <ul className="space-y-1.5 text-caption text-muted">
                <li><strong>Skill Fraud</strong>: claiming expert skills with under 3m history.</li>
                <li><strong>Contradiction</strong>: claiming expert status but scoring &lt;25 on assessment.</li>
                <li><strong>Inflation</strong>: careers months represent less than 35% of total YoE.</li>
                <li><strong>Overlap</strong>: two full-time roles overlapping by more than 6 months.</li>
              </ul>
            </div>

            {/* Disqualifiers */}
            <div className="border border-border/60 bg-warning/5 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-1.5">
                <Ban className="h-4 w-4 text-warning shrink-0" />
                <span className="text-[10px] font-mono font-bold uppercase text-warning">Disqualification Filters (Match demoted)</span>
              </div>
              <ul className="space-y-1.5 text-caption text-muted">
                <li><strong>IT-Services</strong>: profile consisting solely of services-firm consultation.</li>
                <li><strong>Title Chaser</strong>: short stints (&lt;18m) with constant title escalation.</li>
                <li><strong>Wrong Spec</strong>: pure Computer Vision CV profile with zero NLP/IR matching.</li>
              </ul>
            </div>
          </div>
        </PipelineStage>

        <Connector countReduction="Output" />

        {/* Stage 7: Final Top 100 */}
        <PipelineStage
          number="7"
          title="Final Top 100 Pipeline"
          icon={CheckCircle2}
          subtitle="Audited, ranked candidate dossier output"
          output="Top 100 Ranked"
          isOpen={openStages[7]}
          onToggle={() => toggleStage(7)}
        >
          <p className="text-body-sm leading-relaxed text-muted font-medium">
            The final, deterministic, audited candidate pipeline rendered on the main Candidates dashboard. Ready for recruiter review, comparison, shortlisting, and outreach.
          </p>
          
          <div className="border border-border bg-background rounded-lg p-5 space-y-4">
            <span className="text-[10px] font-mono font-bold uppercase text-muted/70 block">Verified Pipeline Guarantees</span>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="bg-surface border border-border/40 rounded p-3 text-center space-y-1">
                <Timer className="h-4 w-4 text-primary mx-auto" />
                <span className="block text-[10px] font-bold text-foreground leading-tight">Fast Execution</span>
                <span className="block text-[9px] text-muted font-mono leading-none">~11.2 s CPU</span>
              </div>
              <div className="bg-surface border border-border/40 rounded p-3 text-center space-y-1">
                <Lock className="h-4 w-4 text-primary mx-auto" />
                <span className="block text-[10px] font-bold text-foreground leading-tight">Fully Offline</span>
                <span className="block text-[9px] text-muted font-mono leading-none">HF_HUB_OFFLINE</span>
              </div>
              <div className="bg-surface border border-border/40 rounded p-3 text-center space-y-1">
                <CheckCircle2 className="h-4 w-4 text-success mx-auto" />
                <span className="block text-[10px] font-bold text-foreground leading-tight">Deterministic</span>
                <span className="block text-[9px] text-muted font-mono leading-none">Seeded Randomness</span>
              </div>
            </div>
          </div>
        </PipelineStage>
      </div>
    </motion.main>
  );
}
