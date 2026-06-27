import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BrainCircuit,
  Wrench,
  MapPin,
  Calendar,
  SlidersHorizontal,
  TrendingUp,
  Users,
  Activity,
  Briefcase
} from 'lucide-react';
import ChartCard, { AXIS_TICK, CURSOR_FILL, DarkTooltip, GRID_STROKE } from '../components/charts/ChartCard.jsx';
import { pageEnter } from '../components/motion/presets.js';
import { useData } from '../context/DataContext.jsx';
import {
  availabilityBins,
  binScores,
  partMeansByCohort,
  scoreByRank,
  skillCoverage,
  binExperience,
} from '../utils/analytics.js';
import { PART_COLORS, PART_LABELS } from '../utils/formatters.js';

const PIE_COLORS = ['var(--primary)', 'var(--secondary)', 'var(--accent)', 'var(--support)'];

function Empty() {
  return (
    <div className="flex h-[280px] items-center justify-center text-sm text-muted font-bold uppercase tracking-widest bg-surface/30 border border-border/60 rounded-lg">
      No submission yet — run Re-rank first.
    </div>
  );
}

function BriefingCard({ question, icon: Icon, description, insights, kpis, chart, insightSummary }) {
  return (
    <div className="rounded border border-border bg-surface shadow-sm overflow-hidden flex flex-col lg:flex-row min-h-[380px] transition-all duration-150 hover:border-border/80">
      {/* Left Briefing Column */}
      <div className="w-full lg:w-2/5 p-6 border-b lg:border-b-0 lg:border-r border-border/60 bg-surface-hover/10 flex flex-col justify-between space-y-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-4.5 w-4.5 text-primary shrink-0" />}
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary">Recruiter Query Briefing</span>
          </div>
          <h3 className="font-heading text-lg font-bold tracking-tight text-foreground leading-tight">
            {question}
          </h3>
          <p className="text-body-sm leading-relaxed text-muted font-medium">
            {description}
          </p>
          <ul className="space-y-2 pt-2">
            {insights.map((ins, i) => (
              <li key={i} className="flex items-start gap-2 text-body-sm">
                <span className="h-1.5 w-1.5 shrink-0 rounded-sm bg-primary mt-2" />
                <span className="text-muted/90 font-medium leading-relaxed">{ins}</span>
              </li>
            ))}
          </ul>
        </div>
        
        {kpis && kpis.length > 0 && (
          <div className="grid grid-cols-2 gap-3 pt-4 border-t border-border/40">
            {kpis.map((k, i) => (
              <div key={i} className="bg-background border border-border/60 rounded px-3 py-2">
                <span className="block text-[9px] font-mono uppercase text-muted/65 tracking-wider truncate">{k.label}</span>
                <span className="block text-body-sm font-extrabold text-primary font-mono mt-0.5">{k.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right Chart Column */}
      <div className="w-full lg:w-3/5 p-6 flex flex-col justify-between bg-surface">
        <div className="flex-1 flex items-center justify-center min-h-[280px]">
          {chart}
        </div>
        {insightSummary && (
          <div className="mt-4 pt-3 border-t border-border/40 text-caption text-muted/80 font-mono">
            * {insightSummary}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { results, metrics } = useData();
  const candidates = results.candidates;
  const animate = !useReducedMotion();

  const scoreBins = useMemo(() => binScores(candidates), [candidates]);
  const cohorts = useMemo(() => partMeansByCohort(candidates), [candidates]);
  const availBins = useMemo(() => availabilityBins(candidates), [candidates]);
  const rankCurve = useMemo(() => scoreByRank(candidates), [candidates]);
  const coverage = useMemo(() => skillCoverage(candidates), [candidates]);
  const expBins = useMemo(() => binExperience(candidates), [candidates]);

  const locations = useMemo(
    () =>
      Object.entries(metrics?.location_distribution ?? {}).map(([name, value]) => ({
        name,
        value,
      })),
    [metrics]
  );

  const empty = candidates.length === 0;

  // Dynamic KPIs calculations
  const top10Cohort = useMemo(() => cohorts.find((c) => c.cohort === 'Top 10') || {}, [cohorts]);
  const top10Semantic = top10Cohort.semantic !== undefined ? top10Cohort.semantic.toFixed(3) : '--';
  const top10Career = top10Cohort.career !== undefined ? top10Cohort.career.toFixed(3) : '--';

  const totalCandidates = candidates.length || 1;
  const topHub = locations[0]?.name || '—';
  const localPct = `${(((locations[0]?.value ?? 0) + (locations[1]?.value ?? 0)) / totalCandidates * 100).toFixed(0)}%`;

  const bestRange = useMemo(() => [...expBins].sort((a, b) => b.averageScore - a.averageScore)[0], [expBins]);
  const bestRangeLabel = bestRange ? bestRange.range : '--';
  const seniorCount = useMemo(() => expBins
    .filter((b) => b.range !== '0–3 YOE' && b.range !== '3–6 YOE')
    .reduce((sum, b) => sum + b.count, 0), [expBins]);
  const seniorPct = `${((seniorCount / totalCandidates) * 100).toFixed(0)}%`;

  const topSkill = coverage?.[0]?.skill || '--';
  const topSkillCount = coverage?.[0]?.count || 0;
  const topSkillPct = `${((topSkillCount / totalCandidates) * 100).toFixed(0)}%`;

  const activeCount = useMemo(() => candidates.filter((c) => c.availability_multiplier > 1.0).length, [candidates]);
  const activePct = `${((activeCount / totalCandidates) * 100).toFixed(0)}%`;
  const avgAvail = useMemo(() => candidates.length
    ? (candidates.reduce((sum, c) => sum + (c.availability_multiplier || 1), 0) / candidates.length).toFixed(2) + 'x'
    : '--', [candidates]);

  return (
    <motion.main {...pageEnter} className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">Recruitment Intelligence Briefing</h1>
        <p className="mt-1 text-sm text-muted">
          Active analytical dashboard computed live from the current top-100 candidate dossier pipeline.
        </p>
      </div>

      {empty ? (
        <Empty />
      ) : (
        <div className="grid gap-6">
          {/* Question 1: Why did these candidates rank highly? */}
          <BriefingCard
            question="Why did these candidates rank highly?"
            icon={SlidersHorizontal}
            description="Examines the weighted score contributions across different rank cohorts. The model ranks candidates based on five core structural criteria: Semantic match, Career background, Skills, Experience fit, and Assessment score."
            insights={[
              "Top 10 candidates are heavily driven by higher Semantic Alignment and Career/Academic prestige.",
              "Skills match is consistently high across all ranks, proving it is a baseline hurdle rather than a differentiator.",
              "Score adjustments (trajectory and consistency) penalize candidates in the lower cohorts."
            ]}
            kpis={[
              { label: "Top-10 Semantic", value: top10Semantic },
              { label: "Top-10 Career", value: top10Career }
            ]}
            chart={
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={cohorts}
                  layout="vertical"
                  margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                >
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} />
                  <YAxis
                    type="category"
                    dataKey="cohort"
                    width={56}
                    tick={AXIS_TICK}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    content={<DarkTooltip formatter={(v) => Number(v).toFixed(3)} />}
                    cursor={CURSOR_FILL}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: '"Inter", sans-serif' }} />
                  {Object.keys(PART_COLORS).map((p) => (
                    <Bar
                      key={p}
                      dataKey={p}
                      name={PART_LABELS[p]}
                      stackId="parts"
                      fill={PART_COLORS[p]}
                      isAnimationActive={animate}
                    />
                  ))}
                  <Bar
                    dataKey="adjustments"
                    name="Net adjustments"
                    stackId="parts"
                    fill="var(--accent)"
                    isAnimationActive={animate}
                  />
                </BarChart>
              </ResponsiveContainer>
            }
            insightSummary="Shows mean weighted part contributions per rank cohort. Hover over parts to see subscores."
          />

          {/* Question 2: Which ranking factors contribute most overall? */}
          <BriefingCard
            question="Which ranking factors contribute most overall?"
            icon={TrendingUp}
            description="Illustrates the monotone score curve across the full pipeline. The steepness of this curve helps recruiters see the selectivity of candidates and the drop-off rate of match quality."
            insights={[
              "A steep score decline occurs immediately after Rank 10, indicating a highly selective top-tier matching profile.",
              "Top 50 represent the core cohort of candidates who clear nearly all primary and secondary matching criteria.",
              "Mean score of the Top 10 sits significantly higher, validating the model's accuracy in separating edge candidates."
            ]}
            kpis={[
              { label: "Top-10 Mean Score", value: metrics?.mean_score_top10 || '--' },
              { label: "Top-50 Mean Score", value: metrics?.mean_score_top50 || '--' }
            ]}
            chart={
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={rankCurve} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rankFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="rank"
                    type="number"
                    domain={[1, 100]}
                    tickCount={11}
                    tick={AXIS_TICK}
                    tickLine={false}
                    axisLine={{ stroke: GRID_STROKE }}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={AXIS_TICK}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => v.toFixed(2)}
                  />
                  <Tooltip
                    content={<DarkTooltip formatter={(v) => Number(v).toFixed(4)} />}
                    cursor={{ stroke: 'var(--primary)', strokeOpacity: 0.3 }}
                  />
                  {metrics?.mean_score_top10 && (
                    <ReferenceLine
                      x={10}
                      stroke="var(--accent)"
                      strokeDasharray="4 4"
                      label={{
                         value: `top-10 mean`,
                         fill: 'var(--accent)',
                         fontSize: 10,
                         position: 'insideTopRight',
                      }}
                    />
                  )}
                  {metrics?.mean_score_top50 && (
                    <ReferenceLine
                      x={50}
                      stroke="var(--muted)"
                      strokeDasharray="4 4"
                      label={{
                         value: `top-50 mean`,
                         fill: 'var(--muted)',
                         fontSize: 10,
                         position: 'insideTopRight',
                      }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="score"
                    name="Score"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    fill="url(#rankFill)"
                    isAnimationActive={animate}
                  />
                </AreaChart>
              </ResponsiveContainer>
            }
            insightSummary="Monotone-score curve. Reference lines highlight Top 10 and Top 50 cohort boundaries."
          />

          {/* Question 3: Which skills dominate? */}
          <BriefingCard
            question="Which skills dominate the top tier?"
            icon={Wrench}
            description="Analyzes the frequency of Job Description (JD) required skill matches across the top 100. This indicates the primary competencies present in your candidate pool."
            insights={[
              "Core capabilities like Python and Machine Learning are highly abundant in the top tier.",
              "Specialized skills like LLMs, RAG, and Vector Databases are scarcer but present in top ranks.",
              "Identifying scarce skills helps recruiters focus outreach on unique matching talent."
            ]}
            kpis={[
              { label: "Top Match Skill", value: topSkill },
              { label: "Top Skill Frequency", value: topSkillPct }
            ]}
            chart={
              <ResponsiveContainer width="100%" height={Math.max(240, coverage.length * 28)}>
                <BarChart data={coverage} layout="vertical" margin={{ top: 4, right: 24, left: 32, bottom: 0 }}>
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} />
                  <YAxis
                    type="category"
                    dataKey="skill"
                    width={130}
                    tick={{ ...AXIS_TICK, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<DarkTooltip />} cursor={CURSOR_FILL} />
                  <Bar
                    dataKey="count"
                    name="Candidates with match"
                    fill="var(--info)"
                    radius={[0, 3, 3, 0]}
                    isAnimationActive={animate}
                  />
                </BarChart>
              </ResponsiveContainer>
            }
            insightSummary="Shows the frequency of matching required skills within the Top 100 cohort."
          />

          {/* Question 4: Which locations are strongest? */}
          <BriefingCard
            question="Which locations are strongest?"
            icon={MapPin}
            description="Visualizes the geographic mix of the current pipeline. Understanding local versus remote concentration assists in mapping out sourcing strategies."
            insights={[
              "The pipeline concentrates strongly around key Indian tech hubs (Pune and Noida).",
              "International candidates and other regional locations represent a significant talent stream.",
              "Outreach strategies can balance local office attendance requirements with remote flexibility."
            ]}
            kpis={[
              { label: "Local Hub Ratio", value: localPct },
              { label: "Primary Hub", value: topHub }
            ]}
            chart={
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={locations}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    strokeWidth={0}
                    label={({ name, value }) => (value ? `${name} (${value})` : '')}
                    labelLine={{ stroke: GRID_STROKE }}
                    isAnimationActive={animate}
                  >
                    {locations.map((entry, i) => (
                      <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<DarkTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            }
            insightSummary="Geographic distribution of the Top 100. Favors Noida/Pune offices."
          />

          {/* Question 5: Which experience ranges perform best? */}
          <BriefingCard
            question="Which experience ranges perform best?"
            icon={Briefcase}
            description="Compares the average match score across different Years of Experience (YoE) brackets. This validates whether the scoring model aligns with the target seniority."
            insights={[
              "Mid-to-Senior brackets (6–9 and 9–12 YOE) demonstrate the highest average matching scores.",
              "Entry-level candidates (0–3 YOE) are effectively filtered out early due to matching thresholds.",
              "Candidates above 12+ YOE perform well, but are occasionally penalised for stagnant career vectors."
            ]}
            kpis={[
              { label: "Optimal YOE Bracket", value: bestRangeLabel },
              { label: "Senior Candidates %", value: seniorPct }
            ]}
            chart={
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={expBins} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="range" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} />
                  <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} domain={[0, 1.2]} />
                  <Tooltip 
                    content={<DarkTooltip formatter={(val) => Number(val).toFixed(4)} />} 
                    cursor={CURSOR_FILL} 
                  />
                  <Bar
                    dataKey="averageScore"
                    name="Avg Match Score"
                    fill="var(--accent)"
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={animate}
                  />
                </BarChart>
              </ResponsiveContainer>
            }
            insightSummary="Avg composite score by experience bracket. Tooltip displays the average score for each bucket."
          />

          {/* Question 6: How does pipeline attainability compare to match score? */}
          <BriefingCard
            question="How does pipeline attainability compare to match score?"
            icon={Calendar}
            description="Analyzes the availability multiplier distribution. Attainability factors (like notice period, active/passive status) scale the candidate's base score."
            insights={[
              "The availability multiplier ensures high-match active candidates are promoted in pipeline priority.",
              "Active profiles receive up to a 1.25x boost; long notice periods or passive status demote candidates.",
              "Targeting highly attainability candidates minimizes recruiter outreach cycles."
            ]}
            kpis={[
              { label: "Highly Reachable %", value: activePct },
              { label: "Mean Multiplier Boost", value: avgAvail }
            ]}
            chart={
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={availBins} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="bin" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} />
                  <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                  <Tooltip content={<DarkTooltip />} cursor={CURSOR_FILL} />
                  <Bar
                    dataKey="count"
                    name="Candidates"
                    fill="var(--support)"
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={animate}
                  />
                </BarChart>
              </ResponsiveContainer>
            }
            insightSummary="Histogram of availability multiplier distribution. Sourced by hiring signals."
          />
        </div>
      )}
    </motion.main>
  );
}
