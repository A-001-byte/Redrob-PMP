# Fairness & Adverse-Impact Audit — Redrob Ranker top-100

## 1. What this audit is — and is not

This audit borrows the four-fifths (80%) impact-ratio methodology from US employment law as an engineering health-check. The attributes below are NOT protected classes; the dataset contains no gender, age, or ethnicity fields, and this system deliberately does not infer them from names or any other signal. This is a fairness-aware design practice, not a legal compliance claim — a real NYC Local Law 144 audit requires an independent auditor and actual demographic data.

## 2. Attributes audited vs unavailable

**Audited (proxy attributes present in the data):** education tier, location, years-of-experience band, company-size background.

**Not available in the source data:** gender, age, ethnicity, disability, or any other protected attribute — none exist in candidate_schema.json (names are pre-anonymized), and none are inferred.

## 3. Reference pool

Qualified pool = ≥1 matched required JD skill AND not disqualified AND not honeypot — **19,110 candidates** out of 100,000 total. Top-100 = the submitted ranking (100 rows, all inside the qualified pool). Selection rates use the qualified pool as denominator; the four-fifths threshold is 0.8.

## 4.1 Education tier

| Group | Pool n | Pool share | Top-100 n | Top-100 share | Selection rate | Impact ratio | Flag |
|---|---|---|---|---|---|---|---|
| tier_1 | 1,758 | 9.199% | 55 | 55.0% | 3.129% | 1.0 | ok |
| tier_2 | 4,951 | 25.908% | 33 | 33.0% | 0.667% | 0.213 | ⚠ review |
| tier_3 | 7,382 | 38.629% | 10 | 10.0% | 0.135% | 0.043 | ⚠ review |
| tier_4+unknown | 5,019 | 26.264% | 2 | 2.0% | 0.04% | 0.013 | ⚠ review |

**Decomposition of flagged gaps:**

- **tier_2** (impact ratio 0.213): largest decomposable qualified-pool gaps vs 'tier_1': career_score (+0.0181 weighted), assessment_score (+0.0072 weighted); career evidence (weight 0.30) dominates pedigree signals. The semantic component (0.25 weight) is not decomposable offline.
- **tier_3** (impact ratio 0.043): largest decomposable qualified-pool gaps vs 'tier_1': career_score (+0.0253 weighted), assessment_score (+0.0112 weighted); career evidence (weight 0.30) dominates pedigree signals. The semantic component (0.25 weight) is not decomposable offline.
- **tier_4+unknown** (impact ratio 0.013): largest decomposable qualified-pool gaps vs 'tier_1': career_score (+0.0280 weighted), education_tier_score (+0.0133 weighted); education pedigree is bounded by design: education_tier_score carries 0.25 of the 0.10-weight experience component, i.e. at most 2.5% of the composite. The semantic component (0.25 weight) is not decomposable offline.

## 4.2 Location

| Group | Pool n | Pool share | Top-100 n | Top-100 share | Selection rate | Impact ratio | Flag |
|---|---|---|---|---|---|---|---|
| Pune+Noida | 1,652 | 8.645% | 15 | 15.0% | 0.908% | 1.0 | ok |
| Other tier-1 India | 5,597 | 29.288% | 37 | 37.0% | 0.661% | 0.728 | ⚠ review |
| Other India | 7,229 | 37.828% | 38 | 38.0% | 0.526% | 0.579 | ⚠ review |
| International | 4,632 | 24.239% | 10 | 10.0% | 0.216% | 0.238 | ⚠ review |

**Decomposition of flagged gaps:**

- **Other tier-1 India** (impact ratio 0.728): largest decomposable qualified-pool gaps vs 'Pune+Noida': location_fit (+0.0070 weighted), assessment_score (+0.0015 weighted); career evidence (weight 0.30) dominates pedigree signals. The semantic component (0.25 weight) is not decomposable offline.
- **Other India** (impact ratio 0.579): largest decomposable qualified-pool gaps vs 'Pune+Noida': location_fit (+0.0207 weighted), career_score (+0.0024 weighted); career evidence (weight 0.30) dominates pedigree signals. The semantic component (0.25 weight) is not decomposable offline.
- **International** (impact ratio 0.238): largest decomposable qualified-pool gaps vs 'Pune+Noida': location_fit (+0.0280 weighted), career_score (+0.0075 weighted); career evidence (weight 0.30) dominates pedigree signals. The semantic component (0.25 weight) is not decomposable offline.

## 4.3 Years-of-experience band

| Group | Pool n | Pool share | Top-100 n | Top-100 share | Selection rate | Impact ratio | Flag |
|---|---|---|---|---|---|---|---|
| <5 yrs | 6,928 | 36.253% | 18 | 18.0% | 0.26% | 0.334 | ⚠ review |
| 5-9 yrs (JD target) | 10,168 | 53.208% | 79 | 79.0% | 0.777% | 1.0 | ok |
| 10-13 yrs | 1,617 | 8.462% | 0 | 0.0% | 0.0% | 0.0 | ⚠ review |
| >13 yrs | 397 | 2.077% | 3 | 3.0% | 0.756% | 0.973 | ok |

**Decomposition of flagged gaps:**

- **<5 yrs** (impact ratio 0.334): largest decomposable qualified-pool gaps vs '5-9 yrs (JD target)': yoe_fit (+0.0266 weighted), career_score (-0.0142 weighted); career evidence (weight 0.30) dominates pedigree signals. The semantic component (0.25 weight) is not decomposable offline.
- **10-13 yrs** (impact ratio 0.0 — investigated): The zero representation is not caused by the yoe_fit penalty alone (0.4 for yoe 11–13, 0.7 for yoe=10 — both higher than the >13 band's 0.2), which creates a paradox with the >13 band's 0.973 ratio. Investigation of the full qualified pool reveals the cause: the entire 10–13 YoE band contains no candidate with career_score > 0.715 and no candidate with skill_score > 0.30, while the >13 band contains six candidates with career_score > 0.80 and three with skill_score > 0.40 — all genuine AI/ML senior engineers (AI Engineers, NLP Engineers, Senior Applied Scientists with career scores 0.83–0.97). The 10–13 band's highest-proxy candidates are Java Developers, DevOps Engineers, Business Analysts, and Mechanical Engineers who matched ≥1 required skill via broad SBERT canonicalization but hold no ML-specific career evidence; they are correctly ranked below the rank-100 composite cutoff (0.5709) on career and semantic grounds. The non-monotonicity is a dataset distribution artifact — in this pool, genuine senior ML engineers appear as outliers in the >13 bracket, while the 10–13 bracket is populated by non-ML professionals — not a ranking defect.

## 4.4 Company-size background

| Group | Pool n | Pool share | Top-100 n | Top-100 share | Selection rate | Impact ratio | Flag |
|---|---|---|---|---|---|---|---|
| Predominantly startup/scale-up | 826 | 4.322% | 7 | 7.0% | 0.847% | 1.0 | ok |
| Mixed / unknown | 5,954 | 31.156% | 33 | 33.0% | 0.554% | 0.654 | ⚠ review |
| Predominantly enterprise | 12,330 | 64.521% | 60 | 60.0% | 0.487% | 0.574 | ⚠ review |

**Decomposition of flagged gaps:**

- **Mixed / unknown** (impact ratio 0.654): largest decomposable qualified-pool gaps vs 'Predominantly startup/scale-up': career_score (+0.0154 weighted), yoe_fit (-0.0054 weighted); career evidence (weight 0.30) dominates pedigree signals. The semantic component (0.25 weight) is not decomposable offline.
- **Predominantly enterprise** (impact ratio 0.574): largest decomposable qualified-pool gaps vs 'Predominantly startup/scale-up': career_score (+0.0248 weighted), yoe_fit (-0.0090 weighted); career evidence (weight 0.30) dominates pedigree signals. The semantic component (0.25 weight) is not decomposable offline.

## 5. Design factors that bound pedigree effects

- Education is capped at 2.5% of the composite by construction (0.25 of the 0.10-weight experience component) — career evidence carries 0.30, skills 0.20.
- Skill matching is canonicalized (SBERT + aliases), so skill names — not institution names — drive the 0.20 skill weight.
- No name, photo, gender, or age signal exists anywhere in the feature set (contracts.py is the locked schema).
- Location preference is an explicit, documented JD requirement (Pune/Noida office), not a learned correlation.

## 6. Limitations

- The semantic component (0.25 weight) is embedding-based and query-relative; it cannot be decomposed pool-wide offline, so decomposition notes cover the remaining 75% of the composite.
- tier_4 and unknown education are indistinguishable in the feature set (identical base score) and are audited as one group.
- Selection into the top 100 from a ~20K pool makes every selection rate small; impact ratios, not absolute rates, carry the signal.
- Proxy attributes can correlate with protected classes; absent demographic data, this audit cannot measure that correlation.

---
Reproduce: `python pipeline/fairness_audit.py` (deterministic — reruns are byte-identical).
