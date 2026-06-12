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
                    negative_anchor_penalty)

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
    S.loaded = True
    yield


app = FastAPI(title="Redrob Ranker API", lifespan=lifespan)

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


@app.get("/api/results")
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


@app.post("/api/rerank")
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
