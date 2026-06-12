# Redrob Ranker — Full Project Context

> Hand-off document for AI agents / new developers. Everything below is verified
> against the actual source as of 2026-06-11. Repo:
> https://github.com/A-001-byte/Redrob-PMP (team "Team PMP").

## 1. What this project is

Entry for the **Redrob Hackathon, Track 01: The Data & AI Challenge**. The task:
rank **100,000 raw candidate profiles** (`data/candidates.jsonl`, 465 MB) against
a **Senior ML Engineer (Search & Ranking)** job description and submit a
defensible **top-100 CSV**. Hard constraints from the organizers:

- Ranking step must finish in **< 5 minutes, CPU-only, 16 GB RAM, zero network**.
- Output exactly 100 rows: `candidate_id, rank, score, reasoning`.
- Scores **non-increasing** by rank; ties broken by **candidate_id ascending**.
- The dataset contains planted **honeypot (fraudulent) profiles** — ranking one
  in the top 100 is heavily penalized.
- Reproducible via a single CLI command / Docker.

**Our result:** top-100 with **0 honeypots, 0 disqualified, mean top-10 score
0.9657** (was 0.9454 before the 2026-06-12 RRF fusion change), ranking in
**~11 s clean** (11.2 s in `submission/rank_timing.json`; ~87 s under heavy
machine load). Deterministic: two runs are byte-identical.

## 2. Current status (as of 2026-06-11)

**Done & pushed to `origin/main` (latest commit `e1aba93`):**
- Full pipeline (Phases 1–3), web interface (Phase 4), submission CSV,
  README, Dockerfile, `submission_metadata.yaml`, organizer spec files,
  small precomputed glue artifacts.
- All 7 checks of `pipeline/verify_phase3.py` pass.

**Outstanding TODO:**
1. **GitHub Release missing.** README tells organizers to download the six
   large `precomputed/` files (~700 MB) and `models/` (~200 MB) from the
   Releases page — **zero releases exist**. Blocked on `gh auth login`.
2. **HuggingFace Spaces deploy** of `web/streamlit_app.py` (steps in
   `web/README.md` §3), then fill `web_interface.sandbox_url` in
   `submission_metadata.yaml` (currently empty) — the organizer template
   requires a sandbox link.
3. `submission_metadata_template.yaml` (organizer template: team contacts, AI
   tools declaration, approach summary ≤200 words, declarations) is **not yet
   fully filled** — our `submission_metadata.yaml` covers reproduction info
   but not all template fields.
4. Optional: L4 LightGBM LambdaRank slot is an intentional pass-through
   (`USE_L2_RANKER = False` in rank.py) — documented extension point, not a bug.

**Dev environment:** Windows 11, PowerShell, Python 3.11, repo at `D:\H2S`.
No venv noted; deps installed globally per `requirements.txt`.

## 3. Architecture — six-layer funnel

Two stages: **offline pre-computation** (~15 min, run once, only step that
touches the network — model downloads) and the **ranking step** (`rank.py`,
~45 s, fully offline: `HF_HUB_OFFLINE=1` and `TRANSFORMERS_OFFLINE=1` set at
the top of rank.py).

```
            100,000 candidates (precomputed artifacts, zero network)
   L0  FAISS IndexFlatIP dense retrieval vs JD embedding      → top 5,000
   L1  Hybrid: weighted RRF 70/30 (dense, BM25), k=60         → top   500
   L2  Cross-encoder ms-marco-MiniLM-L-6-v2 (JD, career_text) → top   200
   L3  Interpretable weighted composite score                 → top   150
   L4  LightGBM LambdaRank slot (placeholder, pass-through)   → top 100 + bench
   L5  Assessment hard gate, ranks 1–20 only                  → demote violators
   L6  Honeypot/DQ zero tolerance                             → replace from bench
   OUT reasoning strings + monotone-score CSV
```

Layer details (all in `pipeline/rank.py`, `main()` at line 101):
- **L0**: FAISS exact inner-product search on L2-normalized 384-d career
  embeddings (all-MiniLM-L6-v2). ~10 ms full scan.
- **L1**: weighted Reciprocal Rank Fusion, `0.70/(60+rank_dense) +
  0.30/(60+rank_bm25)`, ranks tie-broken by candidate_id (deterministic).
  `--fusion linear` restores the legacy `0.70·minmax(dense) + 0.30·bm25`
  blend. The BM25 query is the fixed string `"production vector search FAISS
  embeddings ranking NDCG retrieval"` (JD's distinctive lexical terms).
- **L2**: `cross-encoder/ms-marco-MiniLM-L-6-v2`, batch 32, max_length 512,
  pairs = (JD query text from `precomputed/jd_query.txt`, career_text). Raw
  logits order L2 but never enter the composite (uncalibrated); they're saved
  in `rank_details.json` parts for a future learned ranker. This is the slow
  layer (~40 s of the 45 s).
- **L3**: composite score (below) over the 200 survivors → keep 150.
- **L4**: `l2_rerank()` pass-through. Deliberately untrained — training on
  rank-derived synthetic labels would be circular.
- **L5**: top-20 only. An **expert claim on a required JD skill needs
  assessment score ≥ 40**; violators are demoted to rank 21 (one per pass,
  bounded 25 iterations). Gate lookup from `precomputed/gate_data.pkl`.
- **L6**: any honeypot or disqualified profile in the final 100 is removed and
  replaced from the clean bench (ranks 101–150). Pool exhaustion raises.
- **Output**: scores rounded to 4 decimals; demoted/replaced rows are capped to
  the previous row's score, and equal-score rows with out-of-order ids are
  nudged down 0.0001 to satisfy the validator's monotone + id-ascending rules.

CLI: `--precomputed`, `--out`, `--topk-l0/l1/l2/l3` (defaults 5000/500/200/150).
Writes `submission.csv`, `rank_timing.json`, `rank_details.json`.

## 4. Scoring formula (pipeline/scorer.py)

```
base = clamp[0,1]( 0.25·semantic + 0.30·career + 0.20·skill
                 + 0.10·experience + 0.15·assessment
                 + trajectory (−0.05/0/+0.05)
                 + consistency (±0.03)
                 − anchor_penalty (0/0.05/0.10) )
composite = base × availability_multiplier (clamped 0.10–1.25)
                 × 0.05 if disqualified
                 × 0.0  if honeypot
```

- **semantic** = L1 hybrid score, min-max normalized over the L2 set.
- **career** (built in build_features.py) = 0.40·company_type (IT-services
  penalized: all-services 0.1 / mixed 0.5 / product 1.0) + 0.30·role_relevance
  (title buckets, ML/AI=1.0) + 0.10·production_signal (keyword binary) +
  0.10·domain_indicator (ranking/retrieval/search keywords) +
  0.10·tenure_stability (1 − fraction of roles < 18 months).
- **skill** = canonicalized JD-skill match. 4 required skills (embedding
  models; vector search & retrieval; Python; ranking & evaluation) at base 1.0,
  6 nice-to-have at base 0.4, each × proficiency mult (expert 1.0 … beginner
  0.2) × duration mult (≥48 mo = 1.0 … <6 mo = 0.1), normalized by max 6.4.
  Canon built by SBERT cosine ≥ 0.75 **or** lexical alias match (MiniLM is bad
  at short product names like "FAISS").
- **experience** = 0.40·yoe_fit (5–9 yrs = 1.0) + 0.35·location_fit (Pune/Noida
  1.0, tier-1 0.8, India+relocate 0.65, India no-relocate 0.3, abroad 0.2) +
  0.25·education_tier (+0.1 STEM bonus).
- **assessment** = mean of JD-required Redrob skill-assessment scores / 100.
- **consistency** = cosine(summary_emb, career_emb): > 0.70 → +0.03,
  < 0.50 → −0.03, summary < 20 chars → 0 (no signal).
- **anchor_penalty** = max cosine to 5 anti-fit archetype embeddings (HR mgr,
  marketing mgr, IT-services consultant, pure academic, CV/robotics
  specialist): ≥ 0.55 → 0.10, ≥ 0.40 → 0.05. Calibration: JD top-20 mean
  0.285, honeypots 0.376, HR/Marketing 0.439.
- **availability_multiplier**: base 1.0 adjusted by days inactive (+0.15 to
  −0.25), recruiter response rate (+0.10 to −0.15), open-to-work +0.05,
  applications/GitHub/saved-by-recruiters +0.05 each, notice period (0 to
  −0.12); clamped [0.10, 1.25]. Multiplier, not score term — fit and
  attainability are different axes.

## 5. Fraud detection

**Honeypot — 4 checks (`pipeline/honeypot.py`, any one fires):**
1. **Skill-duration fraud**: "expert" proficiency with < 3 months usage.
2. **Experience inflation**: summed career months < 35% of stated YoE.
3. **Assessment contradiction**: "expert" claim scoring < 25/100 on its
   Redrob assessment.
4. **Impossible timeline**: two roles overlapping > 6 months (30.44
   days/month; open-ended roles extended to ref date).

Missing/null fields = "no signal", never raise. Honeypots get composite ×0
**and** physical L6 replacement.

**Disqualifiers — 3 checks (`pipeline/build_features.py`):** ×0.05 multiplier.
1. Every role at an IT-services firm.
2. Title-chaser: ≥ 60% roles < 18 months AND title escalation across a
   consecutive short-tenure pair.
3. Pure CV/Speech/Robotics profile with zero NLP/retrieval signal.

## 6. Reasoning strings (pipeline/reasoning.py)

1–2 sentences, 15–40 words, CSV-safe (no newlines/double-quotes). Tone bands by
rank: 1–10 confident, 11–30 positive, 31–70 balanced, 71–100 candid (the last
two include a concern clause: long notice, inactivity, relocation, or thin
skill match). Skeleton chosen deterministically via SHA-256 of candidate_id
(stable across runs). **Zero hallucination**: every clause derives from the
candidate's own FeatureRecord; `verify_phase3.py` re-audits every factual
phrase against the data.

## 7. Candidate data schema (data/candidate_schema.json)

`candidate_id` (`^CAND_\d{7}$`) + `profile` (headline, summary, location,
country, YoE 0–50, current title/company/size/industry) + `career_history`
(1–10 roles: company, title, dates, duration_months, is_current, industry,
description) + `education` (0–5: institution, degree, field, years, tier
tier_1–4/unknown) + `skills` (name, proficiency beginner→expert, endorsements,
duration_months) + certifications + languages + `redrob_signals` (21 platform
fields: profile_completeness, last_active_date, open_to_work_flag,
recruiter_response_rate 0–1, notice_period_days 0–180,
skill_assessment_scores dict 0–100, github_activity_score −1 or 0–100,
expected salary, etc.). `-1` conventionally means "unknown".

## 8. Repository layout & artifacts

```
pipeline/        contracts.py (FeatureRecord/TextRecord/SkillCanon TypedDicts)
                 honeypot.py, build_skill_canon.py, build_features.py,
                 build_embeddings.py, build_bm25.py, build_index.py,
                 build_gate_data.py, build_all.py (one-command rebuild),
                 scorer.py, reasoning.py,
                 rank.py (THE entry point), verify_phase2.py, verify_phase3.py
precomputed/     ranking artifacts (see table)
models/          HF cache: all-MiniLM-L6-v2 + ms-marco-MiniLM-L-6-v2 (~200 MB, NOT in git)
data/            candidates.jsonl (465 MB, 100K lines, NOT in git),
                 candidate_schema.json, sample/smoke candidates
docs/            job_description.docx, redrob_signals_doc.docx,
                 redrob_hackathon_blueprint.pdf, README.docx (organizer-provided)
submission/      submission.csv, rank_details.json, rank_timing.json,
                 validate_submission.py (organizer checker),
                 sample_submission.csv, submission_spec.docx,
                 submission_metadata_template.yaml
web/             Phase-4 interface (backend/, frontend/, streamlit_app.py)
submission_metadata.yaml   reproduction metadata (sandbox_url still empty)
Dockerfile       python:3.11-slim; CMD runs rank.py (copies precomputed/, models/, data/)
requirements.txt sentence-transformers 5.5.1, faiss-cpu 1.14.2, rank-bm25 0.2.2,
                 numpy 2.4.3, pandas 3.0.2, scikit-learn 1.8.0, python-docx,
                 fastapi 0.136.1, uvicorn 0.46.0, streamlit 1.57.0
```

**precomputed/ artifacts** (all row-aligned to `candidate_ids.json`, which
defines THE sorted row order for every matrix/index):

| File | Size | In git? |
|---|---|---|
| texts.pkl | 206 MB | no (gitignored → Release) |
| career_embeddings.npy / summary_embeddings.npy | 146 MB each | no |
| faiss_index.bin | 146 MB | no |
| bm25_index.pkl | 108 MB | no |
| features.pkl | 34 MB | no |
| candidate_ids.json | 1.5 MB | yes |
| gate_data.pkl, jd_embedding.npy, negative_anchors.npy, skill_canon.pkl, jd_query.txt | < 30 KB total | yes (pkl/npy via LFS) |
| *_sample.pkl | tiny | no (dev-only, gitignored) |

`.gitattributes`: `*.npy`, `*.bin`, `*.pkl`, `data/candidates.jsonl`,
`models/**` → LFS; `*.pdf`, `*.docx` → binary. `.gitignore` also excludes
`.claude/`, `CLAUDE.md`, dev-only labeling tools
(`pipeline/sample_for_labeling.py`, `show_candidate.py`, `label_candidate.py`,
`inspect_sample.py`, `audit_full.py`, `data/labeling_*.json`), and
`rank_timing.json` by name (the copy in submission/ was committed before the
ignore rule; it is tracked).

## 9. How to run

```powershell
# Rank (the organizer command, ~45 s):
python pipeline/rank.py --precomputed precomputed/ --out submission/submission.csv
# Validate (organizer checker):
python submission/validate_submission.py submission/submission.csv
# Full 7-point verification (format, safety, reasoning audit, gate audit,
# timing < 300 s, determinism — two byte-identical runs):
python pipeline/verify_phase3.py
# Rebuild all artifacts from scratch (~15 min, the only networked step):
python pipeline/build_skill_canon.py; python pipeline/build_features.py
python pipeline/build_embeddings.py;  python pipeline/build_bm25.py
python pipeline/build_index.py;       python pipeline/build_gate_data.py
# Docker:
docker build -t redrob-ranker . ; docker run --rm -v "${PWD}/submission:/app/submission" redrob-ranker
```

## 10. Web interface (Phase 4)

Three surfaces, all **read-only wrappers** over the pipeline (nothing in
`pipeline/` is modified by the web layer; Re-rank shells out to rank.py
exactly as an organizer would):

**FastAPI backend** (`web/backend/main.py`, `uvicorn web.backend.main:app
--port 8000`): loads features/texts/skill_canon/ids + mmap'd embeddings at
startup (~10 s). Endpoints: `GET /health`, `GET /api/results` (top-100 +
score parts), `GET /api/candidate/{id}` (full drawer profile, offset-seek into
candidates.jsonl), `GET /api/metrics` (honeypot/DQ counts, means,
distributions), `GET /api/export` (CSV download), `POST /api/rerank` (runs
rank.py, streams SSE progress events: stage/progress/log/error/complete;
**60 s cooldown** → 429, **single-flight lock** → 409), `POST /api/preview`
(scoring-only ranking of ≤ 200 uploaded candidate ids — dense semantic
min-maxed over the subset + composite, no cross-encoder). CORS allows
localhost:5173 and `https://*.hf.space`.

**React frontend** (`web/frontend/`, Vite + React 18 + Tailwind, `npm run
dev` → port 5173, backend URL via `VITE_API_URL`): Header (health dot,
re-rank button), MetricsBar, RankingTable (sort/filter/search, score
sparkbars), CandidateDrawer (full profile + score breakdown), UploadPanel
(extracts `CAND_\d{7}` ids from pasted text/file → preview), StatusBanner
(SSE progress). Production build in `web/frontend/dist/`.

**Streamlit app** (`web/streamlit_app.py`, HF Spaces entry point): same data
and design tokens in one process; `st.cache_resource` for artifacts,
mtime-keyed `st.cache_data` for CSV/details; degrades gracefully without
candidates.jsonl ("not deployed on this Space") or submission.csv. Spaces
deploy layout + frontmatter documented in `web/README.md` §3 (SDK streamlit,
`app_file: web/streamlit_app.py`, LFS for everything > 10 MB).

**Design system** ("Redrob Ranker", Data-Dense Dashboard): Fira Code headings
/ Fira Sans body; primary `#1E40AF`, secondary `#3B82F6`, accent `#D97706`,
background `#F8FAFC`, destructive `#DC2626`; green/amber/red reserved for
status; no gradients, no emoji icons, WCAG AA. Tokens in
`web/frontend/tailwind.config.js` and the `C` dict in `web/streamlit_app.py`.

## 11. Invariants an agent must not break

1. **Determinism.** No unseeded randomness anywhere in the rank path.
   reasoning.py uses SHA-256 (not builtin `hash()`). verify_phase3 check 7
   diffs two fresh runs byte-for-byte.
2. **Row alignment.** Everything keys off `candidate_ids.json` order. The BM25
   payload stores an order-sensitive SHA-256 of the ids; rank.py refuses to
   run on mismatch. If you regenerate any artifact, regenerate consistently.
3. **Offline rank time.** `HF_HUB_OFFLINE=1` / `TRANSFORMERS_OFFLINE=1` are
   set inside rank.py. Never add a network call to the rank path.
4. **Validator rules.** 100 rows exactly; ranks 1–100 each once; scores
   non-increasing; equal scores → candidate_id ascending; id format
   `CAND_\d{7}`; UTF-8. rank.py's score capping/nudging exists to satisfy
   this — keep it.
5. **Zero tolerance.** No honeypot or disqualified profile may appear in the
   final 100 under any change.
6. **contracts.py is a locked interface** between phases — change it only with
   a coordinated rebuild of features/texts pickles.
7. **Timing budget** 300 s; L2 cross-encoder is the dominant cost. Don't grow
   `--topk-l1` casually.
8. **Don't commit**: large artifacts (six big precomputed files, models/,
   candidates.jsonl), `.claude/`, CLAUDE.md, dev labeling tools. LFS patterns
   route any new .pkl/.npy/.bin automatically — mind GitHub LFS quotas.
9. Reasoning strings must stay newline-free, double-quote-free, 15–40 words,
   and 100% derivable from the candidate's own record (verify_phase3 audits).

## 12. Key constants quick reference

| What | Value |
|---|---|
| Composite weights sem/career/skill/exp/assess | 0.25 / 0.30 / 0.20 / 0.10 / 0.15 |
| L1 fusion (default rrf) | weighted RRF 0.70 / 0.30, k=60 (`--fusion linear` = legacy blend) |
| Funnel top-ks L0/L1/L2/L3/final | 5000 / 500 / 200 / 150 / 100 |
| Consistency thresholds (cos) | >0.70 → +0.03, <0.50 → −0.03 |
| Anchor penalty (max cos) | ≥0.55 → 0.10, ≥0.40 → 0.05 |
| DQ / honeypot multipliers | 0.05 / 0.0 |
| Assessment gate (L5, ranks 1–20) | expert+required needs ≥ 40/100 |
| Honeypot: expert min months / YoE allowance / assess contradiction / max overlap | 3 mo / 0.35 / <25 / >6 mo |
| Skill canon cosine threshold | 0.75 (+ lexical aliases) |
| Availability clamp | [0.10, 1.25] |
| Score decimals / timing budget | 4 / 300 s |
| Re-rank cooldown (web) | 60 s |
| Models | all-MiniLM-L6-v2 (384-d), cross-encoder/ms-marco-MiniLM-L-6-v2 |
