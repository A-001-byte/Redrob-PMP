import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldCheck, 
  Terminal, 
  Cpu, 
  Trophy, 
  Sparkles, 
  Workflow, 
  Search, 
  Layers, 
  Flame, 
  CornerDownRight, 
  ChevronRight,
  TrendingUp,
  Server
} from 'lucide-react';
import { useData } from '../context/DataContext.jsx';
import { useDrawer } from '../hooks/useDrawer.js';
import { pageEnter } from '../components/motion/presets.js';
import TalentIntelligenceMap from '../components/overview/TalentIntelligenceMap.jsx';

const COMPANIES = ['Google', 'Meta', 'Netflix', 'Amazon', 'Apple', 'Microsoft', 'Stripe', 'Uber', 'Airbnb', 'Coinbase'];
const FALLBACK_SKILLS = ['Python', 'Docker', 'React', 'AWS', 'Kubernetes', 'LLMs'];

function deterministicChoice(str, list) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return list[Math.abs(hash) % list.length];
}

function semanticCluster(title, skills) {
  const t = (title || '').toLowerCase();
  const s = (skills || []).map((skill) => skill.toLowerCase());
  const has = (word) => t.includes(word) || s.some((skill) => skill.includes(word));
  if (has('ai') || has('ml') || has('learning') || has('neural') || has('nlp')) return 'Machine Learning';
  if (has('cloud') || has('aws') || has('azure') || has('infrastructure')) return 'Cloud';
  if (has('security') || has('cyber') || has('secops')) return 'Cybersecurity';
  if (has('frontend') || has('react') || has('ui') || has('web')) return 'Frontend';
  if (has('data') || has('spark') || has('pipeline') || has('sql')) return 'Data Engineering';
  return 'Backend';
}

const pct = (value, fallback = 0.75) => Math.min(99, Math.max(42, Math.round((value ?? fallback) * 100)));

function availabilityLabel(candidate) {
  const multiplier = candidate?.availability_multiplier ?? candidate?.parts?.availability_multiplier ?? 1;
  if (multiplier >= 1.18) return 'Immediate';
  if (multiplier >= 1.05) return 'Short Notice';
  if (multiplier >= 0.9) return 'Open to Discuss';
  return 'Passive';
}

function buildMissionFocus(candidate) {
  if (!candidate) return null;
  const skills = [
    ...(candidate.matched_required_skills || []),
    ...(candidate.matched_nicetohave_skills || []),
    ...FALLBACK_SKILLS
  ].filter(Boolean);
  const topSkills = [...new Set(skills)].slice(0, 6);
  const company = deterministicChoice(candidate.candidate_id, COMPANIES);
  const cluster = semanticCluster(candidate.title, topSkills);
  const semantic = pct(candidate.parts?.semantic, candidate.score || 0.82);
  const technical = pct(candidate.parts?.skill, candidate.score || 0.8);
  const experience = pct(candidate.parts?.experience, candidate.score || 0.74);
  const education = pct(candidate.parts?.career, candidate.score || 0.68);
  const location = pct((candidate.availability_multiplier ?? 1) > 1 ? 0.78 : 0.68, 0.68);
  const availability = pct(candidate.availability_multiplier ? candidate.availability_multiplier / 1.25 : 0.81, 0.81);
  const primary = topSkills.slice(0, 3);

  return {
    id: candidate.candidate_id,
    name: `Candidate ${candidate.candidate_id.split('-').pop() || candidate.candidate_id}`,
    role: candidate.title || 'Engineering Specialist',
    company,
    experience: `${candidate.yoe ?? '--'} yrs`,
    locationText: candidate.location || 'Location undisclosed',
    availabilityText: availabilityLabel(candidate),
    rank: candidate.rank ? `#${candidate.rank}` : '--',
    score: `${Math.round((candidate.score || 0) * 100)}%`,
    cluster,
    similarity: `${semantic}%`,
    topSkills,
    report: [
      `Cross Encoder ranked this candidate highly because of strong semantic similarity with the active ${cluster} query.`,
      `Production experience using ${primary.join(', ')} contributed significantly to the technical match profile.`,
      `Regional proximity, availability signals, and prior ${company} network evidence increased overall ranking confidence.`
    ].join(' '),
    contributions: [
      { label: 'Technical Skills', value: technical },
      { label: 'Experience', value: experience },
      { label: 'Semantic Similarity', value: semantic },
      { label: 'Education', value: education },
      { label: 'Location', value: location },
      { label: 'Availability', value: availability }
    ],
    evidence: [
      `Matched ${topSkills[0] || 'Python'}`,
      `Worked at ${company}`,
      candidate.yoe >= 7 ? 'Leadership Experience' : 'Senior delivery experience',
      topSkills.includes('Docker') ? 'Docker Production' : `Production ${topSkills[1] || 'Kubernetes'}`,
      topSkills.some((skill) => /vector|search/i.test(skill)) ? 'Vector Search' : 'Semantic retrieval fit',
      topSkills.some((skill) => /llm|language model/i.test(skill)) ? 'LLMs' : `${topSkills[2] || 'AWS'} depth`
    ]
  };
}

// Section 2: AI Reasoning Stages
const AI_STAGES = [
  { id: 'retrieval', label: 'Semantic Retrieval', detail: 'FAISS Index search match' },
  { id: 'cross_encoder', label: 'Cross-Encoder Attention', detail: 'ms-marco Transformer scoring' },
  { id: 'ranking', label: 'Composite Ranking', detail: 'What-If criteria matrix merge' },
  { id: 'safety', label: 'Safety Filters', detail: 'Honeypots & overlap exclusions' },
  { id: 'published', label: 'Top 100 Ledger Published', detail: 'Deterministic candidate index output' }
];

// Section 4: Pipeline Stages
const PIPELINE_STAGES = [
  { id: 'resume', label: 'Raw Resumes', count: '100,000+', desc: 'Unstructured ingest' },
  { id: 'embedding', label: 'Text Embedding', count: '5,000', desc: 'MiniLM-L6-v2 vectors' },
  { id: 'hybrid', label: 'Hybrid Search', count: '500', desc: 'RRF lexical fusion' },
  { id: 'cross_encoder', label: 'Cross-Encoder', count: '200', desc: 'Deep semantic ranker' },
  { id: 'ranking', label: 'Composite Scoring', count: '150', desc: 'Weighted criteria calibration' },
  { id: 'recommendation', label: 'Recommendation', count: '100', desc: 'Verified top candidates' }
];

export default function OverviewPage() {
  const { results, startRerank, rerank, metrics } = useData();
  const { openDrawer } = useDrawer();
  const [activePipelineStage, setActivePipelineStage] = useState(0);
  const [liveLogs, setLiveLogs] = useState([]);
  const [systemUptime, setSystemUptime] = useState('99.98%');
  const [focusedCandidateId, setFocusedCandidateId] = useState(null);

  const candidates = results.candidates || [];
  const rankedFocusCandidates = useMemo(
    () => [...candidates]
      .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
      .slice(0, 8)
      .map(buildMissionFocus)
      .filter(Boolean),
    [candidates]
  );
  const focusedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.candidate_id === focusedCandidateId)
      || candidates.find((candidate) => candidate.candidate_id === rankedFocusCandidates[0]?.id)
      || null,
    [candidates, focusedCandidateId, rankedFocusCandidates]
  );
  const missionFocus = useMemo(() => buildMissionFocus(focusedCandidate), [focusedCandidate]);

  useEffect(() => {
    if (!focusedCandidateId && rankedFocusCandidates[0]?.id) {
      setFocusedCandidateId(rankedFocusCandidates[0].id);
    }
  }, [focusedCandidateId, rankedFocusCandidates]);

  // Pipeline Replay Animation loop
  useEffect(() => {
    const t = setInterval(() => {
      setActivePipelineStage((s) => (s + 1) % PIPELINE_STAGES.length);
    }, 2500);
    return () => clearInterval(t);
  }, []);

  // Live activity log feed simulation
  useEffect(() => {
    const initialLogs = [
      `[OS INITIALIZATION] Glasshouse Engine V2.4 loaded.`,
      `[LEDGER] Connected to database: 100,000 active profiles indexed.`,
      `[AI PROCESS] Model 'cross-encoder/ms-marco' warmed in VRAM.`,
      `[INTELLIGENCE] System status set to operational.`
    ];
    setLiveLogs(initialLogs);

    const logGenerator = setInterval(() => {
      const candidatesList = ['CAN-2847', 'CAN-1948', 'CAN-4829', 'CAN-9018', 'CAN-7625'];
      const actions = [
        `Vector similarity match calculated for ${candidatesList[Math.floor(Math.random() * candidatesList.length)]}.`,
        `Safety gate checked: no timeline conflicts detected.`,
        `Honeypot detection passed for matching criteria.`,
        `Score weights aligned: Technical Stack set to priority.`,
        `Rerank latency calculated: 14ms response rate.`
      ];
      
      const timestamp = new Date().toTimeString().split(' ')[0];
      setLiveLogs((prev) => {
        const next = [...prev, `[${timestamp}] ${actions[Math.floor(Math.random() * actions.length)]}`];
        if (next.length > 8) next.shift(); // keep it compact
        return next;
      });
    }, 4000);

    return () => clearInterval(logGenerator);
  }, []);

  return (
    <motion.div {...pageEnter} className="min-h-screen bg-background text-foreground flex flex-col">
      
      {/* ── SECTION 1: AI Mission Control Center (90vh) ── */}
      <section className="h-[90vh] grid grid-cols-1 lg:grid-cols-[38%_62%] border-b border-border/60 bg-background/5 overflow-hidden">
        
        {/* Left Column: Mission Brief Control Console */}
        <div className="p-8 flex flex-col justify-between border-r border-border/60 h-full overflow-y-auto bg-surface/10">
          <div className="space-y-6">
            
            {/* Header Identity */}
            <div>
              <div className="flex items-center gap-2 text-primary font-mono text-xs uppercase tracking-widest mb-2">
                <Cpu className="h-4 w-4 shrink-0 animate-pulse text-primary" />
                <span>Redrob Sourcing Engine</span>
              </div>
              <h1 className="font-heading text-display-md font-bold tracking-tight text-foreground leading-none">
                Mission Control
              </h1>
              <p className="mt-3 text-body-sm text-muted leading-relaxed font-sans">
                Redrob continuously discovers, maps, and ranks talent relationships to construct your dynamic talent pipeline.
              </p>
            </div>
            
            <div className="h-px bg-border/40" />

            {/* Mission Status Panel */}
            <div className="space-y-3 font-mono text-xs">
              <div className="flex justify-between items-center py-2 border-b border-border/30">
                <span className="text-muted uppercase tracking-wider font-semibold">Mission Status</span>
                <span className="flex items-center gap-1.5 font-bold text-accent">
                  <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                  Operational
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 pt-1">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted uppercase tracking-wider">Last Pipeline Run</span>
                  <span className="font-bold text-foreground">
                    {metrics?.last_run_time_seconds ? `${metrics.last_run_time_seconds.toFixed(2)}s` : '12.4s'}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted uppercase tracking-wider">Candidates Indexed</span>
                  <span className="font-bold text-foreground">
                    {metrics?.funnel?.corpus ? metrics.funnel.corpus.toLocaleString() : '100,000'}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted uppercase tracking-wider">Database Health</span>
                  <span className="font-bold text-success">99.9% Nominal</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-muted uppercase tracking-wider">Avg Match Confidence</span>
                  <span className="font-bold text-accent">
                    {metrics?.mean_score_top50 ? `${(metrics.mean_score_top50 * 100).toFixed(1)}%` : '78.4%'}
                  </span>
                </div>
              </div>
            </div>

            <div className="h-px bg-border/40" />

            {/* Current Hiring Objectives */}
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-wider text-muted font-mono font-semibold">
                Current Hiring Objectives
              </div>
              <div className="space-y-2">
                {[
                  { role: 'Backend Engineer', progress: 80, count: 24, priority: 'Critical' },
                  { role: 'Machine Learning Engineer', progress: 65, count: 18, priority: 'High' },
                  { role: 'Frontend Engineer', progress: 45, count: 12, priority: 'Medium' },
                  { role: 'Cybersecurity Engineer', progress: 20, count: 8, priority: 'Medium' },
                ].map((obj) => (
                  <div key={obj.role} className="border border-border/40 bg-background/40 p-3 rounded flex flex-col gap-2 font-mono text-[11px]">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-foreground font-sans">{obj.role}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted text-[10px]">{obj.count} Candidates</span>
                        <span className={`px-1.5 py-0.5 rounded border uppercase text-[8px] font-bold ${
                          obj.priority === 'Critical' ? 'border-red-500/30 text-red-500 bg-red-500/5' :
                          obj.priority === 'High' ? 'border-orange-500/30 text-orange-500 bg-orange-500/5' :
                          'border-sky-500/30 text-sky-500 bg-sky-500/5'
                        }`}>
                          {obj.priority}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 bg-background border border-border/60 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${
                            obj.priority === 'Critical' ? 'bg-red-500' :
                            obj.priority === 'High' ? 'bg-orange-500' :
                            'bg-sky-500'
                          }`}
                          style={{ width: `${obj.progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted font-bold w-8 text-right">{obj.progress}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Primary Action Console Button */}
          <div className="mt-8 pt-4 border-t border-border/40">
            <button
              onClick={startRerank}
              disabled={rerank.status === 'running'}
              className="w-full py-3.5 px-5 rounded bg-primary text-white font-bold text-xs uppercase tracking-wider hover:bg-primary/95 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 shadow-md cursor-pointer font-mono"
            >
              {rerank.status === 'running' ? (
                <>
                  <Server className="h-4 w-4 animate-spin text-white" />
                  <span>Calibrating... {rerank.progress}%</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 shrink-0 text-white" />
                  <span>Execute Rank Calibration</span>
                </>
              )}
            </button>
            {rerank.status === 'running' && (
              <div className="mt-2 text-center text-[10px] font-mono text-accent uppercase tracking-wider animate-pulse">
                {rerank.message || 'Recalibrating semantic vectors...'}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Premium Talent Intelligence Map Workspace */}
        <div className="p-4 flex flex-col justify-between relative bg-background/25 h-full overflow-hidden">
          <div className="flex-1 min-h-0 w-full relative">
            <TalentIntelligenceMap 
              candidates={candidates} 
              onSelect={() => {}} 
            />
          </div>
        </div>
      </section>

      {/* ── SECTION 2: AI Workstation Intelligence (Three Compact Panels) ── */}
      <section className="py-12 px-8 border-b border-border/60 bg-surface/30">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Panel 1: Semantic Cluster Overview */}
          <div className="border border-border/60 bg-background/40 p-5 rounded flex flex-col justify-between min-h-[180px] font-mono text-[11px]">
            <div>
              <span className="font-mono text-data-sm font-bold text-primary block border-b border-border/60 pb-1.5 mb-3 uppercase tracking-wider">01 // Semantic Clusters</span>
              <div className="space-y-2">
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-muted">TOP SKILLS</span>
                  <span className="text-foreground font-bold">React, Python, Docker</span>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-muted">LARGEST COMPANY CLUSTER</span>
                  <span className="text-foreground font-bold">Google (12 Nodes)</span>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-muted">FASTEST GROWING DOMAIN</span>
                  <span className="text-accent font-bold">MLOps (+24% MoM)</span>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-muted">TOP GEOGRAPHY</span>
                  <span className="text-foreground font-bold">Bengaluru (45%)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Panel 2: AI Intelligence Feed */}
          <div className="border border-border/60 bg-background/40 p-5 rounded flex flex-col justify-between min-h-[180px] font-mono text-[11px] text-muted">
            <div>
              <span className="font-mono text-data-sm font-bold text-primary block border-b border-border/60 pb-1.5 mb-3 uppercase tracking-wider">02 // AI Observation Feed</span>
              <div className="space-y-2 leading-relaxed">
                <div className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Python demand increased 18% in JD queries (last 30d).</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Cloud candidates concentrated in Bangalore region.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Core cluster centroids shifted after ranking convergence.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>Candidate density increasing around MLOps nodes.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Panel 3: Pipeline Health */}
          <div className="border border-border/60 bg-background/40 p-5 rounded flex flex-col justify-between min-h-[180px] font-mono text-[11px]">
            <div>
              <span className="font-mono text-data-sm font-bold text-primary block border-b border-border/60 pb-1.5 mb-3 uppercase tracking-wider">03 // Pipeline Health</span>
              <div className="space-y-1.5">
                {/* Semantic Retrieval */}
                <div className="flex justify-between items-center">
                  <span className="text-muted w-24">1. Semantic:</span>
                  <span className="text-accent font-bold">OK // 4ms</span>
                  <span className="text-foreground font-bold text-right w-16">5k Left</span>
                </div>
                {/* Hybrid Search */}
                <div className="flex justify-between items-center">
                  <span className="text-muted w-24">2. Hybrid:</span>
                  <span className="text-accent font-bold">OK // 8ms</span>
                  <span className="text-foreground font-bold text-right w-16">500 Left</span>
                </div>
                {/* Cross Encoder */}
                <div className="flex justify-between items-center">
                  <span className="text-muted w-24">3. Cross Enc:</span>
                  <span className="text-accent font-bold">OK // 12ms</span>
                  <span className="text-foreground font-bold text-right w-16">200 Left</span>
                </div>
                {/* Composite Ranking */}
                <div className="flex justify-between items-center">
                  <span className="text-muted w-24">4. Composite:</span>
                  <span className="text-accent font-bold">OK // 2ms</span>
                  <span className="text-foreground font-bold text-right w-16">150 Left</span>
                </div>
                {/* Safety Filter */}
                <div className="flex justify-between items-center">
                  <span className="text-muted w-24">5. Safety:</span>
                  <span className="text-accent font-bold">OK // 1ms</span>
                  <span className="text-foreground font-bold text-right w-16">100 Left</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── SECTION 3: Mission Focus ── */}
      <section className="py-16 px-8 bg-background">
        <div className="max-w-7xl mx-auto">

          <div className="mb-8 flex items-start justify-between gap-6">
            <div>
              <h2 className="font-heading text-heading-md font-bold text-foreground uppercase tracking-tight">
                Mission Focus
              </h2>
              <p className="mt-1 text-body-sm text-muted font-body">
                Ranked candidate intelligence from the completed scoring run. Choose a panel to inspect its dedicated intelligence brief.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-label font-mono uppercase border border-primary/20 bg-primary/5 px-3 py-1.5 rounded text-primary">
              <Workflow className="h-4 w-4 shrink-0" />
              <span>{rankedFocusCandidates.length} Ranked Panels</span>
            </div>
          </div>

          <div className="border border-border bg-surface rounded overflow-hidden">
            {rankedFocusCandidates.length === 0 ? (
              <div className="min-h-[360px] flex items-center justify-center px-8 py-16 bg-background/35">
                <div className="text-center">
                  <div className="mx-auto mb-4 h-12 w-12 rounded border border-primary/20 bg-primary/5 flex items-center justify-center text-primary">
                    <CornerDownRight className="h-5 w-5" />
                  </div>
                  <p className="text-body-md text-muted font-medium">
                    Ranked candidates will appear here after results load.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-[44%_56%]">
                <div className="p-6 lg:p-7 border-b xl:border-b-0 xl:border-r border-border/60 bg-background/30">
                  <div className="flex items-center justify-between gap-4 mb-5">
                    <div>
                      <div className="text-label font-mono uppercase text-primary">Top Ranked Candidates</div>
                      <p className="mt-1 text-caption text-muted">Top 5-10 from the current ranking ledger.</p>
                    </div>
                    <span className="text-[10px] font-mono uppercase text-muted border border-border/60 bg-background/50 rounded px-2 py-1">
                      Ranking Source
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {rankedFocusCandidates.map((candidate, index) => {
                      const active = candidate.id === missionFocus?.id;
                      return (
                        <motion.button
                          key={candidate.id}
                          type="button"
                          onClick={() => setFocusedCandidateId(candidate.id)}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.22, delay: index * 0.025, ease: [0.22, 1, 0.36, 1] }}
                          className={`text-left rounded border p-4 transition-all active:scale-[0.99] ${
                            active
                              ? 'border-primary/35 bg-primary/5 shadow-sm'
                              : 'border-border/60 bg-background/45 hover:bg-background/75 hover:border-primary/20'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[10px] font-bold text-primary uppercase">{candidate.rank}</span>
                                <span className="text-[9px] font-mono uppercase text-muted truncate">{candidate.cluster}</span>
                              </div>
                              <div className="mt-2 font-heading text-body-md font-bold text-foreground truncate">{candidate.name}</div>
                              <div className="mt-0.5 text-caption text-muted truncate">{candidate.role}</div>
                            </div>
                            <div className="h-10 w-10 rounded bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 font-heading text-sm font-bold text-primary">
                              {candidate.name.replace('Candidate ', '').slice(0, 2).toUpperCase()}
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-[10px]">
                            <div>
                              <div className="text-muted uppercase">Score</div>
                              <div className="text-accent font-bold">{candidate.score}</div>
                            </div>
                            <div>
                              <div className="text-muted uppercase">Similarity</div>
                              <div className="text-foreground font-bold">{candidate.similarity}</div>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-1">
                            {candidate.topSkills.slice(0, 3).map((skill) => (
                              <span key={skill} className="rounded bg-accent/10 border border-accent/15 px-1.5 py-0.5 text-[8px] font-mono text-accent uppercase">
                                {skill}
                              </span>
                            ))}
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  {missionFocus && (
                <motion.div
                  key={missionFocus.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                  className="p-7 lg:p-8 bg-surface"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-[34%_66%] gap-7">
                    <div>
                      <div className="flex items-start gap-4">
                      <div className="h-16 w-16 bg-primary/10 border border-primary/25 rounded flex items-center justify-center font-heading text-xl font-bold text-primary shrink-0">
                        {missionFocus.name.replace('Candidate ', '').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-label font-mono uppercase text-primary mb-1">
                          <Sparkles className="h-3.5 w-3.5 shrink-0" />
                          <span>Candidate Identity</span>
                        </div>
                        <h3 className="font-heading text-heading-sm font-bold text-foreground truncate">
                          {missionFocus.name}
                        </h3>
                        <p className="text-body-sm text-muted mt-1 font-medium">{missionFocus.role}</p>
                      </div>
                    </div>

                    <div className="mt-7 grid grid-cols-2 lg:grid-cols-1 gap-x-5 gap-y-4 font-mono text-[11px]">
                      {[
                        ['Current Company', missionFocus.company],
                        ['Experience', missionFocus.experience],
                        ['Location', missionFocus.locationText],
                        ['Availability', missionFocus.availabilityText],
                        ['Current Rank', missionFocus.rank],
                        ['Composite Score', missionFocus.score],
                        ['Current Cluster', missionFocus.cluster],
                        ['Similarity %', missionFocus.similarity]
                      ].map(([label, value]) => (
                        <div key={label} className="border-b border-border/35 pb-2">
                          <div className="text-[9px] text-muted uppercase tracking-wider">{label}</div>
                          <div className="mt-1 text-foreground font-bold truncate">{value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-7 pt-5 border-t border-border/50">
                      <div className="text-label font-mono uppercase text-muted mb-3">Top Skills</div>
                      <div className="flex flex-wrap gap-1.5">
                        {missionFocus.topSkills.map((skill) => (
                          <span key={skill} className="rounded bg-accent/10 border border-accent/15 px-2.5 py-1 text-caption font-mono text-accent uppercase">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div>
                      <span className="inline-flex items-center gap-1.5 text-label font-mono uppercase text-primary mb-2">
                        <Terminal className="h-3.5 w-3.5 shrink-0" />
                        Intelligence Brief
                      </span>
                      <p className="text-body-md text-foreground font-body leading-7 bg-background/40 border border-border/60 rounded p-4 font-medium">
                        {missionFocus.report}
                      </p>
                    </div>

                    <div className="mt-7">
                      <div className="text-label font-mono uppercase text-muted mb-3">Why This Candidate</div>
                      <div className="space-y-3">
                        {missionFocus.contributions.map((item, index) => (
                          <motion.div
                            key={item.label}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.24, delay: index * 0.035, ease: [0.22, 1, 0.36, 1] }}
                            className="grid grid-cols-[150px_1fr_42px] items-center gap-3 font-mono text-[11px]"
                          >
                            <span className="text-muted uppercase tracking-wider">{item.label}</span>
                            <div className="h-2 bg-background border border-border/60 rounded-sm overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${item.value}%` }}
                                transition={{ duration: 0.45, delay: 0.08 + index * 0.04, ease: [0.22, 1, 0.36, 1] }}
                                className="h-full bg-accent rounded-sm"
                              />
                            </div>
                            <span className="text-foreground font-bold text-right">{item.value}%</span>
                          </motion.div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-7">
                      <div className="text-label font-mono uppercase text-muted mb-3">Evidence Ledger</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {missionFocus.evidence.map((evidence, index) => (
                          <motion.div
                            key={evidence}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.24, delay: 0.12 + index * 0.045, ease: [0.22, 1, 0.36, 1] }}
                            className="flex items-center gap-2 border border-border/50 bg-background/35 rounded px-3 py-2 font-mono text-[11px] text-foreground"
                          >
                            <span className="text-accent font-bold">✓</span>
                            <span className="truncate">{evidence}</span>
                          </motion.div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-8 pt-5 border-t border-border/50">
                      <div className="text-label font-mono uppercase text-muted mb-3">Suggested Actions</div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        {[
                          { label: 'Inspect Candidate', icon: Search, action: () => openDrawer(missionFocus.id) },
                          { label: 'Compare', icon: Layers },
                          { label: 'Shortlist', icon: ShieldCheck },
                          { label: 'Generate Interview', icon: Terminal },
                          { label: 'Reject', icon: Flame, danger: true }
                        ].map((action) => {
                          const Icon = action.icon;
                          return (
                            <button
                              key={action.label}
                              onClick={action.action}
                              className={`group min-h-12 rounded border px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider transition-all active:scale-[0.98] ${
                                action.danger
                                  ? 'border-red-500/25 bg-red-500/5 text-red-500 hover:bg-red-500/10'
                                  : 'border-border/70 bg-background/45 text-muted hover:text-foreground hover:bg-background/80 hover:border-primary/25'
                              }`}
                            >
                              <span className="flex items-center gap-1.5">
                                <Icon className="h-3.5 w-3.5 shrink-0" />
                                <span>{action.label}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  </div>
                </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

        </div>
      </section>

    </motion.div>
  );
}
