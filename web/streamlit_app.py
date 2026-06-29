"""streamlit_app.py — HuggingFace Spaces entry point for Glasshouse.

Pure-Streamlit replica of the React app's key views (metrics bar, ranked
table, candidate profile dialog, scoring-only subset preview, re-rank with
live progress). Loads the precomputed artifacts directly — no FastAPI
process needed, which keeps the Space to a single server.

Design system: UI UX Pro Max "Glasshouse" — Data-Dense Dashboard.
Fira Code / Fira Sans, primary #1E40AF, accent #D97706, status colors only.

Run locally:
    streamlit run web\\streamlit_app.py
"""
from __future__ import annotations

import csv
import json
import pickle
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import streamlit as st

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PIPELINE_DIR = PROJECT_ROOT / "pipeline"
PRECOMPUTED_DIR = PROJECT_ROOT / "precomputed"
SUBMISSION_CSV = PROJECT_ROOT / "submission" / "submission.csv"
DETAILS_JSON = PROJECT_ROOT / "submission" / "rank_details.json"
TIMING_JSON = PROJECT_ROOT / "submission" / "rank_timing.json"
FAIRNESS_JSON = PROJECT_ROOT / "submission" / "fairness_report.json"
JSONL_PATH = PROJECT_ROOT / "data" / "candidates.jsonl"
OFFSETS_PATH = PROJECT_ROOT / "data" / "labeling_candidates.json"

sys.path.insert(0, str(PIPELINE_DIR))
from scorer import (composite_score, consistency_adjustment,  # noqa: E402
                    negative_anchor_penalty, assessment_gate_violations)

RERANK_COOLDOWN_S = 60
PREVIEW_MAX_IDS = 200
_ID_RE = re.compile(r"CAND_\d{7}")
_ID_PREFIX_B = re.compile(rb'^\{"candidate_id": "(CAND_\d{7})"')

# Design-system tokens (generated palette, verbatim).
C = {
    "primary": "#5B21B6", "secondary": "#E55B44", "accent": "#059669",
    "background": "#FAF5EB", "foreground": "#1F1625", "muted": "#6B5B7B",
    "border": "#E6DEC9", "destructive": "#DC2626",
    "good": "#059669", "warn": "#D97706", "low": "#0284C7",
}
PART_COLORS = {"semantic": "#E55B44", "career": "#5B21B6", "skill": "#059669",
               "experience": "#D97706", "assessment": "#059669"}

st.set_page_config(page_title="Glasshouse", page_icon="📡", layout="wide")

st.markdown(f"""
<style>
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
html, body, [class*="st-"] {{ font-family: 'Fira Sans', sans-serif; }}
h1, h2, h3, code, .metric-value {{ font-family: 'Fira Code', monospace; }}
.stApp {{ background-color: {C['background']}; }}
div[data-testid="stMetricValue"] {{ font-family: 'Fira Code', monospace; }}
</style>
""", unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Cached artifact loading
# ---------------------------------------------------------------------------
@st.cache_resource(show_spinner="Loading features.pkl…")
def load_feats() -> dict[str, dict]:
    with open(PRECOMPUTED_DIR / "features.pkl", "rb") as f:
        return pickle.load(f)


@st.cache_resource(show_spinner="Loading texts.pkl…")
def load_texts() -> dict[str, dict]:
    with open(PRECOMPUTED_DIR / "texts.pkl", "rb") as f:
        return pickle.load(f)


@st.cache_resource
def load_vectors():
    with open(PRECOMPUTED_DIR / "candidate_ids.json", encoding="utf-8") as f:
        ids = json.load(f)
    return {
        "row_of": {cid: i for i, cid in enumerate(ids)},
        "jd": np.load(PRECOMPUTED_DIR / "jd_embedding.npy").reshape(-1),
        "anchors": np.load(PRECOMPUTED_DIR / "negative_anchors.npy"),
        "career": np.load(PRECOMPUTED_DIR / "career_embeddings.npy",
                          mmap_mode="r"),
        "summary": np.load(PRECOMPUTED_DIR / "summary_embeddings.npy",
                           mmap_mode="r"),
    }


@st.cache_resource(show_spinner=False)
def load_gate_data() -> dict[str, list]:
    gate_path = PRECOMPUTED_DIR / "gate_data.pkl"
    if not gate_path.exists():
        return {}
    with open(gate_path, "rb") as f:
        return pickle.load(f)


@st.cache_data(show_spinner=False)
def compute_proxy_sorted(_mtime_feats: float) -> list[tuple[str, float]]:
    feats = load_feats()
    proxy_list: list[tuple[str, float]] = []
    for cid, rec in feats.items():
        if (rec.get("matched_required_skills")
                and not rec.get("disqualifier_flag")
                and not rec.get("is_honeypot")):
            p = (rec["career_score"] * 0.30 + rec["skill_score"] * 0.20
                 + rec["experience_score"] * 0.10 + rec["assessment_score"] * 0.15
                 ) * rec["availability_multiplier"]
            proxy_list.append((cid, p))
    return sorted(proxy_list, key=lambda t: (-t[1], t[0]))


# Explanation constants shared with main.py logic
_REQUIRED_SKILLS_EX = [
    "embedding models", "vector search & retrieval",
    "Python", "ranking & evaluation",
]
_COMP_WEIGHTS_EX = {"semantic": 0.25, "career": 0.30, "skill": 0.20,
                    "experience": 0.10, "assessment": 0.15}
_COMP_LABELS_EX = {"semantic": "Semantic alignment", "career": "Career trajectory",
                   "skill": "JD skill match", "experience": "Experience fit",
                   "assessment": "Assessment scores"}


def _career_expl_st(s: float) -> str:
    if s > 0.80:
        return "Strong product-company career with production ML deployments and retrieval domain experience"
    if s > 0.60:
        return "Solid ML career; some IT-services exposure or adjacent roles present"
    if s > 0.40:
        return "Mixed career background; limited direct ML/AI product-company experience"
    return "Career history primarily in non-ML or IT-services roles"


def _skill_expl_st(rec: dict) -> str:
    matched = set(rec.get("matched_required_skills") or [])
    missing = [s for s in _REQUIRED_SKILLS_EX if s not in matched]
    return (f"Matches {len(matched)} of 4 required skill groups; missing: {', '.join(missing)}"
            if missing else "Matches all 4 required skill groups")


def _experience_expl_st(rec: dict) -> str:
    yoe = rec.get("years_of_experience")
    yf, lf, ef = rec.get("yoe_fit", 0.0), rec.get("location_fit", 0.0), rec.get("education_tier_score", 0.0)
    loc = rec.get("location") or "Unknown"
    yoe_lbl = "target range" if yf >= 1.0 else "adjacent" if yf >= 0.7 else "outer range" if yf >= 0.4 else "outside target range"
    loc_lbl = "target location" if lf >= 1.0 else "tier-1 India" if lf >= 0.8 else "willing to relocate" if lf >= 0.65 else "other India" if lf >= 0.3 else "international"
    edu_lbl = "Tier-1" if ef >= 1.0 else "Tier-2" if ef >= 0.8 else "Tier-3" if ef >= 0.6 else "Tier-4 or unknown"
    return f"YoE {f'{yoe:.1f} yrs' if yoe is not None else 'unknown'} ({yoe_lbl}); {loc} ({loc_lbl}); {edu_lbl} education"


def build_explanation_st(candidate_id: str, feats: dict, rank_details: dict,
                         gate_data: dict, proxy_sorted: list) -> dict:
    rec = feats[candidate_id]
    detail = rank_details.get(candidate_id)
    in_top100 = detail is not None

    cs, ss, es, asmt = rec["career_score"], rec["skill_score"], rec["experience_score"], rec["assessment_score"]
    avail = rec["availability_multiplier"]
    matched_req = set(rec.get("matched_required_skills") or [])

    if in_top100:
        parts = detail["parts"]
        sem = parts["semantic"] / _COMP_WEIGHTS_EX["semantic"]
        composite, rank = detail["composite"], detail["rank"]
        traj, cons, anchor = parts.get("trajectory", 0.0), parts.get("consistency", 0.0), -parts.get("anchor_penalty", 0.0)
    else:
        sem = None
        composite = (cs * 0.30 + ss * 0.20 + es * 0.10 + asmt * 0.15) * avail
        rank, traj, cons, anchor = None, rec.get("trajectory_adjustment", 0.0), 0.0, 0.0

    def expl(f: str) -> str:
        if f == "semantic":
            return (f"Semantic alignment with JD: {sem:.3f} (career description language match)"
                    if sem is not None else "Semantic score not available for candidates outside top-100")
        if f == "career":     return _career_expl_st(cs)
        if f == "skill":      return _skill_expl_st(rec)
        if f == "experience": return _experience_expl_st(rec)
        if f == "assessment":
            return ("No Redrob assessment data available" if asmt == 0
                    else f"Redrob assessment average: {asmt * 100:.0f}/100 across JD-relevant skills")
        return ""

    contribs = {"semantic": sem * 0.25 if sem is not None else None,
                "career": cs * 0.30, "skill": ss * 0.20,
                "experience": es * 0.10, "assessment": asmt * 0.15}
    all_comps = [
        {"factor": f, "label": _COMP_LABELS_EX[f],
         "value": round(sem if f == "semantic" else rec.get(f"{f}_score", 0.0), 4) if (f != "semantic" or sem is not None) else None,
         "weight": _COMP_WEIGHTS_EX[f],
         "weighted_contribution": round(contribs[f], 4),
         "explanation": expl(f)}
        for f in ["semantic", "career", "skill", "experience", "assessment"]
        if contribs[f] is not None
    ]
    strengths = sorted([c for c in all_comps if c["weighted_contribution"] > 0.15], key=lambda c: -c["weighted_contribution"])
    weaknesses = sorted([c for c in all_comps if c["weighted_contribution"] < 0.08], key=lambda c: c["weighted_contribution"])

    # Improvement paths
    paths: list[dict] = []
    missing_skills = [s for s in _REQUIRED_SKILLS_EX if s not in matched_req]
    if asmt < 0.50:
        paths.append({"action": "Complete Redrob skill assessments for JD-required skills",
                      "impact": f"Could improve assessment_score from {asmt:.2f} to ~0.80 (+{(0.80 - asmt) * 0.15 * avail:.3f} composite)",
                      "effort": "low"})
    if len(matched_req) < 3 and missing_skills:
        target = min(ss + 0.30, 1.0)
        paths.append({"action": f"Highlight {', '.join(missing_skills[:2])} experience more explicitly in career descriptions",
                      "impact": f"Could improve skill_score from {ss:.2f} toward {target:.2f} (+{(target - ss) * 0.20 * avail:.3f} composite)",
                      "effort": "medium"})
    if avail < 0.90:
        base_na = cs * 0.30 + ss * 0.20 + es * 0.10 + asmt * 0.15
        paths.append({"action": "Update profile activity and response rate on Redrob",
                      "impact": f"Could improve availability multiplier from {avail:.2f} to ~1.10 (+{(1.10 - avail) * base_na:.3f} composite)",
                      "effort": "low"})
    lf = rec.get("location_fit", 0.0)
    if lf < 0.65 and len(paths) < 3:
        paths.append({"action": "Enable willing_to_relocate flag for Pune/Noida",
                      "impact": f"Could improve location_fit component (+{(0.65 - lf) * 0.35 * 0.10 * avail:.3f} composite)",
                      "effort": "low"})
    if cs < 0.60 and len(paths) < 3:
        paths.append({"action": "Add quantified production deployment metrics to career descriptions",
                      "impact": "Production signal and domain indicator are currently low; adding them raises career_score",
                      "effort": "high"})

    violations = assessment_gate_violations(gate_data.get(candidate_id))
    if in_top100:
        by_rank = {v["rank"]: v["composite"] for v in rank_details.values()}
        r1, r10, r100 = by_rank.get(1, composite), by_rank.get(10, composite), by_rank.get(100, composite)
        rank_context: dict = {"rank": rank, "score": round(composite, 4),
                              "score_vs_rank1": round(composite - r1, 4),
                              "score_vs_rank10": round(composite - r10, 4),
                              "score_vs_rank100": round(composite - r100, 4),
                              "in_top_100": True}
        dom = strengths[0] if strengths else None
        gap = weaknesses[0] if weaknesses else None
        summary = (f"Rank #{rank} of 100. "
                   + (f"{dom['label']} is the dominant strength ({dom['weighted_contribution']:.3f} weighted). " if dom else "")
                   + (f"Main gap is {gap['label'].lower()} coverage." if gap else "")).strip()
    else:
        est_rank = sum(1 for _, s in proxy_sorted if s > composite) + 1
        rank_context = {"rank": None, "score": None,
                        "estimated_score": round(composite, 4),
                        "in_top_100": False, "estimated_rank_if_not_in_top100": est_rank}
        summary = (f"Not in current top-100. Estimated rank ~{est_rank} in the qualified pool "
                   f"(proxy score {round(composite, 4)}, excludes semantic).")

    return {"candidate_id": candidate_id, "rank": rank, "composite_score": round(composite, 4),
            "strengths": strengths, "weaknesses": weaknesses,
            "adjustments": {"trajectory": traj, "consistency": cons, "anchor_penalty": anchor,
                            "availability_multiplier": avail,
                            "disqualifier": bool(rec.get("disqualifier_flag")),
                            "honeypot": bool(rec.get("is_honeypot"))},
            "gate_status": {"passes_l5_gate": not violations, "violations": violations},
            "improvement_paths": paths[:3], "rank_context": rank_context, "summary": summary}


@st.cache_resource
def runtime_state() -> dict:
    """Cross-rerun mutable state: rerank cooldown + jsonl offset cache."""
    offsets: dict[str, int] = {}
    if OFFSETS_PATH.exists():
        with open(OFFSETS_PATH, encoding="utf-8") as f:
            offsets = {r["candidate_id"]: r["jsonl_offset"]
                       for r in json.load(f)
                       if r.get("jsonl_offset") is not None}
    return {"last_rerank_done": 0.0, "offsets": offsets,
            "offsets_complete": False}


def _mtime(path: Path) -> float:
    return path.stat().st_mtime if path.exists() else 0.0


@st.cache_data
def load_submission(mtime: float) -> list[dict]:
    if not SUBMISSION_CSV.exists():
        return []
    with open(SUBMISSION_CSV, encoding="utf-8", newline="") as f:
        return [{"candidate_id": r["candidate_id"], "rank": int(r["rank"]),
                 "score": float(r["score"]), "reasoning": r["reasoning"]}
                for r in csv.DictReader(f)]


@st.cache_data
def load_details(mtime: float) -> dict[str, dict]:
    if not DETAILS_JSON.exists():
        return {}
    with open(DETAILS_JSON, encoding="utf-8") as f:
        return json.load(f)


def fetch_raw(candidate_id: str) -> dict | None:
    """Raw profile from candidates.jsonl (offset seek, full-scan fallback)."""
    if not JSONL_PATH.exists():
        return None
    state = runtime_state()
    offset = state["offsets"].get(candidate_id)
    with open(JSONL_PATH, "rb") as f:
        if offset is not None:
            f.seek(offset)
            line = f.readline()
            m = _ID_PREFIX_B.match(line)
            if m and m.group(1).decode("ascii") == candidate_id:
                return json.loads(line)
            f.seek(0)
        if state["offsets_complete"]:
            return None
        target = None
        pos = 0
        for line in f:
            m = _ID_PREFIX_B.match(line)
            if m:
                cid = m.group(1).decode("ascii")
                state["offsets"][cid] = pos
                if cid == candidate_id:
                    target = line
            pos += len(line)
        state["offsets_complete"] = True
        return json.loads(target) if target else None


def location_bucket(rec: dict) -> str:
    loc = str(rec.get("location") or "").lower()
    if "pune" in loc:
        return "Pune"
    if "noida" in loc:
        return "Noida"
    if str(rec.get("country") or "").lower() == "india":
        return "Other India"
    return "International"


def v(value, suffix: str = "") -> str:
    if value is None or value == "" or (isinstance(value, (int, float))
                                        and not isinstance(value, bool)
                                        and value < 0):
        return "--"
    return f"{value}{suffix}"


def bar_html(label: str, value: float, max_value: float, color: str) -> str:
    pct = min(100.0, max(0.0, value / max_value * 100)) if max_value else 0
    return (f"<div style='display:flex;align-items:center;gap:8px;"
            f"font-size:12px;margin:2px 0'>"
            f"<span style='width:90px;color:#64748B'>{label}</span>"
            f"<div style='flex:1;height:10px;background:{C['muted']};"
            f"border-radius:3px;overflow:hidden'>"
            f"<div style='width:{pct:.1f}%;height:100%;background:{color}'>"
            f"</div></div>"
            f"<span style='width:48px;text-align:right;"
            f"font-family:Fira Code,monospace'>{value:.3f}</span></div>")


# ---------------------------------------------------------------------------
# Candidate profile dialog (the React app's drawer)
# ---------------------------------------------------------------------------
@st.dialog("Candidate profile", width="large")
def show_profile(candidate_id: str):
    feats = load_feats()
    rec = feats.get(candidate_id)
    if rec is None:
        st.error(f"{candidate_id} not found")
        return
    detail = load_details(_mtime(DETAILS_JSON)).get(candidate_id)
    raw = fetch_raw(candidate_id) or {}
    profile = raw.get("profile") or {}
    rs = raw.get("redrob_signals") or {}

    head = f"`{candidate_id}`"
    if detail:
        head += f" — rank **#{detail['rank']}**, composite **{detail['composite']:.4f}**"
    st.markdown(head)

    st.markdown("#### Current Role")
    st.markdown(
        f"**{v(profile.get('current_title') or rec.get('current_title'))}** @ "
        f"{v(profile.get('current_company'))}  \n"
        f"{v(profile.get('location') or rec.get('location'))}, "
        f"{v(profile.get('country') or rec.get('country'))} · "
        f"{v(rec.get('years_of_experience'))} yrs · "
        f"{v(profile.get('current_industry'))} "
        f"({v(profile.get('current_company_size'))})")
    if profile.get("headline"):
        st.caption(f"“{profile['headline']}”")

    if detail:
        st.markdown("#### Score Breakdown")
        parts = detail["parts"]
        main = ["semantic", "career", "skill", "experience", "assessment"]
        max_main = max(0.3, *(parts.get(k, 0) for k in main))
        html = "".join(bar_html(k.capitalize(), parts.get(k, 0), max_main,
                                PART_COLORS[k]) for k in main)
        st.markdown(html, unsafe_allow_html=True)
        adj = (f"Trajectory: {parts.get('trajectory', 0):+.3f} · "
               f"Consistency: {parts.get('consistency', 0):+.3f} · "
               f"Anchor penalty: {-parts.get('anchor_penalty', 0):+.3f} · "
               f"Availability: ×{parts.get('availability_multiplier', 1):.2f}")
        st.caption(adj)

    st.markdown("#### Career History")
    history = sorted((raw.get("career_history") or []),
                     key=lambda j: str(j.get("start_date") or ""),
                     reverse=True)
    if not history:
        st.caption("none on file" if JSONL_PATH.exists()
                   else "candidates.jsonl not deployed on this Space")
    for job in history:
        cur = " · **current**" if job.get("is_current") else ""
        st.markdown(f"**{v(job.get('title'))}** @ {v(job.get('company'))} "
                    f"({v(job.get('duration_months'))} mo{cur}) — "
                    f"{v(job.get('industry'))}, size {v(job.get('company_size'))}")
        if job.get("description"):
            st.caption(job["description"])

    st.markdown("#### Matched Skills")
    req = rec.get("matched_required_skills") or []
    nth = rec.get("matched_nicetohave_skills") or []
    st.markdown(f"**JD required:** {', '.join(req) if req else 'none'}  \n"
                f"**Nice-to-have:** {', '.join(nth) if nth else 'none'}")

    st.markdown("#### Behavioral Signals")
    c1, c2 = st.columns(2)
    with c1:
        st.markdown(
            f"Last active: {v(rs.get('last_active_date'))} "
            f"({v(rec.get('days_inactive'), ' days ago')})  \n"
            f"Response rate: {v(rec.get('recruiter_response_rate'))}  \n"
            f"Interview completion: {v(rec.get('interview_completion_rate'))}  \n"
            f"Offer acceptance: {v(rec.get('offer_acceptance_rate'))}  \n"
            f"Notice period: {v(rec.get('notice_period_days'), ' days')}")
    with c2:
        st.markdown(
            f"Open to work: {'Yes' if rec.get('open_to_work_flag') else 'No'}  \n"
            f"Willing to relocate: "
            f"{v(rs.get('willing_to_relocate')) if rs else '--'}  \n"
            f"GitHub score: {v(rec.get('github_activity_score'))}  \n"
            f"Saved by recruiters (30d): {v(rec.get('saved_by_recruiters_30d'))}  \n"
            f"Applications (30d): {v(rec.get('applications_submitted_30d'))}")

    st.markdown("#### System Scores")
    st.markdown(
        f"Career: **{rec['career_score']:.2f}** "
        f"(company {rec['company_type_score']:g} · role "
        f"{rec['role_relevance_score']:g} · prod {rec['production_signal']:g} "
        f"· domain {rec['domain_indicator']:g} · tenure "
        f"{rec['tenure_stability']:g})  \n"
        f"Skill: **{rec['skill_score']:.2f}** · Experience: "
        f"**{rec['experience_score']:.2f}** (yoe {rec['yoe_fit']:g} · loc "
        f"{rec['location_fit']:g} · edu {rec['education_tier_score']:g}) · "
        f"Assessment: **{rec['assessment_score']:.2f}**  \n"
        f"Trajectory: {rec['trajectory_adjustment']:+g} · Availability: "
        f"×{rec['availability_multiplier']:.2f}")
    dq = (f"Yes — {'; '.join(rec['disqualifier_reasons'])}"
          if rec["disqualifier_flag"] else "No")
    hp = (f"Yes — {'; '.join(rec['honeypot_reasons'])}"
          if rec["is_honeypot"] else "No")
    st.markdown(f"Disqualified: {dq} · Honeypot: {hp}")


# ---------------------------------------------------------------------------
# Re-rank (runs pipeline\rank.py as a subprocess, live progress)
# ---------------------------------------------------------------------------
def run_rerank():
    state = runtime_state()
    since = time.time() - state["last_rerank_done"]
    if state["last_rerank_done"] and since < RERANK_COOLDOWN_S:
        st.warning(f"Cooldown: wait {int(RERANK_COOLDOWN_S - since)}s before "
                   f"re-ranking again.")
        return
    cmd = [sys.executable, "-u", str(PIPELINE_DIR / "rank.py"),
           "--precomputed", str(PRECOMPUTED_DIR),
           "--out", str(SUBMISSION_CSV)]
    t0 = time.time()
    with st.status("Running the 6-layer ranking pipeline…",
                   expanded=True) as status:
        prog = st.progress(5, text="Loading artifacts & searching 100K "
                                   "candidates (FAISS)…")
        proc = subprocess.Popen(cmd, cwd=str(PROJECT_ROOT),
                                stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True,
                                encoding="utf-8", errors="replace")
        prog.progress(20, text="Hybrid re-scoring top 5,000, then "
                               "cross-encoder re-ranking top 500 (~40s)…")
        for line in proc.stdout:
            line = line.rstrip()
            if not line:
                continue
            st.text(line)
            if line.startswith("L2 cross-encoder:"):
                prog.progress(88, text="Computing composite scores…")
            elif line.startswith("funnel:"):
                prog.progress(95, text="Finalizing top 100…")
            elif line.startswith("wrote "):
                prog.progress(98, text="Writing submission.csv…")
        code = proc.wait()
        elapsed = time.time() - t0
        if code != 0:
            status.update(label=f"rank.py failed (exit {code})",
                          state="error")
            return
        state["last_rerank_done"] = time.time()
        prog.progress(100, text="Done")
        status.update(label=f"✓ Ranked in {elapsed:.0f}s", state="complete")
    load_submission.clear()
    load_details.clear()
    st.rerun()


# ---------------------------------------------------------------------------
# Scoring-only preview of an uploaded id subset (mirrors POST /api/preview)
# ---------------------------------------------------------------------------
def preview_subset(ids: list[str]) -> tuple[pd.DataFrame, list[str]]:
    feats, texts, vec = load_feats(), load_texts(), load_vectors()
    known = [cid for cid in ids if cid in vec["row_of"] and cid in feats]
    unknown = [cid for cid in ids if cid not in known]
    if not known:
        return pd.DataFrame(), unknown
    rows = np.array([vec["row_of"][cid] for cid in known])
    dense = np.asarray(vec["career"][rows]) @ vec["jd"]
    lo, hi = float(dense.min()), float(dense.max())
    sem = np.zeros_like(dense) if hi <= lo else (dense - lo) / (hi - lo)

    scored = []
    for cid, s, row in zip(known, sem.tolist(), rows.tolist()):
        cons = consistency_adjustment(
            vec["summary"][row], vec["career"][row],
            (texts.get(cid) or {}).get("summary_text"))
        pen = negative_anchor_penalty(np.asarray(vec["career"][row]),
                                      vec["anchors"])
        comp, _, _ = composite_score(feats[cid], s, cons, pen)
        scored.append((cid, comp))
    scored.sort(key=lambda t: (-t[1], t[0]))
    df = pd.DataFrame([{
        "rank": i + 1, "candidate_id": cid, "score": round(comp, 4),
        "title": feats[cid].get("current_title") or "--",
        "location": feats[cid].get("location") or "--",
    } for i, (cid, comp) in enumerate(scored)])
    return df, unknown


# ---------------------------------------------------------------------------
# Page
# ---------------------------------------------------------------------------
def main():
    feats = load_feats()
    rows = load_submission(_mtime(SUBMISSION_CSV))

    # --- header ---
    left, right = st.columns([3, 1])
    with left:
        st.markdown(f"<h1 style='color:{C['foreground']};font-size:26px;"
                    f"margin-bottom:0'>Glasshouse</h1>",
                    unsafe_allow_html=True)
        if SUBMISSION_CSV.exists():
            ts = datetime.fromtimestamp(SUBMISSION_CSV.stat().st_mtime,
                                        tz=timezone.utc)
            mins = int((datetime.now(tz=timezone.utc) - ts).total_seconds()
                       // 60)
            st.caption(f"Last ranked: {mins} min ago · "
                       f"{len(feats):,} candidates indexed")
        else:
            st.caption("No submission yet — run the pipeline below.")
    with right:
        if st.button("Re-rank (runs the full pipeline)", type="primary",
                     icon=":material/refresh:", width="stretch"):
            run_rerank()

    if not rows:
        st.info("submission.csv not found — click Re-rank to generate it.")
        return

    # --- metrics bar ---
    hp = sum(1 for r in rows if feats.get(r["candidate_id"], {})
             .get("is_honeypot"))
    dq = sum(1 for r in rows if feats.get(r["candidate_id"], {})
             .get("disqualifier_flag"))
    scores = [r["score"] for r in rows]
    last_run = None
    if TIMING_JSON.exists():
        with open(TIMING_JSON, encoding="utf-8") as f:
            last_run = (json.load(f).get("timings_s") or {}).get("total")
    m1, m2, m3, m4, m5 = st.columns(5)
    m1.metric("Honeypots in top 100", hp,
              delta="clean" if hp == 0 else "VIOLATION",
              delta_color="normal" if hp == 0 else "inverse")
    m2.metric("Disqualified in top 100", dq,
              delta="clean" if dq == 0 else "VIOLATION",
              delta_color="normal" if dq == 0 else "inverse")
    m3.metric("Mean score · top 10", f"{np.mean(scores[:10]):.4f}")
    m4.metric("Mean score · top 50", f"{np.mean(scores[:50]):.4f}")
    m5.metric("Candidates ranked", len(rows),
              delta=f"{last_run:.0f}s last run" if last_run else None,
              delta_color="off")

    # --- fairness audit (read-only adverse-impact report) ---
    with st.expander("Fairness audit — adverse impact vs the qualified pool"):
        if not FAIRNESS_JSON.exists():
            st.caption("Audit report not deployed on this Space — generate it "
                       "with `python pipeline/fairness_audit.py`.")
        else:
            with open(FAIRNESS_JSON, encoding="utf-8") as f:
                fair = json.load(f)
            st.caption(fair["disclaimer"])
            fm = fair["methodology"]
            st.caption(f"Qualified pool: {fm['qualified_pool_count']:,} of "
                       f"{fm['total_candidates']:,} "
                       f"({fm['qualified_pool_definition']}). Impact ratio = "
                       f"group selection rate / best group's rate; "
                       f"< {fm['four_fifths_threshold']} is flagged.")
            for attr in fair["attributes"]:
                st.markdown(f"**{attr['attribute']}**")
                adf = pd.DataFrame(attr["rows"])[[
                    "group", "pool_count", "pool_share_pct", "top100_count",
                    "selection_rate_pct", "impact_ratio", "flagged"]]
                adf.columns = ["group", "pool n", "pool %", "top-100 n",
                               "selection %", "impact ratio", "flag"]
                st.dataframe(adf, hide_index=True, width="stretch")
                for note in attr.get("notes", []):
                    st.caption(note)

    # --- talent market ---
    with st.expander("Talent Market — supply-side intelligence over the full pool"):
        st.caption(
            "Aggregate signals over the qualified sub-pool (≥1 matched required skill, "
            "no fraud flags). Everything is derived from in-memory features — no extra I/O."
        )
        qual = [
            (cid, rec) for cid, rec in feats.items()
            if rec.get("matched_required_skills")
            and not rec.get("disqualifier_flag")
            and not rec.get("is_honeypot")
        ]
        q_n = len(qual)
        open_wk = sum(1 for _, r in qual if r.get("open_to_work_flag"))
        short_n = sum(1 for _, r in qual if (r.get("notice_period_days") or 9999) <= 30)
        act30 = sum(1 for _, r in qual if (r.get("days_inactive") or 999) < 30)

        ma, mb, mc, md = st.columns(4)
        ma.metric("Qualified pool", f"{q_n:,}",
                  delta=f"{q_n / len(feats) * 100:.1f}% of corpus",
                  delta_color="off")
        mb.metric("Open to work", f"{open_wk / q_n * 100:.1f}%",
                  delta=f"{open_wk:,} candidates", delta_color="off")
        mc.metric("Short notice ≤ 30d", f"{short_n / q_n * 100:.1f}%",
                  delta=f"{short_n:,} candidates", delta_color="off")
        md.metric("Active last 30d", f"{act30 / q_n * 100:.1f}%",
                  delta=f"{act30:,} candidates", delta_color="off")

        from collections import Counter as _Counter
        skill_counts = _Counter()
        for _, rec in qual:
            for s in rec.get("matched_required_skills") or []:
                skill_counts[s] += 1
        stack_counts = _Counter(
            len(rec.get("matched_required_skills") or []) for _, rec in qual
        )

        c_left, c_right = st.columns(2)
        with c_left:
            st.markdown("**Required-skill supply** (top 12 skills, qualified pool)")
            skill_df = pd.DataFrame(skill_counts.most_common(12),
                                    columns=["skill", "candidates"])
            st.bar_chart(skill_df.set_index("skill"), horizontal=True)

        with c_right:
            st.markdown("**Stack depth** — matched required skills per candidate")
            stack_df = pd.DataFrame(
                sorted(stack_counts.items()),
                columns=["skills matched", "candidates"],
            )
            st.bar_chart(stack_df.set_index("skills matched"))

        st.markdown("**Location depth**")
        loc_data: dict[str, dict] = {}
        for _, rec in qual:
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
        loc_df = pd.DataFrame([
            {
                "location": loc,
                "qualified": d["count"],
                "mean yoe": round(d["yoe_sum"] / d["yoe_n"], 1) if d["yoe_n"] else None,
                "open to work %": round(d["open_to_work"] / d["count"] * 100, 1),
                "active 30d %": round(d["active_30d"] / d["count"] * 100, 1),
            }
            for loc, d in sorted(loc_data.items(), key=lambda x: -x[1]["count"])
        ])
        st.dataframe(loc_df, hide_index=True, width="stretch")

    # --- explain a candidate ---
    with st.expander("Explain a candidate — rank position, strengths, weaknesses, improvement paths"):
        cid_input = st.text_input("Candidate ID", placeholder="e.g. CAND_0046525",
                                  key="explain_cid")
        if st.button("Explain", disabled=not cid_input.strip(), key="explain_btn"):
            cid_q = cid_input.strip().upper()
            if cid_q not in feats:
                st.error(f"{cid_q} not found in features.pkl")
            else:
                gd = load_gate_data()
                ps = compute_proxy_sorted(_mtime(PRECOMPUTED_DIR / "features.pkl"))
                exp = build_explanation_st(cid_q, feats,
                                           load_details(_mtime(DETAILS_JSON)), gd, ps)
                st.info(exp["summary"])
                ea, eb = st.columns(2)
                with ea:
                    st.markdown("**Strengths** (weighted contribution > 0.15)")
                    if exp["strengths"]:
                        for c in exp["strengths"]:
                            st.metric(label=c["label"],
                                      value=f"{c['weighted_contribution']:.3f}",
                                      delta=c["explanation"],
                                      delta_color="normal")
                    else:
                        st.caption("No components above the strength threshold.")
                with eb:
                    st.markdown("**Weaknesses** (weighted contribution < 0.08)")
                    if exp["weaknesses"]:
                        for c in exp["weaknesses"]:
                            st.metric(label=c["label"],
                                      value=f"{c['weighted_contribution']:.3f}",
                                      delta=c["explanation"],
                                      delta_color="inverse")
                    else:
                        st.caption("No components below the weakness threshold.")

                st.markdown("**Adjustments**")
                adj = exp["adjustments"]
                st.caption(
                    f"Trajectory: {adj['trajectory']:+.3f} · "
                    f"Consistency: {adj['consistency']:+.3f} · "
                    f"Anchor penalty: {adj['anchor_penalty']:+.3f} · "
                    f"Availability: ×{adj['availability_multiplier']:.2f} · "
                    f"Disqualified: {'Yes' if adj['disqualifier'] else 'No'} · "
                    f"Honeypot: {'Yes' if adj['honeypot'] else 'No'}"
                )

                gs = exp["gate_status"]
                if gs["passes_l5_gate"]:
                    st.success("L5 gate: passes (no expert-claim violations)")
                else:
                    st.warning(f"L5 gate: violations on {', '.join(gs['violations'])}")

                st.markdown("**Improvement paths**")
                effort_icon = {"low": "🟢", "medium": "🟡", "high": "🔴"}
                for i, path in enumerate(exp["improvement_paths"], 1):
                    icon = effort_icon.get(path["effort"], "•")
                    st.markdown(f"{i}. {icon} **{path['action']}**  \n"
                                f"   _{path['impact']}_")

                rc = exp["rank_context"]
                st.markdown("**Rank context**")
                rc_rows = {}
                if rc.get("rank"):
                    rc_rows["Rank"] = f"#{rc['rank']} of 100"
                    rc_rows["Score"] = f"{rc['score']:.4f}"
                    rc_rows["vs Rank 1"]   = f"{rc['score_vs_rank1']:+.4f}"
                    rc_rows["vs Rank 10"]  = f"{rc['score_vs_rank10']:+.4f}"
                    rc_rows["vs Rank 100"] = f"{rc['score_vs_rank100']:+.4f}"
                else:
                    rc_rows["In top-100"] = "No"
                    rc_rows["Estimated score"] = str(rc.get("estimated_score"))
                    rc_rows["Estimated rank (qualified pool)"] = str(rc.get("estimated_rank_if_not_in_top100"))
                st.dataframe(pd.DataFrame(list(rc_rows.items()),
                                          columns=["metric", "value"]),
                             hide_index=True, width=400)

    # --- table + filters ---
    details = load_details(_mtime(DETAILS_JSON))
    df = pd.DataFrame([{
        "rank": r["rank"],
        "candidate_id": r["candidate_id"],
        "title": feats.get(r["candidate_id"], {}).get("current_title") or "--",
        "location": feats.get(r["candidate_id"], {}).get("location") or "--",
        "bucket": location_bucket(feats.get(r["candidate_id"], {})),
        "score": r["score"],
        "career": (details.get(r["candidate_id"], {}).get("parts") or {})
                  .get("career", 0.0),
        "skill": (details.get(r["candidate_id"], {}).get("parts") or {})
                 .get("skill", 0.0),
        "reasoning": r["reasoning"],
    } for r in rows])

    f1, f2, f3, f4 = st.columns([2, 1.4, 2, 1])
    q = f1.text_input("Search title", placeholder="e.g. machine learning")
    loc = f2.selectbox("Location", ["All", "Pune", "Noida", "Other India",
                                    "International"])
    lo, hi = float(df["score"].min()), float(df["score"].max())
    smin, smax = f3.slider("Score range", min_value=round(lo - 0.01, 2),
                           max_value=round(hi + 0.01, 2),
                           value=(round(lo - 0.01, 2), round(hi + 0.01, 2)))
    with f4:
        st.download_button("Export CSV", SUBMISSION_CSV.read_bytes(),
                           file_name="submission.csv", mime="text/csv",
                           icon=":material/download:", width="stretch")

    view = df
    if q.strip():
        view = view[view["title"].str.contains(q.strip(), case=False)]
    if loc != "All":
        view = view[view["bucket"] == loc]
    view = view[(view["score"] >= smin) & (view["score"] <= smax)]

    st.caption(f"{len(view)} of {len(df)} candidates — click a row for the "
               f"full profile; click column headers to sort")
    event = st.dataframe(
        view.drop(columns=["bucket"]),
        width="stretch", hide_index=True, height=560,
        on_select="rerun", selection_mode="single-row",
        column_config={
            "rank": st.column_config.NumberColumn("Rank", width="small"),
            "candidate_id": st.column_config.TextColumn("Candidate"),
            "title": st.column_config.TextColumn("Title", width="medium"),
            "location": st.column_config.TextColumn("Location"),
            "score": st.column_config.ProgressColumn(
                "Score", min_value=0.0, max_value=1.1, format="%.4f"),
            "career": st.column_config.ProgressColumn(
                "Career part", min_value=0.0, max_value=0.30, format="%.3f"),
            "skill": st.column_config.ProgressColumn(
                "Skill part", min_value=0.0, max_value=0.20, format="%.3f"),
            "reasoning": st.column_config.TextColumn("Reasoning",
                                                     width="large"),
        })
    sel = event.selection.rows if event and event.selection else []
    if sel:
        show_profile(view.iloc[sel[0]]["candidate_id"])

    # --- upload preview ---
    with st.expander("Preview a custom candidate list "
                     f"(scoring-only, up to {PREVIEW_MAX_IDS} IDs)"):
        up = st.file_uploader("CSV / TXT of candidate IDs",
                              type=["csv", "txt"])
        pasted = st.text_area("…or paste IDs (one per line or "
                              "comma-separated)", height=90)
        text = (up.read().decode("utf-8", errors="replace") if up else "") \
            + "\n" + pasted
        ids = list(dict.fromkeys(_ID_RE.findall(text)))[:PREVIEW_MAX_IDS]
        st.caption(f"{len(ids)} valid IDs detected")
        if st.button("Score subset", disabled=not ids):
            pdf, unknown = preview_subset(ids)
            if unknown:
                st.warning(f"{len(unknown)} unknown: {', '.join(unknown)}")
            if not pdf.empty:
                st.dataframe(pdf, width="stretch", hide_index=True,
                             column_config={
                                 "score": st.column_config.ProgressColumn(
                                     "Score", min_value=0.0, max_value=1.1,
                                     format="%.4f")})
                st.caption("Scoring-only preview: dense semantic + composite,"
                           " no cross-encoder layer (subset min-max "
                           "normalised).")


main()
