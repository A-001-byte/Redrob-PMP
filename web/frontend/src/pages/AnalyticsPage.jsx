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
import ChartCard, { AXIS_TICK, CURSOR_FILL, DarkTooltip, GRID_STROKE } from '../components/charts/ChartCard.jsx';
import { pageEnter } from '../components/motion/presets.js';
import { useData } from '../context/DataContext.jsx';
import {
  availabilityBins,
  binScores,
  partMeansByCohort,
  scoreByRank,
  skillCoverage,
} from '../utils/analytics.js';
import { PART_COLORS, PART_LABELS } from '../utils/formatters.js';

const PIE_COLORS = ['#60A5FA', '#3B82F6', '#818CF8', '#FBBF24'];

function Empty() {
  return (
    <div className="flex h-[280px] items-center justify-center text-sm text-slate-500">
      No submission yet — run Re-rank first.
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
  const locations = useMemo(
    () =>
      Object.entries(metrics?.location_distribution ?? {}).map(([name, value]) => ({
        name,
        value,
      })),
    [metrics]
  );

  const empty = candidates.length === 0;

  return (
    <motion.main {...pageEnter} className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">
          Computed live from the current top-100 — every chart re-derives after a re-rank.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard
          title="Score distribution"
          insight="Final composite scores of the top 100, binned at 0.025."
        >
          {empty ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={scoreBins} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#60A5FA" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity={0.7} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="bin" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} />
                <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <Tooltip content={<DarkTooltip />} cursor={CURSOR_FILL} />
                <Bar
                  dataKey="count"
                  name="Candidates"
                  fill="url(#scoreFill)"
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={animate}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="What drives each cohort"
          insight="Mean weighted score contribution per part, by rank cohort."
        >
          {empty ? (
            <Empty />
          ) : (
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
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: '"Fira Sans", sans-serif' }} />
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
                  fill="#34D399"
                  isAnimationActive={animate}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Location mix"
          insight="JD location fit favors Pune/Noida; the funnel still surfaces talent everywhere."
        >
          {locations.every((l) => !l.value) ? (
            <Empty />
          ) : (
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
          )}
        </ChartCard>

        <ChartCard
          title="Availability multiplier"
          insight="Fit and attainability are separate axes — the multiplier scales base score by hiring signals."
        >
          {empty ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={availBins} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="bin" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} />
                <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <Tooltip content={<DarkTooltip />} cursor={CURSOR_FILL} />
                <Bar
                  dataKey="count"
                  name="Candidates"
                  fill="#FBBF24"
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={animate}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="JD required-skill coverage"
        insight="How often each required-skill match appears across the top 100 — the cohort's collective evidence for the JD's core stack."
      >
        {coverage.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, coverage.length * 32)}>
            <BarChart data={coverage} layout="vertical" margin={{ top: 4, right: 24, left: 32, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} />
              <YAxis
                type="category"
                dataKey="skill"
                width={140}
                tick={{ ...AXIS_TICK, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<DarkTooltip />} cursor={CURSOR_FILL} />
              <Bar
                dataKey="count"
                name="Candidates with match"
                fill="#3B82F6"
                radius={[0, 3, 3, 0]}
                isAnimationActive={animate}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard
        title="Score by rank"
        insight="The monotone-score curve across the full top 100, with cohort means."
      >
        {empty ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={rankCurve} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="rankFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#60A5FA" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#60A5FA" stopOpacity={0} />
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
                cursor={{ stroke: '#60A5FA', strokeOpacity: 0.3 }}
              />
              {metrics?.mean_score_top10 && (
                <ReferenceLine
                  x={10}
                  stroke="#34D399"
                  strokeDasharray="4 4"
                  label={{
                    value: `top-10 mean ${metrics.mean_score_top10}`,
                    fill: '#34D399',
                    fontSize: 10,
                    position: 'insideTopRight',
                  }}
                />
              )}
              {metrics?.mean_score_top50 && (
                <ReferenceLine
                  x={50}
                  stroke="#94A3B8"
                  strokeDasharray="4 4"
                  label={{
                    value: `top-50 mean ${metrics.mean_score_top50}`,
                    fill: '#94A3B8',
                    fontSize: 10,
                    position: 'insideTopRight',
                  }}
                />
              )}
              <Area
                type="monotone"
                dataKey="score"
                name="Score"
                stroke="#60A5FA"
                strokeWidth={2}
                fill="url(#rankFill)"
                isAnimationActive={animate}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </motion.main>
  );
}
