/** Pure client-side derivations over the /api/results candidates array —
 *  the analytics page computes everything from data already in memory
 *  (no extra backend endpoints). */

const round4 = (x) => Math.round(x * 1e4) / 1e4;

/** Histogram of final scores in fixed-width bins. */
export function binScores(candidates, width = 0.025) {
  if (!candidates.length) return [];
  const scores = candidates.map((c) => c.score);
  const lo = Math.floor(Math.min(...scores) / width) * width;
  const hi = Math.max(...scores);
  const n = Math.max(1, Math.ceil((hi - lo) / width + 1e-9));
  const bins = Array.from({ length: n }, (_, i) => ({
    bin: (lo + (i + 0.5) * width).toFixed(2),
    count: 0,
  }));
  for (const s of scores) {
    const i = Math.min(n - 1, Math.floor((s - lo) / width));
    bins[i].count += 1;
  }
  return bins;
}

const MAIN_PARTS = ['semantic', 'career', 'skill', 'experience', 'assessment'];

/** Mean weighted part contributions per rank cohort, plus the net
 *  trajectory/consistency/anchor adjustment. */
export function partMeansByCohort(candidates) {
  const cohorts = [
    { cohort: 'Top 10', test: (c) => c.rank <= 10 },
    { cohort: '11–50', test: (c) => c.rank > 10 && c.rank <= 50 },
    { cohort: '51–100', test: (c) => c.rank > 50 },
  ];
  return cohorts.map(({ cohort, test }) => {
    const rows = candidates.filter(test);
    const mean = (fn) =>
      rows.length ? round4(rows.reduce((a, c) => a + fn(c), 0) / rows.length) : 0;
    const out = { cohort };
    for (const p of MAIN_PARTS) out[p] = mean((c) => c.parts?.[p] ?? 0);
    out.adjustments = mean(
      (c) =>
        (c.parts?.trajectory ?? 0) +
        (c.parts?.consistency ?? 0) +
        (c.parts?.anchor_penalty ?? 0)
    );
    return out;
  });
}

/** Histogram of availability multipliers (scorer clamps to [0.10, 1.25]). */
export function availabilityBins(candidates, width = 0.05) {
  const values = candidates
    .map((c) => c.availability_multiplier)
    .filter((x) => typeof x === 'number');
  if (!values.length) return [];
  const lo = Math.floor(Math.min(...values) / width) * width;
  const n = Math.max(1, Math.ceil((1.25 - lo) / width + 1e-9));
  const bins = Array.from({ length: n }, (_, i) => ({
    bin: (lo + (i + 0.5) * width).toFixed(2),
    mid: lo + (i + 0.5) * width,
    count: 0,
  }));
  for (const x of values) {
    const i = Math.min(n - 1, Math.floor((x - lo) / width));
    bins[i].count += 1;
  }
  return bins;
}

/** Score vs rank curve, 1..100. */
export function scoreByRank(candidates) {
  return [...candidates]
    .sort((a, b) => a.rank - b.rank)
    .map((c) => ({ rank: c.rank, score: c.score }));
}

/** How often each matched JD skill appears across the cohort (top N). */
export function skillCoverage(candidates, key = 'matched_required_skills', top = 10) {
  const counts = new Map();
  for (const c of candidates)
    for (const s of c[key] ?? []) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.entries()]
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count || (a.skill < b.skill ? -1 : 1))
    .slice(0, top);
}

/** Groups candidates by Years of Experience (YoE) ranges and computes average composite score and count. */
export function binExperience(candidates) {
  const ranges = [
    { label: '0–3 YOE', test: (y) => y < 3, count: 0, sumScore: 0 },
    { label: '3–6 YOE', test: (y) => y >= 3 && y < 6, count: 0, sumScore: 0 },
    { label: '6–9 YOE', test: (y) => y >= 6 && y < 9, count: 0, sumScore: 0 },
    { label: '9–12 YOE', test: (y) => y >= 9 && y < 12, count: 0, sumScore: 0 },
    { label: '12+ YOE', test: (y) => y >= 12, count: 0, sumScore: 0 },
  ];

  for (const c of candidates) {
    const y = Number(c.yoe || 0);
    for (const r of ranges) {
      if (r.test(y)) {
        r.count += 1;
        r.sumScore += (c.score || 0);
        break;
      }
    }
  }

  return ranges.map((r) => ({
    range: r.label,
    count: r.count,
    averageScore: r.count > 0 ? Number((r.sumScore / r.count).toFixed(4)) : 0,
  }));
}
