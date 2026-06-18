# Dataset Quality Report

Generated from `precomputed/features.pkl` (100,000 candidates).
All distribution statistics use the **qualified pool** (n=54,126) unless
noted. "Qualified" = not disqualified, not honeypot, skill\_score > 0.

---

## Overview

| Metric | Count | % of corpus |
|--------|------:|------------:|
| Total candidates | 100,000 | 100% |
| Honeypots | 40 | 0.04% |
| Disqualified (non-honeypot) | 10,334 | 10.33% |
| Qualified pool | 54,126 | 54.13% |

---

## Field Completeness (all 100K candidates)

| Field | Present % | Interpretation |
|-------|----------:|----------------|
| `career_score > 0` | 100.0% | Candidates with parseable career descriptions |
| `matched_required_skills` non-empty | 22.2% | At least one JD-required skill matched |
| `assessment_score > 0` | 5.3% | Has at least one Redrob skill assessment |
| `recruiter_response_rate > 0` | 100.0% | Has recruiter interaction history |
| `open_to_work_flag` = True | 35.3% | Actively signaling availability |
| `github_activity_score > 0` | 35.3% | Has measurable GitHub activity |

**Note:** `assessment_score` is sparse (94.7% of candidates have no data). This is
why it is weighted at 0.15 rather than higher: it contributes strong signal where present
but cannot penalise candidates for missing data they did not choose to omit. For candidates
with assessments, the mean score is 0.55 (55/100), indicating
genuine signal rather than noise.

---

## Score Distributions (Qualified Pool, n=54,126)

| Score | Mean | Median | Std | p25 | p75 | p95 | % Zero |
|-------|-----:|-------:|----:|----:|----:|----:|-------:|
| career\_score | 0.5081 | 0.49 | 0.1263 | 0.415 | 0.59 | 0.715 | 0.0% |
| skill\_score | 0.0647 | 0.025 | 0.0696 | 0.0187 | 0.105 | 0.2025 | 0.0% |
| experience\_score | 0.5682 | 0.565 | 0.1878 | 0.4075 | 0.695 | 0.905 | 0.0% |
| assessment\_score | 0.0465 | 0.0 | 0.1597 | 0.0 | 0.0 | 0.511 | 91.6% |
| availability\_multiplier | 0.91 | 0.92 | 0.1458 | 0.82 | 1.02 | 1.15 | 0.0% |

---

## Location Distribution (all 100K candidates)

| Bucket | Count | % |
|--------|------:|--:|
| Tier-1 India (other) | 41,680 | 41.7% |
| Other India | 24,964 | 25.0% |
| International | 24,887 | 24.9% |
| Noida | 4,283 | 4.3% |
| Pune | 4,186 | 4.2% |

**Top 5 cities:**

| City | Count |
|------|------:|
| Bhubaneswar | 4,321 |
| Noida | 4,283 |
| Hyderabad | 4,283 |
| Jaipur | 4,268 |
| Bangalore | 4,238 |

---

## YoE Distribution (Qualified Pool, n=54,126 with YoE data)

Target band (5–9 yrs) shaded — JD asks for "5+ years".

| Band | Count |
|------|------:|
| <3 | 7,047 |
| 3-4 | 9,721 |
| 5-9 | 25,008 |
| 10-13 | 9,850 |
| 14+ | 2,500 |

Mean YoE: **7.22**, Median: **6.9**

The target band (5–9 yrs) contains **25,008** candidates (46.2% of those
with YoE data), confirming the dataset has strong supply in the target range.

---

## Education Tier Distribution (Qualified Pool)

| Tier | Count | % of qualified pool |
|------|------:|--------------------:|
| Tier-3 | 21,455 | 39.6% |
| Tier-4 / unknown | 16,068 | 29.7% |
| Tier-2 | 12,798 | 23.6% |
| Tier-1 | 3,805 | 7.0% |

---

## Assessment Score Sparsity

| Metric | Value |
|--------|------:|
| Candidates with assessment data | 5.3% |
| Candidates **without** assessment data | 94.7% |
| Mean score (where present) | 0.5541 (55/100) |
| Median score (where present) | 0.559 (56/100) |
| p95 score (where present) | 0.779 |

Only **5.3%** of the 100K corpus has any Redrob assessment data. Among those who
do, the mean score of 0.55 shows genuine engagement — this is not random noise.
The sparsity is the primary reason assessment receives a 0.15 weight rather than 0.20+:
it is a high-quality signal for 5.3% of candidates but structurally absent for
the rest. The scoring formula handles this gracefully — a zero assessment\_score contributes
0.0 to the composite, neither boosting nor penalising.

---

## Top-100 vs Qualified Pool

| Component | Top-100 Mean | Pool Mean | Lift |
|-----------|-------------:|----------:|-----:|
| career\_score | 0.9524 | 0.5081 | 1.87x |
| skill\_score | 0.3598 | 0.0647 | 5.56x |
| experience\_score | 0.7818 | 0.5682 | 1.38x |
| assessment\_score | 0.4993 | 0.0465 | 10.75x |
| availability\_multiplier | 1.1648 | 0.91 | 1.28x |

The highest **relative** lift is on `assessment_score` (10.75×) and `skill_score` (5.56×) —
components that are near-zero for most of the qualified pool but well-represented in the
top-100. `career_score` shows the largest **absolute** gap (top-100 mean 0.9524 vs pool mean
0.5081), confirming it as the primary quality discriminator at its 0.30 weight.

---

## Key Findings for the Interview

- **94.7% of candidates have no assessment data.** The 0.15 weight on
  `assessment_score` is a deliberate calibration for this sparsity: high enough to
  meaningfully reward the 5.3% who do have scores (mean 55/100),
  low enough not to structurally disadvantage the majority who never took assessments.

- **75% of the corpus is India-based**, making location\_fit a useful signal
  for identifying candidates close to the Pune/Noida target. The location multiplier inside
  experience\_score (weight 0.35 of the 0.10 component) nudges rather than gates — a
  perfect-skill candidate from abroad is not disqualified, only nudged down.

- **46.2% of the qualified pool sits in the 5–9 year target band**, confirming the
  JD's "5+ years" requirement is well-supplied. The yoe\_fit table's sharp penalty below 3
  years is justified by data: the under-3 pool is thin and unlikely to carry the
  "production ML deployments" the JD requires.

- **Career score has the largest absolute gap** (top-100 mean 0.95 vs pool mean 0.51, +0.44
  absolute). Assessment and skill show higher *relative* lift (10.75× and 5.56×) because
  they are near-zero for most of the pool but well-present in the top-100. This confirms
  the 0.30 career weight is correct: career quality is the primary sorting signal, and
  both assessment and skill act as strong secondary filters where data exists.
