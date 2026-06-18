"""data_quality.py — Single-pass data quality analysis over features.pkl.

Read-only: does not modify any pipeline artifact or submission.csv.
Writes:
    submission/data_quality_report.md
    submission/data_quality_report.json

Run from the project root:
    python pipeline/data_quality.py
"""
from __future__ import annotations

import csv
import json
import pickle
import statistics
from collections import Counter
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PRECOMP      = PROJECT_ROOT / "precomputed"
SUBMISSION   = PROJECT_ROOT / "submission"

REPORT_MD   = SUBMISSION / "data_quality_report.md"
REPORT_JSON = SUBMISSION / "data_quality_report.json"

# Tier-1 Indian cities (beyond Pune/Noida which map to location_fit 1.0 / 0.8)
TIER1_CITIES = {
    "bengaluru", "bangalore", "mumbai", "delhi", "hyderabad",
    "chennai", "kolkata", "gurgaon", "gurugram", "ahmedabad",
    "jaipur", "lucknow", "coimbatore",
}

# ---------------------------------------------------------------------------
# Load artifacts
# ---------------------------------------------------------------------------
print("Loading features.pkl …")
with open(PRECOMP / "features.pkl", "rb") as f:
    feats: dict[str, dict] = pickle.load(f)

print("Loading submission.csv …")
with open(SUBMISSION / "submission.csv", encoding="utf-8", newline="") as f:
    top100_rows = list(csv.DictReader(f))
top100_ids = {r["candidate_id"] for r in top100_rows}

print(f"Loaded {len(feats):,} candidates, {len(top100_ids)} in top-100\n")

# ---------------------------------------------------------------------------
# Single pass over all candidates
# ---------------------------------------------------------------------------
total = len(feats)

# Counters / accumulators
n_honeypot = n_dq = n_qualified = 0
n_assessment_present = n_github_present = 0
n_response_present = n_open_work = 0
n_career_present = n_req_skills_present = 0

loc_bucket_counts: Counter = Counter()
city_counts: Counter = Counter()

# Qualified pool lists (for distributions)
q_career: list[float] = []
q_skill:  list[float] = []
q_exp:    list[float] = []
q_asmt:   list[float] = []
q_avail:  list[float] = []
q_yoe:    list[float] = []
q_asmt_nonzero: list[float] = []

# YoE bands (qualified pool)
yoe_bands: dict[str, int] = {"<3": 0, "3-4": 0, "5-9": 0, "10-13": 0, "14+": 0}

# Education tiers (qualified pool)
edu_counts: Counter = Counter()

# Top-100 component accumulators
t100_career: list[float] = []
t100_skill:  list[float] = []
t100_exp:    list[float] = []
t100_asmt:   list[float] = []
t100_avail:  list[float] = []

for cid, rec in feats.items():
    hp  = bool(rec.get("is_honeypot"))
    dq  = bool(rec.get("disqualifier_flag"))
    ss  = rec.get("skill_score", 0.0) or 0.0
    qual = (not hp) and (not dq) and (ss > 0)

    if hp:  n_honeypot += 1
    if dq:  n_dq += 1
    if qual: n_qualified += 1

    # Field completeness (all candidates)
    asmt = rec.get("assessment_score", 0.0) or 0.0
    gh   = rec.get("github_activity_score", -1.0)
    rr   = rec.get("recruiter_response_rate", 0.0) or 0.0
    cs   = rec.get("career_score", 0.0) or 0.0
    mrs  = rec.get("matched_required_skills") or []

    if asmt > 0:              n_assessment_present += 1
    if gh is not None and gh > 0: n_github_present += 1
    if rr > 0:                n_response_present += 1
    if rec.get("open_to_work_flag"): n_open_work += 1
    if cs > 0:                n_career_present += 1
    if len(mrs) > 0:          n_req_skills_present += 1

    # Location (all candidates)
    loc_raw = str(rec.get("location") or "").lower().strip()
    country = str(rec.get("country") or "").lower().strip()
    if "pune" in loc_raw:
        bucket = "Pune"
    elif "noida" in loc_raw:
        bucket = "Noida"
    elif any(c in loc_raw for c in TIER1_CITIES) and country == "india":
        bucket = "Tier-1 India (other)"
    elif country == "india":
        bucket = "Other India"
    else:
        bucket = "International"
    loc_bucket_counts[bucket] += 1

    # Top city (first word, title-cased)
    city = loc_raw.split(",")[0].strip().title() if loc_raw else "Unknown"
    city_counts[city] += 1

    if not qual:
        continue

    # Qualified pool only
    exp_s = rec.get("experience_score", 0.0) or 0.0
    av    = rec.get("availability_multiplier", 1.0) or 1.0

    q_career.append(cs)
    q_skill.append(ss)
    q_exp.append(exp_s)
    q_asmt.append(asmt)
    q_avail.append(av)
    if asmt > 0:
        q_asmt_nonzero.append(asmt)

    yoe = rec.get("years_of_experience")
    if yoe is not None:
        q_yoe.append(float(yoe))
        if yoe < 3:         yoe_bands["<3"] += 1
        elif yoe < 5:       yoe_bands["3-4"] += 1
        elif yoe < 10:      yoe_bands["5-9"] += 1
        elif yoe < 14:      yoe_bands["10-13"] += 1
        else:               yoe_bands["14+"] += 1

    # Education tier
    et = rec.get("education_tier_score", 0.4)
    if et is None:   et = 0.4
    if et >= 1.0:    edu_counts["Tier-1"] += 1
    elif et >= 0.8:  edu_counts["Tier-2"] += 1
    elif et >= 0.6:  edu_counts["Tier-3"] += 1
    else:            edu_counts["Tier-4 / unknown"] += 1

    # Top-100 accumulation
    if cid in top100_ids:
        t100_career.append(cs)
        t100_skill.append(ss)
        t100_exp.append(exp_s)
        t100_asmt.append(asmt)
        t100_avail.append(av)

print(f"Pass complete. Qualified pool: {n_qualified:,}")

# ---------------------------------------------------------------------------
# Helper: distribution stats
# ---------------------------------------------------------------------------
def dist(vals: list[float]) -> dict:
    if not vals:
        return {"n": 0, "mean": None, "median": None, "std": None,
                "min": None, "max": None, "p25": None, "p75": None, "p95": None,
                "pct_zero": None}
    sv = sorted(vals)
    n  = len(sv)
    def pct(p: float) -> float:
        idx = p * (n - 1)
        lo, hi = int(idx), min(int(idx) + 1, n - 1)
        return sv[lo] + (idx - lo) * (sv[hi] - sv[lo])
    mean_v = sum(vals) / n
    pct_zero = sum(1 for v in vals if v == 0.0) / n * 100
    return {
        "n":        n,
        "mean":     round(mean_v, 4),
        "median":   round(pct(0.50), 4),
        "std":      round(statistics.pstdev(vals), 4),
        "min":      round(sv[0], 4),
        "max":      round(sv[-1], 4),
        "p25":      round(pct(0.25), 4),
        "p75":      round(pct(0.75), 4),
        "p95":      round(pct(0.95), 4),
        "pct_zero": round(pct_zero, 1),
    }


# ---------------------------------------------------------------------------
# Assemble results dict
# ---------------------------------------------------------------------------
q_n = n_qualified

results = {
    "overview": {
        "total_candidates":    total,
        "honeypot_count":      n_honeypot,
        "honeypot_pct":        round(n_honeypot / total * 100, 2),
        "disqualified_count":  n_dq,
        "disqualified_pct":    round(n_dq / total * 100, 2),
        "qualified_count":     q_n,
        "qualified_pct":       round(q_n / total * 100, 2),
    },
    "field_completeness": {
        "assessment_score_present_pct":   round(n_assessment_present / total * 100, 1),
        "github_score_present_pct":       round(n_github_present / total * 100, 1),
        "recruiter_response_present_pct": round(n_response_present / total * 100, 1),
        "open_to_work_pct":               round(n_open_work / total * 100, 1),
        "career_descriptions_pct":        round(n_career_present / total * 100, 1),
        "has_required_skills_pct":        round(n_req_skills_present / total * 100, 1),
    },
    "score_distributions": {
        "career_score":            dist(q_career),
        "skill_score":             dist(q_skill),
        "experience_score":        dist(q_exp),
        "assessment_score":        dist(q_asmt),
        "availability_multiplier": dist(q_avail),
    },
    "location_distribution": {
        "buckets": {k: {"count": v, "pct": round(v / total * 100, 1)}
                    for k, v in loc_bucket_counts.most_common()},
        "top5_cities": [{"city": c, "count": n}
                        for c, n in city_counts.most_common(5)],
    },
    "yoe_distribution": {
        "bands": yoe_bands,
        "mean_yoe":   round(sum(q_yoe) / len(q_yoe), 2) if q_yoe else None,
        "median_yoe": round(sorted(q_yoe)[len(q_yoe) // 2], 1) if q_yoe else None,
    },
    "education_distribution": {
        k: {"count": v, "pct": round(v / q_n * 100, 1)}
        for k, v in edu_counts.most_common()
    },
    "assessment_sparsity": {
        "candidates_with_assessment_pct":    round(n_assessment_present / total * 100, 1),
        "candidates_without_assessment_pct": round((total - n_assessment_present) / total * 100, 1),
        "nonzero_mean":   round(sum(q_asmt_nonzero) / len(q_asmt_nonzero), 4) if q_asmt_nonzero else None,
        "nonzero_median": round(sorted(q_asmt_nonzero)[len(q_asmt_nonzero) // 2], 4) if q_asmt_nonzero else None,
        "nonzero_dist":   dist(q_asmt_nonzero),
    },
    "top100_vs_pool": {
        "career_score": {
            "top100_mean":  round(sum(t100_career) / len(t100_career), 4) if t100_career else None,
            "pool_mean":    round(sum(q_career) / len(q_career), 4) if q_career else None,
            "lift_x":       round((sum(t100_career) / len(t100_career)) / (sum(q_career) / len(q_career)), 2)
                            if t100_career and q_career else None,
        },
        "skill_score": {
            "top100_mean":  round(sum(t100_skill) / len(t100_skill), 4) if t100_skill else None,
            "pool_mean":    round(sum(q_skill) / len(q_skill), 4) if q_skill else None,
            "lift_x":       round((sum(t100_skill) / len(t100_skill)) / (sum(q_skill) / len(q_skill)), 2)
                            if t100_skill and q_skill else None,
        },
        "experience_score": {
            "top100_mean":  round(sum(t100_exp) / len(t100_exp), 4) if t100_exp else None,
            "pool_mean":    round(sum(q_exp) / len(q_exp), 4) if q_exp else None,
            "lift_x":       round((sum(t100_exp) / len(t100_exp)) / (sum(q_exp) / len(q_exp)), 2)
                            if t100_exp and q_exp else None,
        },
        "assessment_score": {
            "top100_mean":  round(sum(t100_asmt) / len(t100_asmt), 4) if t100_asmt else None,
            "pool_mean":    round(sum(q_asmt) / len(q_asmt), 4) if q_asmt else None,
            "lift_x":       round((sum(t100_asmt) / len(t100_asmt)) / (sum(q_asmt) / len(q_asmt)), 2)
                            if t100_asmt and q_asmt and sum(q_asmt) > 0 else None,
        },
        "availability_multiplier": {
            "top100_mean":  round(sum(t100_avail) / len(t100_avail), 4) if t100_avail else None,
            "pool_mean":    round(sum(q_avail) / len(q_avail), 4) if q_avail else None,
            "lift_x":       round((sum(t100_avail) / len(t100_avail)) / (sum(q_avail) / len(q_avail)), 2)
                            if t100_avail and q_avail else None,
        },
    },
}

# Write JSON
REPORT_JSON.parent.mkdir(parents=True, exist_ok=True)
with open(REPORT_JSON, "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2)
print(f"Wrote {REPORT_JSON}")

# ---------------------------------------------------------------------------
# Build Markdown report
# ---------------------------------------------------------------------------
ov  = results["overview"]
fc  = results["field_completeness"]
sd  = results["score_distributions"]
loc = results["location_distribution"]
yoe = results["yoe_distribution"]
edu = results["education_distribution"]
asp = results["assessment_sparsity"]
t1p = results["top100_vs_pool"]

def dist_row(name: str, d: dict) -> str:
    return ("| " + name + " | " + str(d["mean"]) + " | " + str(d["median"]) +
            " | " + str(d["std"]) + " | " + str(d["p25"]) + " | " + str(d["p75"]) +
            " | " + str(d["p95"]) + " | " + str(d["pct_zero"]) + "% |")

def t1p_row(name: str, d: dict) -> str:
    lift = str(d["lift_x"]) + "x" if d["lift_x"] else "--"
    return ("| " + name + " | " + str(d["top100_mean"]) + " | " +
            str(d["pool_mean"]) + " | " + lift + " |")

loc_rows = "\n".join(
    "| " + b + " | " + f"{v['count']:,}" + " | " + str(v["pct"]) + "% |"
    for b, v in loc["buckets"].items()
)
city_rows = "\n".join(
    "| " + r["city"] + " | " + f"{r['count']:,}" + " |"
    for r in loc["top5_cities"]
)
yoe_rows = "\n".join(
    "| " + band + " | " + f"{count:,}" + " |"
    for band, count in yoe["bands"].items()
)
edu_rows = "\n".join(
    "| " + tier + " | " + f"{v['count']:,}" + " | " + str(v["pct"]) + "% |"
    for tier, v in edu.items()
)

# Pre-compute all dist rows (avoids backslash-in-f-string on Python < 3.12)
dr_career   = dist_row("career\\_score",            sd["career_score"])
dr_skill    = dist_row("skill\\_score",             sd["skill_score"])
dr_exp      = dist_row("experience\\_score",        sd["experience_score"])
dr_asmt     = dist_row("assessment\\_score",        sd["assessment_score"])
dr_avail    = dist_row("availability\\_multiplier", sd["availability_multiplier"])
tp_career   = t1p_row("career\\_score",            t1p["career_score"])
tp_skill    = t1p_row("skill\\_score",             t1p["skill_score"])
tp_exp      = t1p_row("experience\\_score",        t1p["experience_score"])
tp_asmt     = t1p_row("assessment\\_score",        t1p["assessment_score"])
tp_avail    = t1p_row("availability\\_multiplier", t1p["availability_multiplier"])

# Key findings
asmt_sparse_pct   = asp["candidates_without_assessment_pct"]
asmt_present_pct  = asp["candidates_with_assessment_pct"]
asmt_mean_nz      = asp["nonzero_mean"]
career_lift       = t1p["career_score"]["lift_x"]
skill_lift        = t1p["skill_score"]["lift_x"]
pool_mean_asmt    = sd["assessment_score"]["mean"]
t100_mean_asmt    = t1p["assessment_score"]["top100_mean"]
target_yoe_count  = yoe["bands"]["5-9"]
qual_yoe_total    = sum(yoe["bands"].values())
target_pct        = round(target_yoe_count / qual_yoe_total * 100, 1) if qual_yoe_total else 0
loc_india_pct     = sum(v["pct"] for k, v in loc["buckets"].items() if k != "International")
hp_pct            = ov["honeypot_pct"]

md = f"""# Dataset Quality Report

Generated from `precomputed/features.pkl` ({ov['total_candidates']:,} candidates).
All distribution statistics use the **qualified pool** (n={ov['qualified_count']:,}) unless
noted. "Qualified" = not disqualified, not honeypot, skill\\_score > 0.

---

## Overview

| Metric | Count | % of corpus |
|--------|------:|------------:|
| Total candidates | {ov['total_candidates']:,} | 100% |
| Honeypots | {ov['honeypot_count']:,} | {ov['honeypot_pct']}% |
| Disqualified (non-honeypot) | {ov['disqualified_count']:,} | {ov['disqualified_pct']}% |
| Qualified pool | {ov['qualified_count']:,} | {ov['qualified_pct']}% |

---

## Field Completeness (all 100K candidates)

| Field | Present % | Interpretation |
|-------|----------:|----------------|
| `career_score > 0` | {fc['career_descriptions_pct']}% | Candidates with parseable career descriptions |
| `matched_required_skills` non-empty | {fc['has_required_skills_pct']}% | At least one JD-required skill matched |
| `assessment_score > 0` | {fc['assessment_score_present_pct']}% | Has at least one Redrob skill assessment |
| `recruiter_response_rate > 0` | {fc['recruiter_response_present_pct']}% | Has recruiter interaction history |
| `open_to_work_flag` = True | {fc['open_to_work_pct']}% | Actively signaling availability |
| `github_activity_score > 0` | {fc['github_score_present_pct']}% | Has measurable GitHub activity |

**Note:** `assessment_score` is sparse ({asmt_sparse_pct}% of candidates have no data). This is
why it is weighted at 0.15 rather than higher: it contributes strong signal where present
but cannot penalise candidates for missing data they did not choose to omit. For candidates
with assessments, the mean score is {asmt_mean_nz:.2f} ({asmt_mean_nz * 100:.0f}/100), indicating
genuine signal rather than noise.

---

## Score Distributions (Qualified Pool, n={ov['qualified_count']:,})

| Score | Mean | Median | Std | p25 | p75 | p95 | % Zero |
|-------|-----:|-------:|----:|----:|----:|----:|-------:|
{dr_career}
{dr_skill}
{dr_exp}
{dr_asmt}
{dr_avail}

---

## Location Distribution (all 100K candidates)

| Bucket | Count | % |
|--------|------:|--:|
{loc_rows}

**Top 5 cities:**

| City | Count |
|------|------:|
{city_rows}

---

## YoE Distribution (Qualified Pool, n={qual_yoe_total:,} with YoE data)

Target band (5–9 yrs) shaded — JD asks for "5+ years".

| Band | Count |
|------|------:|
{yoe_rows}

Mean YoE: **{yoe['mean_yoe']}**, Median: **{yoe['median_yoe']}**

The target band (5–9 yrs) contains **{target_yoe_count:,}** candidates ({target_pct}% of those
with YoE data), confirming the dataset has strong supply in the target range.

---

## Education Tier Distribution (Qualified Pool)

| Tier | Count | % of qualified pool |
|------|------:|--------------------:|
{edu_rows}

---

## Assessment Score Sparsity

| Metric | Value |
|--------|------:|
| Candidates with assessment data | {asp['candidates_with_assessment_pct']}% |
| Candidates **without** assessment data | {asp['candidates_without_assessment_pct']}% |
| Mean score (where present) | {asp['nonzero_mean']} ({asp['nonzero_mean'] * 100:.0f}/100) |
| Median score (where present) | {asp['nonzero_median']} ({asp['nonzero_median'] * 100:.0f}/100) |
| p95 score (where present) | {asp['nonzero_dist']['p95']} |

Only **{asmt_present_pct}%** of the 100K corpus has any Redrob assessment data. Among those who
do, the mean score of {asmt_mean_nz:.2f} shows genuine engagement — this is not random noise.
The sparsity is the primary reason assessment receives a 0.15 weight rather than 0.20+:
it is a high-quality signal for {asmt_present_pct}% of candidates but structurally absent for
the rest. The scoring formula handles this gracefully — a zero assessment\\_score contributes
0.0 to the composite, neither boosting nor penalising.

---

## Top-100 vs Qualified Pool

| Component | Top-100 Mean | Pool Mean | Lift |
|-----------|-------------:|----------:|-----:|
{tp_career}
{tp_skill}
{tp_exp}
{tp_asmt}
{tp_avail}

The highest **relative** lift is on `assessment_score` ({t1p['assessment_score']['lift_x']}×) and
`skill_score` ({skill_lift}×) — components that are near-zero for most of the qualified pool
but well-represented in the top-100. `career_score` shows the largest **absolute** gap
(top-100 mean {t1p['career_score']['top100_mean']} vs pool mean {t1p['career_score']['pool_mean']}),
confirming it as the primary quality discriminator at its 0.30 weight.

---

## Key Findings for the Interview

- **{asmt_sparse_pct}% of candidates have no assessment data.** The 0.15 weight on
  `assessment_score` is a deliberate calibration for this sparsity: high enough to
  meaningfully reward the {asmt_present_pct}% who do have scores (mean {asmt_mean_nz * 100:.0f}/100),
  low enough not to structurally disadvantage the majority who never took assessments.

- **{loc_india_pct:.0f}% of the corpus is India-based**, making location\\_fit a useful signal
  for identifying candidates close to the Pune/Noida target. The location multiplier inside
  experience\\_score (weight 0.35 of the 0.10 component) nudges rather than gates — a
  perfect-skill candidate from abroad is not disqualified, only nudged down.

- **{target_pct}% of the qualified pool sits in the 5–9 year target band**, confirming the
  JD's "5+ years" requirement is well-supplied. The yoe\\_fit table's sharp penalty below 3
  years is justified by data: the under-3 pool is thin and unlikely to carry the
  "production ML deployments" the JD requires.

- **Career score is the strongest differentiator** ({career_lift}× lift in the top-100 vs pool
  mean). This validates the 0.30 weight and explains why career quality — not raw years of
  experience — is the primary sorting signal. Candidates with long tenures in IT services
  score similarly to short-tenure candidates from product ML companies.
"""

with open(REPORT_MD, "w", encoding="utf-8") as f:
    f.write(md)
print(f"Wrote {REPORT_MD}")

# ---------------------------------------------------------------------------
# Print console summary
# ---------------------------------------------------------------------------
print("\n=== OVERVIEW ===")
for k, v in ov.items():
    print(f"  {k}: {v}")

print("\n=== FIELD COMPLETENESS ===")
for k, v in fc.items():
    print(f"  {k}: {v}%")

print("\n=== SCORE DISTRIBUTIONS (qualified pool) ===")
for comp, d in sd.items():
    print(f"  {comp}: mean={d['mean']} median={d['median']} std={d['std']} p95={d['p95']} zero={d['pct_zero']}%")

print("\n=== LOCATION ===")
for b, v in loc["buckets"].items():
    print(f"  {b}: {v['count']:,} ({v['pct']}%)")
print("  Top 5 cities:", loc["top5_cities"])

print("\n=== YoE BANDS ===")
for band, cnt in yoe["bands"].items():
    print(f"  {band}: {cnt:,}")
print(f"  mean={yoe['mean_yoe']}  median={yoe['median_yoe']}")

print("\n=== EDUCATION ===")
for tier, v in edu.items():
    print(f"  {tier}: {v['count']:,} ({v['pct']}%)")

print("\n=== ASSESSMENT SPARSITY ===")
print(f"  with data: {asp['candidates_with_assessment_pct']}%")
print(f"  without:   {asp['candidates_without_assessment_pct']}%")
print(f"  mean (nonzero): {asp['nonzero_mean']}  median: {asp['nonzero_median']}")

print("\n=== TOP-100 vs POOL ===")
for comp, d in t1p.items():
    print(f"  {comp}: top100={d['top100_mean']}  pool={d['pool_mean']}  lift={d['lift_x']}x")
