/** Score color bands from the design brief: green > 0.8, yellow 0.6–0.8,
 *  orange < 0.6 (status colors only — never decorative).
 *  Adjusted for dark OLED backgrounds. */
export function scoreColor(score) {
  if (score > 0.8) return 'bg-emerald-500';
  if (score >= 0.6) return 'bg-yellow-500';
  return 'bg-orange-500';
}

export function scoreTextColor(score) {
  if (score > 0.8) return 'text-emerald-400';
  if (score >= 0.6) return 'text-yellow-400';
  return 'text-orange-400';
}

const MAX_SCORE = 1.1; // composites top out around 1.07 (1.25 availability cap)

export const scoreWidthPct = (score) =>
  `${Math.min(100, Math.max(2, (score / MAX_SCORE) * 100))}%`;

export const fmtScore = (s) =>
  s === null || s === undefined ? '--' : Number(s).toFixed(4);

/** "--" for absent data: null, empty, or the -1 numeric sentinel. */
export function v(value, suffix = '') {
  if (value === null || value === undefined || value === '') return '--';
  if (typeof value === 'number' && value < 0) return '--';
  return `${value}${suffix}`;
}

export function truncate(text, n = 80) {
  if (!text) return '';
  return text.length <= n ? text : `${text.slice(0, n - 1)}…`;
}

export function timeAgo(isoString) {
  if (!isoString) return 'never';
  const s = Math.max(0, (Date.now() - new Date(isoString).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Same bucketing as the backend's /api/metrics. */
export function locationBucket(row) {
  const loc = (row.location || '').toLowerCase();
  const country = (row.country || '').toLowerCase();
  if (loc.includes('pune')) return 'Pune';
  if (loc.includes('noida')) return 'Noida';
  if (country === 'india') return 'Other India';
  return 'International';
}

/** Stacked sparkbar palette — blue data ramp + amber for assessment.
 *  Lightened for the dark theme: every swatch reads ≥3:1 against surface
 *  (#0A0F1A); the old #1E40AF primary vanished on dark backgrounds. */
export const PART_COLORS = {
  semantic: '#93C5FD',
  career: '#60A5FA',
  skill: '#3B82F6',
  experience: '#818CF8',
  assessment: '#FBBF24',
};

export const PART_LABELS = {
  semantic: 'Semantic',
  career: 'Career',
  skill: 'Skill',
  experience: 'Experience',
  assessment: 'Assessment',
  trajectory: 'Trajectory',
  consistency: 'Consistency',
  anchor_penalty: 'Anchor penalty',
};
