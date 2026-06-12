/** Client-side what-if re-weighting. parts arrive weight-applied from
 *  scorer.py, so raw component values are recovered by dividing out the
 *  official weights, then re-blended with the user's weights (normalized
 *  to sum 1). Adjustments and the availability multiplier are reapplied
 *  exactly as in the composite formula. Honeypot/DQ multipliers are 1 for
 *  everything in the top 100 by construction (L6 guarantees it). */

export const DEFAULT_WEIGHTS = {
  semantic: 0.25,
  career: 0.3,
  skill: 0.2,
  experience: 0.1,
  assessment: 0.15,
};

export const isAdjusted = (w) =>
  Object.keys(DEFAULT_WEIGHTS).some((k) => Math.abs(w[k] - DEFAULT_WEIGHTS[k]) > 1e-9);

export function applyWeights(candidates, weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const scored = candidates.map((c) => {
    const p = c.parts ?? {};
    let base = 0;
    for (const k of Object.keys(DEFAULT_WEIGHTS)) {
      const raw = (p[k] ?? 0) / DEFAULT_WEIGHTS[k];
      base += (weights[k] / total) * raw;
    }
    base += (p.trajectory ?? 0) + (p.consistency ?? 0) + (p.anchor_penalty ?? 0);
    base = Math.max(0, Math.min(1, base));
    const avail = c.availability_multiplier ?? 1;
    return { ...c, score: Math.round(base * avail * 1e4) / 1e4 };
  });
  scored.sort(
    (a, b) => b.score - a.score || (a.candidate_id < b.candidate_id ? -1 : 1)
  );
  return scored.map((c, i) => ({ ...c, movement: c.rank - (i + 1), rank: i + 1 }));
}
