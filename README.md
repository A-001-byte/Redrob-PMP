# Glasshouse — Intelligent Candidate Ranking System

![CI](https://github.com/A-001-byte/Redrob-PMP/actions/workflows/ci.yml/badge.svg)

## Redrob Hackathon | Track 01: The Data & AI Challenge

**Glasshouse** — an intelligent candidate ranking system built for the Redrob
Hackathon (Track 01). Glasshouse ranks 100,000 raw candidate profiles against the Senior ML
Engineer (Search & Ranking) job description and emits a defensible top-100 in
~45 seconds on CPU, with zero network access at rank time. It works as a
six-layer funnel: cheap dense retrieval prunes 100K to 5,000, hybrid
semantic+lexical scoring and a cross-encoder sharpen that to 200, and an
interpretable weighted composite — career quality, JD-skill match,
experience fit, verified assessments, behavioral availability — produces the
final order. Fraud never reaches the output: a four-check honeypot detector
and hard disqualifiers are enforced with zero tolerance in the final 100,
and every ranked row ships with a human-readable reasoning string.

## Quick Start — Reproduce the Submission

```bash
pip install -r requirements.txt
python pipeline/rank.py --precomputed precomputed/ --out submission/submission.csv
```

Expected output (~45 s on a laptop CPU, deterministic across runs):

```
L2 cross-encoder: 500 pairs in 39.8s

funnel: 5000 -> 500 -> 200 -> 150 -> 100
timings: load=4.2s  L0_faiss=0.3s  L1_hybrid=0.5s  L2_cross_encoder=39.8s ...
wrote submission/submission.csv
```

`submission/submission.csv` columns: `candidate_id, rank, score, reasoning`.
Validate with the organizer checker:

```bash
python submission/validate_submission.py submission/submission.csv
```

> **Note on large artifacts:** the six large files in `precomputed/`
> (embeddings, FAISS/BM25 indexes, features/texts pickles, ~700 MB) and
> `models/` (~200 MB) are not committed to git — the small glue artifacts
> (`candidate_ids.json`, `gate_data.pkl`, `jd_embedding.npy`, `jd_query.txt`,
> `negative_anchors.npy`, `skill_canon.pkl`) are. Either download the large
> files from the GitHub Releases page or regenerate everything from scratch
> (see *Offline Pre-computation*, ~15 min, one-time).

Docker (Stage 3):

```bash
docker build -t redrob-ranker .
docker run --rm -v "$(pwd)/submission:/app/submission" redrob-ranker   # %cd% on Windows cmd
```

## Architecture — Six-Layer Ranking Pipeline

```
            100,000 candidates (precomputed artifacts, zero network)
                 │
   L0  FAISS FlatIP dense retrieval vs JD embedding          → top 5,000
                 │
   L1  Hybrid re-score: 0.70·dense(minmax) + 0.30·BM25       → top   500
                 │      (BM25 query = JD's distinctive lexical terms)
   L2  Cross-encoder ms-marco-MiniLM (JD query, career_text) → top   200
                 │
   L3  Composite score (interpretable weighted formula)      → top   150
                 │
   L4  LightGBM LambdaRank re-rank (placeholder, pass-thru)  → top   100
                 │
   L5  Assessment hard gate, ranks 1–20 only:
       expert claim on a required skill needs score ≥ 40 — violators demoted
                 │
   L6  Honeypot / disqualifier zero tolerance:
       any flagged profile in the 100 is replaced from the clean bench
                 │
   OUT reasoning strings + monotone-score CSV (validator-safe ordering)
```

## Scoring Formula

```
base = clamp[0,1](  0.25 · semantic      (L1 hybrid score, minmax over L2 set)
                  + 0.30 · career        (company type, role relevance, production
                                          signal, domain, tenure — 40/30/10/10/10)
                  + 0.20 · skill         (canonicalized JD-skill match)
                  + 0.10 · experience    (0.40 yoe + 0.35 location + 0.25 education)
                  + 0.15 · assessment    (mean JD-required assessment scores / 100)
                  + trajectory           (−0.05 / 0 / +0.05)
                  + consistency          (±0.03: summary↔career embedding agreement)
                  − anchor_penalty )     (0 / 0.05 / 0.10: proximity to anti-fit
                                          archetype embeddings)

composite = base × availability  (clamped 0.10–1.25: notice period, activity,
                                  response rate, open-to-work)
                 × 0.05 if disqualified
                 × 0.0  if honeypot
```

## Key Design Decisions

- **Career-only embeddings.** Candidates are embedded from recency-weighted
  career descriptions only — the self-written summary is excluded from
  matching (too gameable) and used solely for the anti-fraud consistency
  check against the career embedding.
- **Hybrid SBERT + BM25 retrieval.** Dense embeddings capture "ML engineer
  who ships ranking systems"; the sparse channel catches exact JD terms
  (FAISS, NDCG, vector search) that embeddings blur. 0.70/0.30 blend
  validated in Phase-2 measurements.
- **Behavioral availability as a multiplier, not a score term.** A perfect-fit
  candidate who hasn't logged in for months or never answers recruiters is
  multiplied down (×0.10 floor) rather than slightly subtracted — fit and
  attainability are different axes.
- **Four-check honeypot detection + zero-tolerance L6.** Expert skill claims
  with < 3 months usage, YoE inflated > allowance vs summed career history,
  expert claims scoring < 25/100 on assessments, and > 6 months of
  overlapping full-time roles. Flagged profiles are score-killed (×0) AND
  physically replaced if they ever reach the top 100.
- **L4 re-ranker intentionally absent.** The LightGBM LambdaRank slot exists
  as a clean interface in rank.py (`use_l2_ranker=False`). We chose not to
  train it on synthetic rank-derived labels, as that would be circular — the
  model would learn to replicate our composite scorer rather than improve on
  it. The slot is a documented extension point.

## Fairness & Bias Audit

The repo ships an automated adverse-impact audit of the final top-100
(`submission/fairness_report.md` + `.json`), the kind of health-check
HR-tech ranking tools run under NYC Local Law 144 / the EU AI Act regime.
It compares each group's selection rate out of the **qualified pool**
(≥1 matched required skill, not disqualified, not honeypot — 19,110
candidates) and flags any impact ratio below the four-fifths (0.80)
threshold. Audited proxy attributes: education tier, location,
years-of-experience band, company-size background. The dataset contains
**no gender/age/ethnicity fields and none are inferred** — this is a
fairness-aware engineering practice borrowing the legal methodology, not a
compliance claim (a real LL144 audit needs an independent auditor and
demographic data). The web UI surfaces the tables (React panel + Streamlit
expander). Reproduce: `python pipeline/fairness_audit.py` (read-only,
deterministic — never touches the ranking).

## Offline Pre-computation (run once)

Regenerates everything in `precomputed/` from `data/candidates.jsonl` + the
JD docx (~15 min CPU; downloads the two transformer models into `models/`
on first run — the only step that ever touches the network):

```bash
python pipeline/build_skill_canon.py    # JD skill -> raw-skill canonicalization (SBERT, 0.75 cosine)
python pipeline/build_features.py      # features.pkl + texts.pkl (all structured signals, honeypot flags)
python pipeline/build_embeddings.py    # career/summary embeddings, JD embedding, negative anchors
python pipeline/build_bm25.py          # BM25 index over career texts
python pipeline/build_index.py         # FAISS FlatIP index (row-aligned, sha256-checked)
python pipeline/build_gate_data.py     # L5 assessment-gate lookup
```

All artifacts are row-aligned to `candidate_ids.json`; `rank.py` verifies the
BM25 ids-hash at load and refuses to run on mismatched artifacts.

## Web Interface

Full instructions in [`web/README.md`](web/README.md).

```bash
# FastAPI backend (port 8000)
uvicorn web.backend.main:app --port 8000
# React frontend (port 5173)
cd web/frontend && npm install && npm run dev
# OR the single-process Streamlit demo (HuggingFace Spaces entry point)
streamlit run web/streamlit_app.py
```

Features: live top-100 table (sort/filter/search), per-candidate score
breakdown drawer, honeypot/DQ quality metrics, one-click re-rank with
streamed layer-by-layer progress (SSE), scoring-only preview of uploaded
candidate-ID lists, CSV export.

## Project Structure

```
pipeline/            ranking system (Phases 1–3)
  contracts.py         locked Phase-1 data contract (FeatureRecord/TextRecord)
  honeypot.py          4-check fraud detector
  build_*.py           offline artifact builders (see above)
  scorer.py            composite formula, consistency, anchors, L5 gate logic
  reasoning.py         per-candidate reasoning strings
  rank.py              THE entry point — six-layer funnel, ~45 s
  verify_phase2.py     retrieval-quality checks
  verify_phase3.py     7-point submission verification
precomputed/         artifacts (regenerable; large files not in git)
models/              cached transformer models (not in git; auto-downloaded)
data/                candidates.jsonl + schema (jsonl not in git)
docs/                job description + hackathon blueprint
submission/          submission.csv, rank_details.json, validate_submission.py
web/                 Phase-4 web interface (FastAPI + React + Streamlit)
submission_metadata.yaml
Dockerfile           Stage-3 reproduction image
```

## Tech Stack

| Library | Version | Purpose |
|---|---|---|
| sentence-transformers | 5.5.1 | all-MiniLM-L6-v2 bi-encoder + ms-marco cross-encoder |
| faiss-cpu | 1.14.2 | L0 dense retrieval (FlatIP, exact) |
| rank-bm25 | 0.2.2 | L1 sparse lexical channel |
| numpy | 2.4.3 | all vector math |
| pandas | 3.0.2 | data wrangling, web metrics |
| fastapi / uvicorn | 0.136.1 / 0.46.0 | web backend + SSE re-rank streaming |
| streamlit | 1.57.0 | HuggingFace Spaces demo |
| React 18 + Tailwind + Vite | — | local dashboard frontend |
| Python | 3.11 | CPU-only, no GPU required |

## Verification

```bash
python pipeline/verify_phase3.py
```

Seven checks: (1) CSV format & validator rules, (2) safety — zero
honeypots/disqualified in the 100 against features.pkl directly, (3) top-20
quality eyeball, (4) reasoning audit on seeded-random rows, (5) L5 gate audit
over the final top-20, (6) timing under the 5-minute budget, (7) determinism
— rank.py twice, byte-identical output. Expected: all seven PASS.
