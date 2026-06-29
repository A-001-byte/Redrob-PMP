# Glasshouse — System Architecture

Full-system diagram. Renders natively on GitHub (Mermaid).

## End-to-end system

```mermaid
flowchart TB
    subgraph INPUTS["Inputs"]
        RAW[("data/candidates.jsonl<br/>100K profiles, 465 MB")]
        JD["docs/job_description.docx<br/>Senior ML Engineer JD"]
        SCHEMA["data/candidate_schema.json"]
    end

    subgraph BUILD["OFFLINE PRE-COMPUTATION  (~15 min, run once, ONLY networked stage)"]
        direction TB
        B1["build_skill_canon.py<br/>SBERT cos ≥ 0.75 + lexical aliases"]
        B2["build_features.py<br/>FeatureRecord per candidate<br/>+ honeypot.py 4 checks + 3 DQ rules"]
        B3["build_embeddings.py<br/>all-MiniLM-L6-v2, 384-d<br/>career + summary embeddings"]
        B4["build_bm25.py<br/>BM25 index + order-sensitive ids hash"]
        B5["build_index.py<br/>FAISS IndexFlatIP"]
        B6["build_gate_data.py<br/>assessment gate lookup"]
        HF["HuggingFace Hub<br/>(model downloads only)"] -.-> B1 & B3
    end

    subgraph ART["precomputed/  (row-aligned to candidate_ids.json)"]
        IDS["candidate_ids.json — THE row order"]
        EMB["career/summary_embeddings.npy · faiss_index.bin"]
        SPARSE["bm25_index.pkl (SHA-256 guarded)"]
        FEAT["features.pkl · texts.pkl · gate_data.pkl"]
        JDA["jd_embedding.npy · jd_query.txt<br/>negative_anchors.npy · skill_canon.pkl"]
    end

    subgraph RANK["RANKING — pipeline/rank.py  (~45 s, CPU-only, HF_HUB_OFFLINE=1, deterministic)"]
        direction TB
        L0["L0 — FAISS dense retrieval vs JD embedding<br/>100,000 → 5,000"]
        L1["L1 — Weighted RRF 70/30 (dense, BM25), k=60<br/>5,000 → 500"]
        L2["L2 — Cross-encoder ms-marco-MiniLM-L-6-v2<br/>(JD query, career_text) · the slow layer ~40 s<br/>500 → 200"]
        L3["L3 — Composite score (scorer.py)<br/>0.25 sem + 0.30 career + 0.20 skill + 0.10 exp<br/>+ 0.15 assess ± trajectory/consistency − anchors,<br/>× availability [0.10–1.25] · 200 → 150"]
        L4["L4 — LightGBM LambdaRank slot<br/>(pass-through placeholder) · 150 → 100 + bench"]
        L5["L5 — Assessment hard gate, ranks 1–20<br/>expert claim on required skill needs ≥ 40/100"]
        L6["L6 — Honeypot/DQ zero tolerance<br/>replace from bench (ranks 101–150)"]
        OUTSTEP["Reasoning strings (SHA-256 deterministic)<br/>+ monotone-score capping/nudging"]
        L0 --> L1 --> L2 --> L3 --> L4 --> L5 --> L6 --> OUTSTEP
    end

    subgraph OUT["Submission outputs"]
        CSV["submission/submission.csv<br/>100 rows · 0 honeypots · 0 DQ"]
        DET["rank_details.json · rank_timing.json"]
    end

    subgraph VERIFY["Verification"]
        VAL["validate_submission.py (organizer)"]
        V3["verify_phase3.py — 7 checks:<br/>format · safety · reasoning audit ·<br/>gate audit · timing < 300 s · byte-identical determinism"]
    end

    subgraph WEB["WEB INTERFACE (Phase 4) — read-only wrappers"]
        API["FastAPI backend :8000<br/>/api/results · /candidate/{id} · /metrics ·<br/>/export · /rerank (SSE, 60 s cooldown,<br/>single-flight) · /preview (≤200 ids)"]
        REACT["React + Vite + Tailwind :5173<br/>RankingTable · CandidateDrawer ·<br/>MetricsBar · UploadPanel · StatusBanner"]
        ST["Streamlit app (HF Spaces)<br/>single-process mirror"]
        REACT -->|"REST + SSE"| API
    end

    RAW --> BUILD
    JD --> BUILD
    BUILD --> ART
    ART --> RANK
    RANK --> OUT
    OUT --> VERIFY
    ART --> API
    ART --> ST
    OUT --> API
    OUT --> ST
    RAW -->|"offset-seek (drawer)"| API
    API -->|"shells out, exactly as organizer"| RANK
```

## Funnel at a glance

```
100,000 ──L0 FAISS──▶ 5,000 ──L1 hybrid──▶ 500 ──L2 cross-enc──▶ 200
  ──L3 composite──▶ 150 ──L4 (pass-thru)──▶ 100 + bench
  ──L5 gate (top-20)──▶ ──L6 honeypot/DQ swap──▶ final 100 + reasoning
```

## Key invariants (do not break)

1. Determinism — no unseeded randomness; SHA-256, never builtin `hash()`.
2. Row alignment — everything keys off `candidate_ids.json`; BM25 carries an
   order-sensitive hash and rank.py refuses to run on mismatch.
3. Offline rank path — `HF_HUB_OFFLINE=1` set before any HF import.
4. Validator rules — 100 rows, monotone scores, id-ascending ties.
5. Zero tolerance — no honeypot/DQ in the final 100, ever.
6. `contracts.py` is a locked interface between phases.
7. 300 s budget — L2 cross-encoder dominates; don't grow `--topk-l1` casually.
