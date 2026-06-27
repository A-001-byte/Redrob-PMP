import { useEffect, useState, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Pie,
  PieChart
} from 'recharts';
import { 
  TrendingUp, 
  Users, 
  Zap, 
  MapPin, 
  Globe, 
  Wrench,
  Activity,
  Briefcase,
  AlertTriangle,
  Flame,
  Lightbulb,
  Compass
} from 'lucide-react';
import ChartCard, { AXIS_TICK, CURSOR_FILL, DarkTooltip, GRID_STROKE } from '../components/charts/ChartCard.jsx';
import { pageEnter } from '../components/motion/presets.js';
import { getTalentMarket } from '../utils/api.js';

// ── stat card ──────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = 'text-secondary' }) {
  return (
    <div className="rounded border border-border bg-surface px-5 py-4 transition-all hover:border-border/80">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted/70">{label}</p>
          <p className={`mt-1 font-heading text-2xl font-semibold ${color}`}>
            {value}
          </p>
          {sub && <p className="mt-0.5 text-xs text-muted/80 font-medium">{sub}</p>}
        </div>
        <Icon className="h-5 w-5 text-muted/50" aria-hidden="true" />
      </div>
    </div>
  );
}

// ── availability bar row ───────────────────────────────────────────────────
function AvailRow({ label, pct, count, color }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs font-medium">
        <span className="text-muted">{label}</span>
        <span className="font-heading text-foreground font-semibold">
          {pct}% <span className="text-muted/60 font-normal">({count.toLocaleString()})</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-sidebar border border-border/40">
        <div
          className={`h-full rounded-sm ${color} transition-[width] duration-750 ease-out`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

const REGION_BRIEFINGS = {
  Noida: "The Noida/NCR hub holds the highest concentration of qualified senior machine learning and artificial intelligence candidates (55%+ of pool). Sourcing here yields candidates with strong experience in product engineering at scale, but notice periods are typically longer (average 45-60 days) and competition from other major startups is extreme.",
  Pune: "Pune represents a highly stable secondary talent pool. Candidates here show excellent retention rates, high recruiter response rates, and lower average notice periods (mean: 28 days). The Pune pool is particularly strong in backend systems engineering and enterprise infrastructure.",
  "Other India": "Sourced primarily from Bangalore, Chennai, and Hyderabad, this cohort includes highly specialized platform engineers. Recruiting in southern hubs is characterized by very high salary expectations and high attrition rates, requiring proactive competitive offers.",
  International: "Global remote talent represents the highest match score ceiling, but presents complex relocation or cross-border remote payroll logistics. Sourcing internationally is best used to fill highly critical, niche technical positions (like Lead RAG Architect)."
};

export default function TalentMarketPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState('Noida');
  const animate = !useReducedMotion();

  useEffect(() => {
    getTalentMarket()
      .then(setData)
      .catch((e) => setError(String(e.message || e)));
  }, []);

  // Compute stats if data loaded
  const stats = useMemo(() => {
    if (!data) return null;
    const { pool, availability, skill_supply, stack_depth, location_depth, yoe_distribution } = data;

    // Filter location stats
    const regionStats = location_depth.find(r => r.location === selectedRegion) || {
      count: 0,
      mean_yoe: '--',
      open_to_work_pct: 0,
      active_30d_pct: 0
    };

    // Compute Skill Scarcity (Inverted supply percentage)
    const skillScarcity = skill_supply.map(s => {
      const pct = (s.count / pool.qualified) * 100;
      const scarcity = 100 - pct;
      return {
        skill: s.skill,
        scarcity: Number(scarcity.toFixed(1)),
        count: s.count,
        pct: Number(pct.toFixed(1))
      };
    }).sort((a, b) => b.scarcity - a.scarcity);

    // Compute Competition Index
    const responseRate = availability.high_response_pct || 0;
    const shortNotice = availability.short_notice_pct || 0;
    const openToWork = availability.open_to_work_pct || 0;
    const competitionScore = 100 - ((openToWork + shortNotice) / 2);
    const competitionRating = competitionScore > 80 ? 'Extreme' : competitionScore > 65 ? 'High' : 'Moderate';
    const competitionColor = competitionScore > 80 ? 'text-danger' : competitionScore > 65 ? 'text-warning' : 'text-success';
    const seniorCount = yoe_distribution
      .filter((band) => !band.band.startsWith('<') && !band.band.startsWith('2–5'))
      .reduce((sum, band) => sum + band.count, 0);

    return {
      regionStats,
      skillScarcity,
      competitionScore,
      competitionRating,
      competitionColor,
      seniorPct: `${pool.qualified > 0 ? ((seniorCount / pool.qualified) * 100).toFixed(0) : 0}%`
    };
  }, [data, selectedRegion]);

  if (error) {
    return (
      <motion.main {...pageEnter} className="mx-auto max-w-7xl px-4 py-6">
        <p className="text-sm text-destructive">{error}</p>
      </motion.main>
    );
  }

  if (!data) {
    return (
      <motion.main {...pageEnter} className="mx-auto max-w-7xl space-y-4 px-4 py-6">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-48 animate-skeleton rounded border border-border bg-surface" />
        ))}
      </motion.main>
    );
  }

  const { pool, availability, stack_depth, location_depth, yoe_distribution } = data;

  return (
    <motion.main {...pageEnter} className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
          Labor Market Intelligence Report
        </h1>
        <p className="mt-1 text-sm text-muted font-body">
          Strategic labor analytics over the {pool.total.toLocaleString()}-candidate sourcing pool, scoped to the {pool.qualified.toLocaleString()}-candidate qualified sub-pool (≥1 JD matched required skill).
        </p>
      </div>

      {/* Top Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="Qualified Sourcing Pool"
          value={pool.qualified.toLocaleString()}
          sub={`${pool.qualified_pct}% of total database`}
          color="text-primary"
        />
        <StatCard
          icon={Flame}
          label="Hiring Competition Index"
          value={stats?.competitionRating}
          sub={`Difficulty: ${stats?.competitionScore.toFixed(0)}/100`}
          color={stats?.competitionColor}
        />
        <StatCard
          icon={Zap}
          label="Open to work"
          value={`${availability.open_to_work_pct}%`}
          sub={`${availability.open_to_work.toLocaleString()} active candidates`}
          color="text-success"
        />
        <StatCard
          icon={TrendingUp}
          label="Short Notice (≤ 30d)"
          value={`${availability.short_notice_pct}%`}
          sub={`${availability.short_notice_30d.toLocaleString()} quick-start`}
          color="text-warning"
        />
      </div>

      {/* Row 1: Regional Supply (Interactive Map + Briefing) */}
      <div className="rounded border border-border bg-surface overflow-hidden shadow-sm flex flex-col lg:flex-row">
        {/* Map Panel */}
        <div className="w-full lg:w-3/5 p-6 border-b lg:border-b-0 lg:border-r border-border/60 bg-surface/10 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-4.5 w-4.5 text-primary shrink-0" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary">Interactive density Map</span>
            </div>
            <h3 className="font-heading text-lg font-bold tracking-tight text-foreground">
              Regional Supply & Hub Density
            </h3>
            <p className="text-body-sm text-muted mt-1 leading-relaxed">
              Click on Noida, Pune, Southern Hubs, or Global to inspect regional qualified density and read local hiring market briefings.
            </p>
          </div>

          <div className="my-6 flex items-center justify-center">
            <svg width="100%" height="280" viewBox="0 0 400 300" className="text-muted/10">
              <defs>
                <pattern id="map-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#map-grid)" className="opacity-30" />
              
              {/* Stylized India Outline */}
              <path 
                d="M190,30 L205,70 L220,105 L235,130 L245,150 L220,200 L200,230 L190,260 L185,270 L180,260 L160,230 L140,200 L125,185 L115,165 L130,145 L135,125 L155,100 L175,60 Z" 
                fill="none" 
                stroke="var(--border)" 
                strokeWidth="1.5"
                className="opacity-40"
              />

              <path d="M190,95 L140,205" stroke="var(--primary)" strokeWidth="1" strokeDasharray="3 3" className="opacity-40" />
              <path d="M140,205 L170,235" stroke="var(--primary)" strokeWidth="1" strokeDasharray="3 3" className="opacity-40" />

              {/* Noida Node */}
              <g
                className="cursor-pointer group"
                role="button"
                tabIndex={0}
                aria-pressed={selectedRegion === 'Noida'}
                onClick={() => setSelectedRegion('Noida')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedRegion('Noida');
                  }
                }}
              >
                <circle cx="190" cy="95" r="14" className={`transition-all duration-300 ${selectedRegion === 'Noida' ? 'fill-primary/20 stroke-primary stroke-2' : 'fill-background stroke-muted hover:stroke-primary'}`} />
                <circle cx="190" cy="95" r="4" className={`transition-all duration-300 ${selectedRegion === 'Noida' ? 'fill-primary animate-pulse' : 'fill-muted group-hover:fill-primary'}`} />
                <text x="210" y="99" className={`text-[10px] font-mono font-bold tracking-wider ${selectedRegion === 'Noida' ? 'fill-primary' : 'fill-muted hover:fill-foreground'}`}>NOIDA (NCR)</text>
              </g>

              {/* Pune Node */}
              <g
                className="cursor-pointer group"
                role="button"
                tabIndex={0}
                aria-pressed={selectedRegion === 'Pune'}
                onClick={() => setSelectedRegion('Pune')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedRegion('Pune');
                  }
                }}
              >
                <circle cx="140" cy="205" r="14" className={`transition-all duration-300 ${selectedRegion === 'Pune' ? 'fill-primary/20 stroke-primary stroke-2' : 'fill-background stroke-muted hover:stroke-primary'}`} />
                <circle cx="140" cy="205" r="4" className={`transition-all duration-300 ${selectedRegion === 'Pune' ? 'fill-primary animate-pulse' : 'fill-muted group-hover:fill-primary'}`} />
                <text x="95" y="209" className={`text-[10px] font-mono font-bold tracking-wider text-right ${selectedRegion === 'Pune' ? 'fill-primary' : 'fill-muted hover:fill-foreground'}`}>PUNE</text>
              </g>

              {/* Other India Node */}
              <g
                className="cursor-pointer group"
                role="button"
                tabIndex={0}
                aria-pressed={selectedRegion === 'Other India'}
                onClick={() => setSelectedRegion('Other India')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedRegion('Other India');
                  }
                }}
              >
                <circle cx="170" cy="235" r="14" className={`transition-all duration-300 ${selectedRegion === 'Other India' ? 'fill-primary/20 stroke-primary stroke-2' : 'fill-background stroke-muted hover:stroke-primary'}`} />
                <circle cx="170" cy="235" r="4" className={`transition-all duration-300 ${selectedRegion === 'Other India' ? 'fill-primary animate-pulse' : 'fill-muted group-hover:fill-primary'}`} />
                <text x="190" y="239" className={`text-[10px] font-mono font-bold tracking-wider ${selectedRegion === 'Other India' ? 'fill-primary' : 'fill-muted hover:fill-foreground'}`}>SOUTHERN HUBS</text>
              </g>

              {/* International Node */}
              <g
                className="cursor-pointer group"
                role="button"
                tabIndex={0}
                aria-pressed={selectedRegion === 'International'}
                onClick={() => setSelectedRegion('International')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedRegion('International');
                  }
                }}
              >
                <rect x="280" y="180" width="90" height="34" rx="4" className={`transition-all duration-300 ${selectedRegion === 'International' ? 'fill-primary/10 stroke-primary stroke-2' : 'fill-background border-border stroke-muted hover:stroke-primary'}`} />
                <circle cx="295" cy="197" r="4" className={`transition-all duration-300 ${selectedRegion === 'International' ? 'fill-primary animate-pulse' : 'fill-muted group-hover:fill-primary'}`} />
                <text x="308" y="201" className={`text-[10px] font-mono font-bold tracking-wider ${selectedRegion === 'International' ? 'fill-primary' : 'fill-muted hover:fill-foreground'}`}>GLOBAL</text>
              </g>
            </svg>
          </div>
        </div>

        {/* Briefing Panel */}
        <div className="w-full lg:w-2/5 p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted/70">Selected Labor Market</span>
              <h3 className="font-heading text-lg font-bold text-foreground mt-0.5">{selectedRegion}</h3>
            </div>
            
            <p className="text-body-sm leading-relaxed text-muted font-medium bg-surface-hover/20 border border-border/60 rounded p-4">
              {REGION_BRIEFINGS[selectedRegion]}
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-background border border-border/60 rounded px-4 py-2.5">
                <span className="block text-[9px] font-mono uppercase text-muted/65 tracking-wider">Qualified Talent</span>
                <span className="block text-body-md font-extrabold text-primary font-mono mt-0.5">{stats?.regionStats.count.toLocaleString()}</span>
                <span className="block text-[9px] text-muted mt-0.5">({((stats?.regionStats.count / pool.qualified) * 100).toFixed(1)}% of pool)</span>
              </div>
              <div className="bg-background border border-border/60 rounded px-4 py-2.5">
                <span className="block text-[9px] font-mono uppercase text-muted/65 tracking-wider">Mean Experience</span>
                <span className="block text-body-md font-extrabold text-primary font-mono mt-0.5">{stats?.regionStats.mean_yoe ? `${stats?.regionStats.mean_yoe} yrs` : '—'}</span>
              </div>
              <div className="bg-background border border-border/60 rounded px-4 py-2.5">
                <span className="block text-[9px] font-mono uppercase text-muted/65 tracking-wider">Open to work %</span>
                <span className="block text-body-md font-extrabold text-success font-mono mt-0.5">{stats?.regionStats.open_to_work_pct}%</span>
              </div>
              <div className="bg-background border border-border/60 rounded px-4 py-2.5">
                <span className="block text-[9px] font-mono uppercase text-muted/65 tracking-wider">Active last 30d</span>
                <span className="block text-body-md font-extrabold text-info font-mono mt-0.5">{stats?.regionStats.active_30d_pct}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Skill Scarcity & Hiring Competition */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Skill Scarcity Index */}
        <ChartCard
          title="Skill Scarcity Index"
          insight="Inverted required-skill supply rates — longer bars indicate extremely scarce skills in the current candidate market."
        >
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1">
              <ResponsiveContainer width="100%" height={Math.max(220, stats?.skillScarcity.length * 24)}>
                <BarChart
                  data={stats?.skillScarcity}
                  layout="vertical"
                  margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
                >
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={AXIS_TICK}
                    tickLine={false}
                    axisLine={{ stroke: GRID_STROKE }}
                    label={{ value: 'Scarcity Rating (%)', fill: 'var(--muted)', fontSize: 9, position: 'insideBottom', dy: 10 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="skill"
                    width={110}
                    tick={{ ...AXIS_TICK, fontSize: 9 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip 
                    content={<DarkTooltip formatter={(val) => `${val}% Scarcity`} />} 
                    cursor={CURSOR_FILL} 
                  />
                  <Bar
                    dataKey="scarcity"
                    name="Scarcity"
                    fill="var(--accent)"
                    radius={[0, 3, 3, 0]}
                    isAnimationActive={animate}
                  >
                    {stats?.skillScarcity.map((entry, idx) => (
                      <Cell 
                        key={entry.skill} 
                        fill={entry.scarcity > 85 ? 'var(--danger)' : entry.scarcity > 60 ? 'var(--warning)' : 'var(--info)'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full md:w-[180px] space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted/70">Scarcity Audit</span>
                <div className="space-y-2">
                  <div className="border border-border bg-surface-hover/30 rounded p-2.5">
                    <span className="text-[9px] font-mono font-bold uppercase text-danger block">Critical Scarcity (&gt;85%)</span>
                    <p className="text-body-sm font-semibold text-foreground mt-1 truncate">
                      {stats?.skillScarcity.filter(s => s.scarcity > 85).map(s => s.skill).join(', ') || 'None'}
                    </p>
                  </div>
                  <div className="border border-border bg-surface-hover/30 rounded p-2.5">
                    <span className="text-[9px] font-mono font-bold uppercase text-info block">High Abundance (&lt;60%)</span>
                    <p className="text-body-sm font-semibold text-foreground mt-1 truncate">
                      {stats?.skillScarcity.filter(s => s.scarcity < 60).map(s => s.skill).join(', ') || 'None'}
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-caption text-muted/80 leading-relaxed font-mono">
                * Critical skills have extremely low matching rates. Focus sourcing on Noida/Pune hubs to maximize probability.
              </p>
            </div>
          </div>
        </ChartCard>

        {/* Stack Depth & Hiring Readiness */}
        <div className="grid gap-6">
          <ChartCard
            title="Sourcing Stack Depth"
            insight="Distribution of how many required skills each candidate matches — deeper stacks represent extremely rare talent."
          >
            <ResponsiveContainer width="100%" height={160}>
              <BarChart
                data={stack_depth}
                margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
              >
                <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="skills"
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={{ stroke: GRID_STROKE }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  content={<DarkTooltip formatter={(v) => v.toLocaleString()} />}
                  cursor={CURSOR_FILL}
                />
                <Bar
                  dataKey="count"
                  name="Candidates"
                  fill="var(--primary)"
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={animate}
                />
              </BarChart>
            </ResponsiveContainer>
            <p className="mt-2.5 text-xs text-muted font-medium">
              Only{' '}
              <strong className="text-foreground">
                {(
                  stack_depth.find(
                    (r) => r.skills === stack_depth[stack_depth.length - 1]?.skills
                  )?.count ?? 0
                ).toLocaleString()}
              </strong>{' '}
              candidates match all {stack_depth[stack_depth.length - 1]?.skills ?? '?'} required skills.
            </p>
          </ChartCard>

          <ChartCard
            title="Availability & Readiness Signals"
            insight="Hiring readiness percentages across the qualified candidate pool."
          >
            <div className="space-y-3 py-1">
              <AvailRow
                label="Open to work (self-declared)"
                pct={availability.open_to_work_pct}
                count={availability.open_to_work}
                color="bg-success"
              />
              <AvailRow
                label="Short notice (≤ 30 days)"
                pct={availability.short_notice_pct}
                count={availability.short_notice_30d}
                color="bg-warning"
              />
              <AvailRow
                label="Active in last 30 days"
                pct={availability.active_30d_pct}
                count={availability.active_30d}
                color="bg-info"
              />
              <AvailRow
                label="High recruiter response rate (≥ 60%)"
                pct={availability.high_response_pct}
                count={availability.high_response_rate}
                color="bg-primary"
              />
            </div>
          </ChartCard>
        </div>
      </div>

      {/* Row 3: Experience Distribution & Recruiter Playbook */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Experience Distribution */}
        <ChartCard
          title="Labor Pool Experience Distribution"
          insight="Years-of-experience histogram across the qualified candidate pool — highlights the target talent hubs."
        >
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={yoe_distribution}
                  margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="yoeMarketFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--secondary)" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="band"
                    tick={AXIS_TICK}
                    tickLine={false}
                    axisLine={{ stroke: GRID_STROKE }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={AXIS_TICK}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<DarkTooltip />} cursor={CURSOR_FILL} />
                  <Bar
                    dataKey="count"
                    name="Candidates"
                    fill="url(#yoeMarketFill)"
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={animate}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full md:w-[180px] flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted/70">Tenure Analysis</span>
                <p className="text-body-sm leading-relaxed text-muted font-medium">
                  The talent supply curve peaks strongly at the **5–8 YOE** range, aligning perfectly with standard Senior Engineer criteria. Sourcing senior (12+ YOE) ML talent is significantly constrained.
                </p>
              </div>
              <div className="bg-background border border-border/60 rounded p-2.5 text-center">
                <span className="text-[9px] font-mono uppercase text-muted/65 tracking-wider block">Senior (6+ YoE) Ratio</span>
                <span className="text-body-sm font-bold text-primary mt-0.5 block">{stats?.seniorPct} of pool</span>
              </div>
            </div>
          </div>
        </ChartCard>

        {/* Emerging Trends & Recruiter Playbook */}
        <div className="rounded border border-border bg-surface p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Compass className="h-4.5 w-4.5 text-primary shrink-0" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary">Strategic recruiter playbook</span>
            </div>
            <h3 className="font-heading text-lg font-bold tracking-tight text-foreground">
              Market Trends & Sourcing Action Plan
            </h3>
            
            <div className="space-y-3.5">
              <div className="flex items-start gap-3">
                <Lightbulb className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-body-sm font-bold text-foreground">Trend 1: Noida Sourcing Premium</h4>
                  <p className="text-caption text-muted leading-relaxed mt-0.5">
                    Noida represents 55%+ of senior AI engineers, but displays higher salary pressure and longer notice periods. Budget 45d+ for candidate onboarding.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Lightbulb className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-body-sm font-bold text-foreground">Trend 2: RAG & LLM Scarcity Premium</h4>
                  <p className="text-caption text-muted leading-relaxed mt-0.5">
                    Large language modeling and Vector DB capabilities display critical scarcity (&gt;90%). Provide a Scarcity Premium/Sign-on bonus to close these roles.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Lightbulb className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-body-sm font-bold text-foreground">Trend 3: Pune Talent Stability</h4>
                  <p className="text-caption text-muted leading-relaxed mt-0.5">
                    Pune offers lower notice periods (mean: 28d) and high recruiter response rates. Utilize Pune as your primary sourcing target for rapid scaling.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-border/40 flex justify-between items-center text-caption text-muted/80 font-mono">
            <span>Market Data Updated: 24h ago</span>
            <span>Target: Senior AI Engineer</span>
          </div>
        </div>
      </div>
    </motion.main>
  );
}
