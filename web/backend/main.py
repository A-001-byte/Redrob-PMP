"""main.py — FastAPI backend for the Redrob Ranker web interface (Phase 4).

Thin read-mostly wrapper around the Phase 1-3 artifacts. It never modifies
pipeline code: /api/rerank shells out to `python pipeline\rank.py` exactly as
an organizer would, everything else reads precomputed\ and submission\ from
disk. Heavy artifacts (features.pkl, texts.pkl) are loaded once at startup.

Run:
    cd D:\H2S
    uvicorn web.backend.main:app --port 8000
"""
from __future__ import annotations

import asyncio
import json
import pickle
import re
import sys
import time
from collections import Counter
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PIPELINE_DIR = PROJECT_ROOT / "pipeline"
PRECOMPUTED_DIR = PROJECT_ROOT / "precomputed"
SUBMISSION_DIR = PROJECT_ROOT / "submission"
DATA_DIR = PROJECT_ROOT / "data"
MODELS_DIR = PROJECT_ROOT / "models"

SUBMISSION_CSV = SUBMISSION_DIR / "submission.csv"
DETAILS_JSON = SUBMISSION_DIR / "rank_details.json"
TIMING_JSON = SUBMISSION_DIR / "rank_timing.json"
JSONL_PATH = DATA_DIR / "candidates.jsonl"
OFFSETS_PATH = DATA_DIR / "labeling_candidates.json"

# scorer.py only imports numpy — safe to import without pulling in the
# transformer stack. Used by /api/preview (scoring-only, no re-embedding).
sys.path.insert(0, str(PIPELINE_DIR))
from scorer import (composite_score, consistency_adjustment,  # noqa: E402
                    negative_anchor_penalty, assessment_gate_violations)

RERANK_COOLDOWN_S = 60
PREVIEW_MAX_IDS = 200
_ID_PREFIX_B = re.compile(rb'^\{"candidate_id": "(CAND_\d{7})"')

# Rough elapsed-time stage map for the SSE stream: rank.py prints nothing
# between launch and the L2 line (~40s in), so early stages are timed from
# the measured rank_timing.json profile (load 4s, L0+L1 <1s, CE ~40s).
TIMED_STAGES = [
    (0.0, "Loading artifacts...", 2),
    (5.0, "Searching 100K candidates (FAISS)...", 12),
    (7.0, "Hybrid re-scoring top 5,000...", 16),
    (9.0, "Cross-encoder re-ranking top 500...", 20),
]
EXPECTED_TOTAL_S = 45.0


# ---------------------------------------------------------------------------
# Shared in-memory state
# ---------------------------------------------------------------------------
class State:
    feats: dict[str, dict] = {}
    texts: dict[str, dict] = {}
    canon: dict = {}
    ids: list[str] = []
    row_of: dict[str, int] = {}
    jd: np.ndarray | None = None
    anchors: np.ndarray | None = None
    career: np.ndarray | None = None      # mmap
    summary: np.ndarray | None = None     # mmap
    offsets: dict[str, int] = {}
    offsets_complete: bool = False        # full jsonl scan done
    loaded: bool = False
    rank_details: dict[str, dict] = {}
    gate_data: dict[str, list] = {}
    proxy_sorted: list[tuple[str, float]] = []

    rerank_lock = asyncio.Lock()
    last_rerank_done: float = 0.0


S = State()


@asynccontextmanager
async def lifespan(app: FastAPI):
    with open(PRECOMPUTED_DIR / "features.pkl", "rb") as f:
        S.feats = pickle.load(f)
    with open(PRECOMPUTED_DIR / "texts.pkl", "rb") as f:
        S.texts = pickle.load(f)
    with open(PRECOMPUTED_DIR / "skill_canon.pkl", "rb") as f:
        S.canon = pickle.load(f)
    with open(PRECOMPUTED_DIR / "candidate_ids.json", encoding="utf-8") as f:
        S.ids = json.load(f)
    S.row_of = {cid: i for i, cid in enumerate(S.ids)}
    S.jd = np.load(PRECOMPUTED_DIR / "jd_embedding.npy").reshape(-1)
    S.anchors = np.load(PRECOMPUTED_DIR / "negative_anchors.npy")
    S.career = np.load(PRECOMPUTED_DIR / "career_embeddings.npy", mmap_mode="r")
    S.summary = np.load(PRECOMPUTED_DIR / "summary_embeddings.npy", mmap_mode="r")
    if OFFSETS_PATH.exists():
        with open(OFFSETS_PATH, encoding="utf-8") as f:
            S.offsets = {r["candidate_id"]: r["jsonl_offset"]
                         for r in json.load(f) if r.get("jsonl_offset") is not None}
    if DETAILS_JSON.exists():
        with open(DETAILS_JSON, encoding="utf-8") as f:
            S.rank_details = json.load(f)
    gate_path = PRECOMPUTED_DIR / "gate_data.pkl"
    if gate_path.exists():
        with open(gate_path, "rb") as f:
            S.gate_data = pickle.load(f)
    _proxy_list: list[tuple[str, float]] = []
    for _cid, _rec in S.feats.items():
        if (_rec.get("matched_required_skills")
                and not _rec.get("disqualifier_flag")
                and not _rec.get("is_honeypot")):
            _p = (_rec["career_score"] * 0.30 + _rec["skill_score"] * 0.20
                  + _rec["experience_score"] * 0.10 + _rec["assessment_score"] * 0.15
                  ) * _rec["availability_multiplier"]
            _proxy_list.append((_cid, _p))
    S.proxy_sorted = sorted(_proxy_list, key=lambda t: (-t[1], t[0]))
    S.loaded = True
    yield


app = FastAPI(
    title="Redrob Ranker",
    description="""
Intelligent candidate ranking system for the Redrob Hackathon (Track 01).

Ranks 100,000 candidates against a Senior AI Engineer job description using a
six-layer pipeline: FAISS retrieval → hybrid SBERT+BM25 (RRF) → cross-encoder
re-rank → composite scoring → assessment gate → honeypot check.

**Key endpoints:**
- `GET /api/results` — top-100 ranked candidates with score breakdowns
- `GET /api/candidate/{id}` — full profile + rank detail for any candidate
- `GET /api/explain/{id}` — **structured explanation**: strengths, weaknesses, improvement paths, rank context (works for all 100K candidates)
- `GET /api/fairness` — adverse-impact audit report
- `GET /api/talent-market` — supply-side intelligence over the qualified pool
- `POST /api/rerank` — trigger a fresh ranking run (SSE stream, ~45s)

**Reproduce the submission:**
```
python pipeline/rank.py --precomputed precomputed/ --out submission/submission.csv
```

**GitHub:** https://github.com/A-001-byte/Redrob-PMP
**HuggingFace Space:** https://huggingface.co/spaces/Buster01/redrob-ranker
    """,
    version="1.0.0",
    contact={"name": "Team PMP"},
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"https://.*\.hf\.space",
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
PART_KEYS = ["semantic", "career", "skill", "experience", "assessment",
             "trajectory", "consistency", "anchor_penalty"]


def read_submission() -> list[dict]:
    """submission.csv rows as dicts; [] when the file doesn't exist yet."""
    if not SUBMISSION_CSV.exists():
        return []
    import csv
    with open(SUBMISSION_CSV, encoding="utf-8", newline="") as f:
        return [{"candidate_id": r["candidate_id"], "rank": int(r["rank"]),
                 "score": float(r["score"]), "reasoning": r["reasoning"]}
                for r in csv.DictReader(f)]


def read_details() -> dict[str, dict]:
    if not DETAILS_JSON.exists():
        return {}
    with open(DETAILS_JSON, encoding="utf-8") as f:
        return json.load(f)


def generated_at() -> str | None:
    if not SUBMISSION_CSV.exists():
        return None
    ts = SUBMISSION_CSV.stat().st_mtime
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def fetch_raw(candidate_id: str) -> dict | None:
    """Raw profile from candidates.jsonl. Seek via known offset; otherwise do
    one full scan that caches every line offset for the process lifetime."""
    offset = S.offsets.get(candidate_id)
    with open(JSONL_PATH, "rb") as f:
        if offset is not None:
            f.seek(offset)
            line = f.readline()
            m = _ID_PREFIX_B.match(line)
            if m and m.group(1).decode("ascii") == candidate_id:
                return json.loads(line)
            f.seek(0)  # stale offset — fall through to scan
        if S.offsets_complete:
            return None
        target_line = None
        pos = 0
        for line in f:
            m = _ID_PREFIX_B.match(line)
            if m:
                cid = m.group(1).decode("ascii")
                S.offsets[cid] = pos
                if cid == candidate_id:
                    target_line = line
            pos += len(line)
        S.offsets_complete = True
        return json.loads(target_line) if target_line else None


def candidate_summary_fields(cid: str) -> dict:
    rec = S.feats.get(cid, {})
    return {
        "title": rec.get("current_title") or "",
        "location": rec.get("location") or "",
        "country": rec.get("country") or "",
        "yoe": rec.get("years_of_experience"),
        "availability_multiplier": rec.get("availability_multiplier"),
        "disqualifier_flag": bool(rec.get("disqualifier_flag", False)),
        "is_honeypot": bool(rec.get("is_honeypot", False)),
        # JD skill evidence for the frontend coverage views (small lists).
        "matched_required_skills": rec.get("matched_required_skills") or [],
        "matched_nicetohave_skills": rec.get("matched_nicetohave_skills") or [],
    }


def location_bucket(rec: dict) -> str:
    loc = str(rec.get("location") or "").lower()
    country = str(rec.get("country") or "").lower()
    if "pune" in loc:
        return "Pune"
    if "noida" in loc:
        return "Noida"
    if country == "india":
        return "Other India"
    return "International"


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    model_cached = (MODELS_DIR /
                    "models--cross-encoder--ms-marco-MiniLM-L-6-v2").exists()
    return {"status": "ok", "artifacts_loaded": S.loaded,
            "model_cached": model_cached}


@app.get("/api/results",
         summary="Get ranked candidates",
         description="Returns the current top-100 ranked candidates with score breakdowns")
def results():
    rows = read_submission()
    details = read_details()
    candidates = []
    for r in rows:
        cid = r["candidate_id"]
        parts_src = (details.get(cid) or {}).get("parts") or {}
        candidates.append({
            **r,
            "parts": {k: parts_src.get(k, 0.0) for k in PART_KEYS},
            **candidate_summary_fields(cid),
        })
    return {"candidates": candidates, "generated_at": generated_at(),
            "total_count": len(candidates)}


@app.get("/api/candidate/{candidate_id}")
def candidate(candidate_id: str):
    rec = S.feats.get(candidate_id)
    if rec is None:
        raise HTTPException(404, f"{candidate_id} not found")
    txt = S.texts.get(candidate_id) or {}
    details = read_details().get(candidate_id)

    raw = fetch_raw(candidate_id) or {}
    profile = raw.get("profile") or {}
    rs = raw.get("redrob_signals") or {}
    history = sorted((raw.get("career_history") or []),
                     key=lambda j: str(j.get("start_date") or ""), reverse=True)

    return {
        "candidate_id": candidate_id,
        "current_role": {
            "title": profile.get("current_title") or rec.get("current_title"),
            "company": profile.get("current_company"),
            "company_size": profile.get("current_company_size"),
            "industry": profile.get("current_industry"),
            "location": profile.get("location") or rec.get("location"),
            "country": profile.get("country") or rec.get("country"),
            "years_of_experience": rec.get("years_of_experience"),
            "headline": profile.get("headline"),
        },
        "career_history": [{
            "title": j.get("title"), "company": j.get("company"),
            "duration_months": j.get("duration_months"),
            "is_current": bool(j.get("is_current")),
            "industry": j.get("industry"),
            "company_size": j.get("company_size"),
            "start_date": j.get("start_date"),
            "description": j.get("description"),
        } for j in history],
        "education": [{
            "degree": e.get("degree"), "field": e.get("field_of_study"),
            "institution": e.get("institution"), "tier": e.get("tier"),
            "grade": e.get("grade"),
        } for e in (raw.get("education") or [])],
        "matched_skills": {
            "required": rec.get("matched_required_skills") or [],
            "nice_to_have": rec.get("matched_nicetohave_skills") or [],
        },
        "behavioral": {
            "last_active_date": rs.get("last_active_date"),
            "days_inactive": rec.get("days_inactive"),
            "recruiter_response_rate": rec.get("recruiter_response_rate"),
            "interview_completion_rate": rec.get("interview_completion_rate"),
            "offer_acceptance_rate": rec.get("offer_acceptance_rate"),
            "notice_period_days": rec.get("notice_period_days"),
            "open_to_work": bool(rec.get("open_to_work_flag")),
            "willing_to_relocate": rs.get("willing_to_relocate"),
            "preferred_work_mode": rs.get("preferred_work_mode"),
            "github_activity_score": rec.get("github_activity_score"),
            "saved_by_recruiters_30d": rec.get("saved_by_recruiters_30d"),
            "applications_submitted_30d": rec.get("applications_submitted_30d"),
        },
        "system_scores": {
            "career_score": rec.get("career_score"),
            "career_subscores": {
                "company_type": rec.get("company_type_score"),
                "role_relevance": rec.get("role_relevance_score"),
                "production_signal": rec.get("production_signal"),
                "domain_indicator": rec.get("domain_indicator"),
                "tenure_stability": rec.get("tenure_stability"),
            },
            "skill_score": rec.get("skill_score"),
            "experience_score": rec.get("experience_score"),
            "experience_subscores": {
                "yoe_fit": rec.get("yoe_fit"),
                "location_fit": rec.get("location_fit"),
                "education_tier": rec.get("education_tier_score"),
            },
            "assessment_score": rec.get("assessment_score"),
            "trajectory_adjustment": rec.get("trajectory_adjustment"),
            "availability_multiplier": rec.get("availability_multiplier"),
            "disqualifier_flag": bool(rec.get("disqualifier_flag")),
            "disqualifier_reasons": rec.get("disqualifier_reasons") or [],
            "is_honeypot": bool(rec.get("is_honeypot")),
            "honeypot_reasons": rec.get("honeypot_reasons") or [],
        },
        "rank_detail": details,            # null unless in current top 100
        "career_text": txt.get("career_text") or "",
        "summary_text": txt.get("summary_text") or "",
    }


@app.get("/api/metrics")
def metrics():
    rows = read_submission()
    top = [r["candidate_id"] for r in rows]
    feats = [S.feats.get(cid, {}) for cid in top]
    scores = [r["score"] for r in rows]

    loc_counts = Counter(location_bucket(rec) for rec in feats)
    title_counts = Counter(str(rec.get("current_title") or "Unknown")
                           for rec in feats)

    last_run = None
    funnel = None
    l5_demotions = l6_replacements = 0
    if TIMING_JSON.exists():
        with open(TIMING_JSON, encoding="utf-8") as f:
            timing = json.load(f)
        last_run = (timing.get("timings_s") or {}).get("total")
        funnel = timing.get("funnel")          # [L0, L1, L2, L3, final]
        l5_demotions = len(timing.get("l5_demotions") or [])
        l6_replacements = len(timing.get("l6_replacements") or [])

    return {
        "funnel": {
            "corpus": len(S.ids),
            "stages": funnel,
            "l5_demotions": l5_demotions,
            "l6_replacements": l6_replacements,
        } if funnel else None,
        "honeypot_count": sum(1 for r in feats if r.get("is_honeypot")),
        "disqualified_count": sum(1 for r in feats
                                  if r.get("disqualifier_flag")),
        "mean_score_top10": round(float(np.mean(scores[:10])), 4)
                            if scores else None,
        "mean_score_top50": round(float(np.mean(scores[:50])), 4)
                            if scores else None,
        "total_count": len(rows),
        "location_distribution": {b: loc_counts.get(b, 0) for b in
                                  ["Pune", "Noida", "Other India",
                                   "International"]},
        "title_distribution": [{"title": t, "count": c}
                               for t, c in title_counts.most_common(5)],
        "last_run_time_seconds": last_run,
        "generated_at": generated_at(),
    }


@app.get("/api/fairness",
         summary="Bias audit report",
         description="Returns the bias audit report (impact ratios by education, location, YoE, company background)")
def fairness():
    """Adverse-impact audit JSON (read fresh so a re-generated report shows
    without a server restart)."""
    path = SUBMISSION_DIR / "fairness_report.json"
    if not path.exists():
        raise HTTPException(
            404, "fairness report not generated — run "
                 "`python pipeline/fairness_audit.py` first")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/talent-market")
def talent_market():
    """Supply-side intelligence: aggregate signals over the full 100K pool,
    scoped to the qualified sub-pool (≥1 matched required skill, not DQ, not
    honeypot).  All data comes from the in-memory feats dict — no I/O."""
    qualified = [
        (cid, rec) for cid, rec in S.feats.items()
        if rec.get("matched_required_skills")
        and not rec.get("disqualifier_flag")
        and not rec.get("is_honeypot")
    ]

    total = len(S.feats)
    q_count = len(qualified)

    # Per-skill supply in the qualified pool
    skill_counts: Counter = Counter()
    for _, rec in qualified:
        for s in rec.get("matched_required_skills") or []:
            skill_counts[s] += 1

    # Stack depth: how many required skills each candidate matches
    stack_counts: Counter = Counter()
    for _, rec in qualified:
        n = len(rec.get("matched_required_skills") or [])
        stack_counts[n] += 1

    # Location depth
    loc_data: dict[str, dict] = {}
    for _, rec in qualified:
        loc = location_bucket(rec)
        if loc not in loc_data:
            loc_data[loc] = {"count": 0, "yoe_sum": 0.0, "yoe_n": 0,
                             "open_to_work": 0, "active_30d": 0}
        d = loc_data[loc]
        d["count"] += 1
        yoe = rec.get("years_of_experience")
        if yoe is not None:
            d["yoe_sum"] += yoe
            d["yoe_n"] += 1
        if rec.get("open_to_work_flag"):
            d["open_to_work"] += 1
        if (rec.get("days_inactive") or 999) < 30:
            d["active_30d"] += 1

    location_depth = sorted(
        [
            {
                "location": loc,
                "count": d["count"],
                "mean_yoe": round(d["yoe_sum"] / d["yoe_n"], 1) if d["yoe_n"] else None,
                "open_to_work_pct": round(d["open_to_work"] / d["count"] * 100, 1),
                "active_30d_pct": round(d["active_30d"] / d["count"] * 100, 1),
            }
            for loc, d in loc_data.items()
        ],
        key=lambda x: -x["count"],
    )

    # YoE distribution
    yoe_bands = [("< 2", 0, 2), ("2–5", 2, 5), ("5–8", 5, 8),
                 ("8–12", 8, 12), ("12+", 12, 9999)]
    yoe_dist = [
        {
            "band": label,
            "count": sum(
                1 for _, rec in qualified
                if rec.get("years_of_experience") is not None
                and lo <= rec["years_of_experience"] < hi
            ),
        }
        for label, lo, hi in yoe_bands
    ]

    # Availability signals over the qualified pool
    open_to_work = sum(1 for _, rec in qualified if rec.get("open_to_work_flag"))
    short_notice = sum(1 for _, rec in qualified
                       if (rec.get("notice_period_days") or 9999) <= 30)
    active_30d = sum(1 for _, rec in qualified
                     if (rec.get("days_inactive") or 9999) < 30)
    high_response = sum(1 for _, rec in qualified
                        if (rec.get("recruiter_response_rate") or 0) >= 0.6)

    return {
        "pool": {
            "total": total,
            "qualified": q_count,
            "qualified_pct": round(q_count / total * 100, 1) if total else 0,
        },
        "availability": {
            "open_to_work": open_to_work,
            "open_to_work_pct": round(open_to_work / q_count * 100, 1) if q_count else 0,
            "short_notice_30d": short_notice,
            "short_notice_pct": round(short_notice / q_count * 100, 1) if q_count else 0,
            "active_30d": active_30d,
            "active_30d_pct": round(active_30d / q_count * 100, 1) if q_count else 0,
            "high_response_rate": high_response,
            "high_response_pct": round(high_response / q_count * 100, 1) if q_count else 0,
        },
        "skill_supply": [{"skill": s, "count": c}
                         for s, c in skill_counts.most_common(15)],
        "stack_depth": [{"skills": k, "count": stack_counts[k]}
                        for k in sorted(stack_counts)],
        "location_depth": location_depth,
        "yoe_distribution": yoe_dist,
    }


# ---------------------------------------------------------------------------
# Explanation helpers for /api/explain
# ---------------------------------------------------------------------------
_REQUIRED_SKILLS = [
    "embedding models", "vector search & retrieval",
    "Python", "ranking & evaluation",
]
_COMP_WEIGHTS = {
    "semantic": 0.25, "career": 0.30, "skill": 0.20,
    "experience": 0.10, "assessment": 0.15,
}
_COMP_LABELS = {
    "semantic": "Semantic alignment", "career": "Career trajectory",
    "skill": "JD skill match", "experience": "Experience fit",
    "assessment": "Assessment scores",
}


def _career_expl(s: float) -> str:
    if s > 0.80:
        return ("Strong product-company career with production ML deployments "
                "and retrieval domain experience")
    if s > 0.60:
        return "Solid ML career; some IT-services exposure or adjacent roles present"
    if s > 0.40:
        return "Mixed career background; limited direct ML/AI product-company experience"
    return "Career history primarily in non-ML or IT-services roles"


def _skill_expl(rec: dict) -> str:
    matched = set(rec.get("matched_required_skills") or [])
    n = len(matched)
    missing = [s for s in _REQUIRED_SKILLS if s not in matched]
    if missing:
        return f"Matches {n} of 4 required skill groups; missing: {', '.join(missing)}"
    return "Matches all 4 required skill groups"


def _experience_expl(rec: dict) -> str:
    yoe = rec.get("years_of_experience")
    yf, lf, ef = rec.get("yoe_fit", 0.0), rec.get("location_fit", 0.0), rec.get("education_tier_score", 0.0)
    loc = rec.get("location") or "Unknown"

    def yoe_lbl(f: float) -> str:
        return ("target range" if f >= 1.0 else "adjacent" if f >= 0.7
                else "outer range" if f >= 0.4 else "outside target range")

    def loc_lbl(f: float) -> str:
        return ("target location" if f >= 1.0 else "tier-1 India" if f >= 0.8
                else "willing to relocate" if f >= 0.65 else "other India" if f >= 0.3
                else "international")

    def edu_lbl(f: float) -> str:
        return ("Tier-1" if f >= 1.0 else "Tier-2" if f >= 0.8
                else "Tier-3" if f >= 0.6 else "Tier-4 or unknown")

    yoe_str = f"{yoe:.1f} yrs" if yoe is not None else "unknown"
    return f"YoE {yoe_str} ({yoe_lbl(yf)}); {loc} ({loc_lbl(lf)}); {edu_lbl(ef)} education"


def _assessment_expl(s: float) -> str:
    if s == 0:
        return "No Redrob assessment data available for JD-relevant skills"
    return f"Redrob assessment average: {s * 100:.0f}/100 across JD-relevant skills"


def _comp_expl(factor: str, rec: dict, sem: float | None) -> str:
    if factor == "semantic":
        if sem is None:
            return "Semantic score not available for candidates outside top-100"
        return f"Semantic alignment with JD: {sem:.3f} (career description language match)"
    if factor == "career":   return _career_expl(rec["career_score"])
    if factor == "skill":    return _skill_expl(rec)
    if factor == "experience": return _experience_expl(rec)
    if factor == "assessment": return _assessment_expl(rec["assessment_score"])
    return ""


def build_explanation(candidate_id: str) -> dict:
    rec = S.feats[candidate_id]
    detail = S.rank_details.get(candidate_id)
    in_top100 = detail is not None

    cs = rec["career_score"]
    ss = rec["skill_score"]
    es = rec["experience_score"]
    asmt = rec["assessment_score"]
    avail = rec["availability_multiplier"]
    matched_req = set(rec.get("matched_required_skills") or [])

    if in_top100:
        parts = detail["parts"]
        sem = parts["semantic"] / _COMP_WEIGHTS["semantic"]
        composite = detail["composite"]
        rank = detail["rank"]
        traj = parts.get("trajectory", 0.0)
        cons = parts.get("consistency", 0.0)
        anchor = -parts.get("anchor_penalty", 0.0)
    else:
        sem = None
        proxy = (cs * 0.30 + ss * 0.20 + es * 0.10 + asmt * 0.15) * avail
        composite = proxy
        rank = None
        traj = rec.get("trajectory_adjustment", 0.0)
        cons = 0.0
        anchor = 0.0

    contribs: dict[str, float | None] = {
        "semantic":   sem * _COMP_WEIGHTS["semantic"] if sem is not None else None,
        "career":     cs  * _COMP_WEIGHTS["career"],
        "skill":      ss  * _COMP_WEIGHTS["skill"],
        "experience": es  * _COMP_WEIGHTS["experience"],
        "assessment": asmt * _COMP_WEIGHTS["assessment"],
    }

    all_comps = [
        {
            "factor": f,
            "label":  _COMP_LABELS[f],
            "value":  round(sem if f == "semantic" else rec.get(f"{f}_score", 0.0), 4)
                      if (f != "semantic" or sem is not None) else None,
            "weight": _COMP_WEIGHTS[f],
            "weighted_contribution": round(contribs[f], 4),
            "explanation": _comp_expl(f, rec, sem),
        }
        for f in ["semantic", "career", "skill", "experience", "assessment"]
        if contribs[f] is not None
    ]

    strengths = sorted([c for c in all_comps if c["weighted_contribution"] > 0.15],
                       key=lambda c: -c["weighted_contribution"])
    weaknesses = sorted([c for c in all_comps if c["weighted_contribution"] < 0.08],
                        key=lambda c: c["weighted_contribution"])

    adjustments = {
        "trajectory": traj, "consistency": cons, "anchor_penalty": anchor,
        "availability_multiplier": avail,
        "disqualifier": bool(rec.get("disqualifier_flag")),
        "honeypot": bool(rec.get("is_honeypot")),
    }

    violations = assessment_gate_violations(S.gate_data.get(candidate_id))
    gate_status = {"passes_l5_gate": not violations, "violations": violations}

    # Improvement paths (up to 3)
    paths: list[dict] = []
    missing_skills = [s for s in _REQUIRED_SKILLS if s not in matched_req]
    if asmt < 0.50:
        delta = (0.80 - asmt) * _COMP_WEIGHTS["assessment"] * avail
        paths.append({
            "action": "Complete Redrob skill assessments for JD-required skills",
            "impact": f"Could improve assessment_score from {asmt:.2f} to ~0.80 (+{delta:.3f} composite)",
            "effort": "low",
        })
    if len(matched_req) < 3 and missing_skills:
        target = min(ss + 0.30, 1.0)
        delta = (target - ss) * _COMP_WEIGHTS["skill"] * avail
        paths.append({
            "action": f"Highlight {', '.join(missing_skills[:2])} experience more explicitly in career descriptions",
            "impact": f"Could improve skill_score from {ss:.2f} toward {target:.2f} (+{delta:.3f} composite)",
            "effort": "medium",
        })
    if avail < 0.90:
        base_no_avail = cs * 0.30 + ss * 0.20 + es * 0.10 + asmt * 0.15
        delta = (1.10 - avail) * base_no_avail
        paths.append({
            "action": "Update profile activity and response rate on Redrob",
            "impact": f"Could improve availability multiplier from {avail:.2f} to ~1.10 (+{delta:.3f} composite)",
            "effort": "low",
        })
    lf = rec.get("location_fit", 0.0)
    if lf < 0.65 and len(paths) < 3:
        delta = (0.65 - lf) * 0.35 * _COMP_WEIGHTS["experience"] * avail
        paths.append({
            "action": "Enable willing_to_relocate flag for Pune/Noida",
            "impact": f"Could improve location_fit component (+{delta:.3f} composite)",
            "effort": "low",
        })
    if cs < 0.60 and len(paths) < 3:
        paths.append({
            "action": "Add quantified production deployment metrics to career descriptions",
            "impact": "Production signal and domain indicator are currently low; adding them raises career_score",
            "effort": "high",
        })
    paths = paths[:3]

    # Rank context
    if in_top100:
        by_rank = {v["rank"]: v["composite"] for v in S.rank_details.values()}
        r1, r10, r100 = by_rank.get(1, composite), by_rank.get(10, composite), by_rank.get(100, composite)
        rank_context: dict = {
            "rank": rank,
            "score": round(composite, 4),
            "score_vs_rank1":   round(composite - r1,   4),
            "score_vs_rank10":  round(composite - r10,  4),
            "score_vs_rank100": round(composite - r100, 4),
            "in_top_100": True,
            "estimated_rank_if_not_in_top100": None,
        }
    else:
        est_rank = sum(1 for _, s in S.proxy_sorted if s > composite) + 1
        rank_context = {
            "rank": None,
            "score": None,
            "estimated_score": round(composite, 4),
            "estimated_score_note": (
                "Proxy score (career*0.30 + skill*0.20 + experience*0.10 "
                "+ assessment*0.15) * availability; excludes semantic component"),
            "score_vs_rank1": None, "score_vs_rank10": None, "score_vs_rank100": None,
            "in_top_100": False,
            "estimated_rank_if_not_in_top100": est_rank,
        }

    if in_top100:
        dom = strengths[0] if strengths else None
        gap = weaknesses[0] if weaknesses else None
        dom_str = (f"{dom['label']} is the dominant strength "
                   f"({dom['weighted_contribution']:.3f} weighted).") if dom else ""
        gap_str = f"Main gap is {gap['label'].lower()} coverage." if gap else ""
        summary = f"Rank #{rank} of 100. {dom_str} {gap_str}".strip()
    else:
        summary = (f"Not in current top-100. Estimated rank "
                   f"~{rank_context['estimated_rank_if_not_in_top100']} in the "
                   f"qualified pool (proxy score {round(composite, 4)}, excludes semantic).")

    out: dict = {
        "candidate_id": candidate_id,
        "rank": rank,
        "composite_score": round(composite, 4),
        "strengths": strengths,
        "weaknesses": weaknesses,
        "adjustments": adjustments,
        "gate_status": gate_status,
        "improvement_paths": paths,
        "rank_context": rank_context,
        "summary": summary,
    }
    if not in_top100:
        out["estimated_score"] = round(composite, 4)
        out["estimated_score_note"] = (
            "Proxy score (career*0.30 + skill*0.20 + experience*0.10 "
            "+ assessment*0.15) * availability; excludes semantic component")
    return out


@app.get("/api/explain/{candidate_id}",
         summary="Structured explanation of rank position",
         description=(
             "Returns strengths, weaknesses, improvement paths, and rank context "
             "for any candidate in the 100K corpus — not just the top-100. "
             "For candidates outside the top-100, the semantic component is unavailable "
             "and an estimated proxy score is returned instead."))
def explain(candidate_id: str):
    if candidate_id not in S.feats:
        raise HTTPException(status_code=404,
                            detail=f"Candidate {candidate_id} not found")
    return build_explanation(candidate_id)


@app.get("/api/export")
def export_csv():
    if not SUBMISSION_CSV.exists():
        raise HTTPException(404, "no submission yet — run a ranking first")
    return FileResponse(SUBMISSION_CSV, media_type="text/csv",
                        filename="submission.csv")


# ---------------------------------------------------------------------------
# POST /api/rerank — run rank.py, stream progress as SSE
# ---------------------------------------------------------------------------
LINE_STAGES = [
    # (stdout marker, stage message, progress %)
    ("L2 cross-encoder:", "Computing composite scores...", 88),
    ("funnel:", "Finalizing top 100...", 95),
    ("wrote ", "Writing submission.csv...", 98),
]


async def rerank_stream():
    t0 = time.time()
    cmd = [sys.executable, "-u", str(PIPELINE_DIR / "rank.py"),
           "--precomputed", str(PRECOMPUTED_DIR),
           "--out", str(SUBMISSION_CSV)]
    proc = await asyncio.create_subprocess_exec(
        *cmd, cwd=str(PROJECT_ROOT),
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)

    yield sse("stage", {"message": TIMED_STAGES[0][1],
                        "progress": TIMED_STAGES[0][2]})
    timed_idx, log_stage_hit = 1, False
    try:
        while True:
            try:
                line_b = await asyncio.wait_for(proc.stdout.readline(),
                                                timeout=2.0)
            except asyncio.TimeoutError:
                elapsed = time.time() - t0
                # advance timed stages until the first real log line arrives
                if not log_stage_hit and timed_idx < len(TIMED_STAGES) \
                        and elapsed >= TIMED_STAGES[timed_idx][0]:
                    _, msg, pct = TIMED_STAGES[timed_idx]
                    timed_idx += 1
                    yield sse("stage", {"message": msg, "progress": pct})
                elif not log_stage_hit:
                    # crawl progress toward 85% while the cross-encoder runs
                    pct = min(85, 20 + int(65 * elapsed / EXPECTED_TOTAL_S))
                    yield sse("progress", {"progress": pct,
                                           "elapsed": round(elapsed, 1)})
                continue
            if not line_b:
                break
            line = line_b.decode("utf-8", errors="replace").rstrip()
            if not line:
                continue
            yield sse("log", {"line": line})
            for marker, msg, pct in LINE_STAGES:
                if line.startswith(marker):
                    log_stage_hit = True
                    yield sse("stage", {"message": msg, "progress": pct})
                    break

        code = await proc.wait()
        elapsed = round(time.time() - t0, 1)
        if code != 0:
            yield sse("error", {"message": f"rank.py exited with code {code}",
                                "elapsed": elapsed})
            return
        S.last_rerank_done = time.time()
        yield sse("complete", {"elapsed": elapsed, "progress": 100,
                               **results()})
    finally:
        if proc.returncode is None:
            proc.kill()
        S.rerank_lock.release()


@app.post("/api/rerank",
          summary="Trigger ranking run",
          description="Triggers a fresh ranking run (SSE stream, ~45s, 60s cooldown)")
async def rerank():
    since = time.time() - S.last_rerank_done
    if S.last_rerank_done and since < RERANK_COOLDOWN_S:
        raise HTTPException(429, f"cooldown: wait "
                            f"{int(RERANK_COOLDOWN_S - since)}s before "
                            f"re-ranking again")
    if S.rerank_lock.locked():
        raise HTTPException(409, "a ranking run is already in progress")
    await S.rerank_lock.acquire()   # released in rerank_stream's finally
    return StreamingResponse(rerank_stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache",
                                      "X-Accel-Buffering": "no"})


# ---------------------------------------------------------------------------
# POST /api/preview — scoring-only ranking of an uploaded id subset
# ---------------------------------------------------------------------------
class PreviewRequest(BaseModel):
    candidate_ids: list[str] = Field(..., max_length=PREVIEW_MAX_IDS)


def _minmax(x: np.ndarray) -> np.ndarray:
    lo, hi = float(x.min()), float(x.max())
    if hi <= lo:
        return np.zeros_like(x)
    return (x - lo) / (hi - lo)


@app.post("/api/preview")
def preview(req: PreviewRequest):
    seen: set[str] = set()
    wanted = [cid for cid in (c.strip() for c in req.candidate_ids)
              if cid and cid not in seen and not seen.add(cid)]
    known = [cid for cid in wanted if cid in S.row_of and cid in S.feats]
    unknown = [cid for cid in wanted if cid not in known]
    if not known:
        return {"results": [], "unknown_ids": unknown, "total_scored": 0}

    rows = np.array([S.row_of[cid] for cid in known])
    dense = np.asarray(S.career[rows]) @ S.jd      # L2-normalised -> cosine
    sem_norm = _minmax(dense)

    scored = []
    for cid, sem, row in zip(known, sem_norm.tolist(), rows.tolist()):
        cons = consistency_adjustment(
            S.summary[row], S.career[row],
            (S.texts.get(cid) or {}).get("summary_text"))
        pen = negative_anchor_penalty(np.asarray(S.career[row]), S.anchors)
        comp, base, parts = composite_score(S.feats[cid], sem, cons, pen)
        scored.append((cid, comp, parts))

    scored.sort(key=lambda t: (-t[1], t[0]))
    return {
        "results": [{
            "candidate_id": cid, "rank": i + 1, "score": round(comp, 4),
            "parts": {k: parts.get(k, 0.0) for k in PART_KEYS},
            **candidate_summary_fields(cid),
        } for i, (cid, comp, parts) in enumerate(scored)],
        "unknown_ids": unknown,
        "total_scored": len(scored),
        "note": "scoring-only preview: dense semantic + composite, no "
                "cross-encoder layer (subset min-max normalised)",
    }
