import { useEffect, useState } from 'react';
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
} from 'recharts';
import { TrendingUp, Users, Zap, MapPin } from 'lucide-react';
import ChartCard, { AXIS_TICK, CURSOR_FILL, DarkTooltip, GRID_STROKE } from '../components/charts/ChartCard.jsx';
import { pageEnter } from '../components/motion/presets.js';
import { getTalentMarket } from '../utils/api.js';

// ── stat card ──────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = 'text-secondary' }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-5 py-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className={`mt-1 font-heading text-2xl font-semibold ${color}`}>
            {value}
          </p>
          {sub && <p className="mt-0.5 text-xs text-slate-600">{sub}</p>}
        </div>
        <Icon className="h-5 w-5 text-slate-600" aria-hidden="true" />
      </div>
    </div>
  );
}

// ── location table ──────────────────────────────────────────────────────────
function LocationTable({ rows }) {
  if (!rows?.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-slate-500">
            <th className="pb-2 font-medium">Location</th>
            <th className="pb-2 pr-4 text-right font-medium">Qualified</th>
            <th className="pb-2 pr-4 text-right font-medium">Mean YoE</th>
            <th className="pb-2 pr-4 text-right font-medium">Open to work</th>
            <th className="pb-2 text-right font-medium">Active 30d</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.location} className="border-b border-border/50 last:border-0">
              <td className="py-2 font-medium text-foreground">{r.location}</td>
              <td className="py-2 pr-4 text-right text-slate-300">
                {r.count.toLocaleString()}
              </td>
              <td className="py-2 pr-4 text-right text-slate-400">
                {r.mean_yoe != null ? `${r.mean_yoe} yrs` : '—'}
              </td>
              <td className="py-2 pr-4 text-right text-slate-400">
                {r.open_to_work_pct}%
              </td>
              <td className="py-2 text-right text-slate-400">
                {r.active_30d_pct}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── availability bar row ───────────────────────────────────────────────────
function AvailRow({ label, pct, count, color }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-heading text-slate-300">
          {pct}% <span className="text-slate-600">({count.toLocaleString()})</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-sm bg-muted">
        <div
          className={`h-full rounded-sm ${color}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

// ── page ───────────────────────────────────────────────────────────────────
const STACK_COLORS = ['#1e3a5f', '#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE'];

export default function TalentMarketPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const animate = !useReducedMotion();

  useEffect(() => {
    getTalentMarket()
      .then(setData)
      .catch((e) => setError(String(e.message || e)));
  }, []);

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
          <div key={i} className="h-48 animate-pulse rounded-lg border border-border bg-muted" />
        ))}
      </motion.main>
    );
  }

  const { pool, availability, skill_supply, stack_depth, location_depth, yoe_distribution } = data;

  return (
    <motion.main {...pageEnter} className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          Talent Market
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Supply-side intelligence over the full {pool.total.toLocaleString()}-candidate corpus —
          scoped to the {pool.qualified.toLocaleString()}-candidate qualified pool
          (≥1 matched required skill, no fraud flags).
        </p>
      </div>

      {/* stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="Qualified pool"
          value={pool.qualified.toLocaleString()}
          sub={`${pool.qualified_pct}% of ${pool.total.toLocaleString()} total`}
          color="text-secondary"
        />
        <StatCard
          icon={Zap}
          label="Open to work"
          value={`${availability.open_to_work_pct}%`}
          sub={`${availability.open_to_work.toLocaleString()} candidates`}
          color="text-emerald-400"
        />
        <StatCard
          icon={TrendingUp}
          label="Short notice (≤ 30d)"
          value={`${availability.short_notice_pct}%`}
          sub={`${availability.short_notice_30d.toLocaleString()} candidates`}
          color="text-amber-400"
        />
        <StatCard
          icon={MapPin}
          label="Active last 30d"
          value={`${availability.active_30d_pct}%`}
          sub={`${availability.active_30d.toLocaleString()} candidates`}
          color="text-blue-400"
        />
      </div>

      {/* charts row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Required-skill supply"
          insight="How many qualified candidates evidence each JD required skill."
        >
          <ResponsiveContainer width="100%" height={Math.max(220, skill_supply.length * 28)}>
            <BarChart
              data={skill_supply}
              layout="vertical"
              margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
            >
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: GRID_STROKE }}
              />
              <YAxis
                type="category"
                dataKey="skill"
                width={148}
                tick={{ ...AXIS_TICK, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<DarkTooltip />} cursor={CURSOR_FILL} />
              <Bar
                dataKey="count"
                name="Candidates"
                fill="#3B82F6"
                radius={[0, 3, 3, 0]}
                isAnimationActive={animate}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Stack depth"
          insight="Distribution of how many required skills each qualified candidate matches — deeper stacks mean rarer supply."
        >
          <ResponsiveContainer width="100%" height={220}>
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
                label={{ value: 'matched skills', fill: '#475569', fontSize: 10, dy: 14 }}
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
                radius={[3, 3, 0, 0]}
                isAnimationActive={animate}
              >
                {stack_depth.map((entry, i) => (
                  <Cell
                    key={entry.skills}
                    fill={STACK_COLORS[Math.min(i, STACK_COLORS.length - 1)]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-2 text-xs text-slate-600">
            Candidates matching all {stack_depth[stack_depth.length - 1]?.skills ?? '?'} required
            skills:{' '}
            <span className="text-slate-400">
              {(
                stack_depth.find(
                  (r) => r.skills === stack_depth[stack_depth.length - 1]?.skills
                )?.count ?? 0
              ).toLocaleString()}
            </span>{' '}
            in the qualified pool.
          </p>
        </ChartCard>
      </div>

      {/* YoE + availability */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Experience distribution"
          insight="Years-of-experience histogram across the qualified pool — shows where the depth sits."
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={yoe_distribution}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
            >
              <defs>
                <linearGradient id="yoeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818CF8" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#4F46E5" stopOpacity={0.7} />
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
                fill="url(#yoeFill)"
                radius={[3, 3, 0, 0]}
                isAnimationActive={animate}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Availability signals"
          insight="Hiring-readiness signals in the qualified pool — each bar is a % of the qualified total."
        >
          <div className="space-y-4 py-2">
            <AvailRow
              label="Open to work (self-declared)"
              pct={availability.open_to_work_pct}
              count={availability.open_to_work}
              color="bg-emerald-500"
            />
            <AvailRow
              label="Short notice (≤ 30 days)"
              pct={availability.short_notice_pct}
              count={availability.short_notice_30d}
              color="bg-amber-500"
            />
            <AvailRow
              label="Active in last 30 days"
              pct={availability.active_30d_pct}
              count={availability.active_30d}
              color="bg-blue-500"
            />
            <AvailRow
              label="High recruiter response rate (≥ 60%)"
              pct={availability.high_response_pct}
              count={availability.high_response_rate}
              color="bg-violet-500"
            />
          </div>
        </ChartCard>
      </div>

      {/* location depth table */}
      <ChartCard
        title="Location depth"
        insight="Qualified-pool size, mean experience, and hiring-readiness signals by geography."
      >
        <LocationTable rows={location_depth} />
      </ChartCard>
    </motion.main>
  );
}
