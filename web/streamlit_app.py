"""streamlit_app.py — HuggingFace Spaces entry point for Redrob Ranker.

Pure-Streamlit replica of the React app's key views (metrics bar, ranked
table, candidate profile dialog, scoring-only subset preview, re-rank with
live progress). Loads the precomputed artifacts directly — no FastAPI
process needed, which keeps the Space to a single server.

Design system: UI UX Pro Max "Redrob Ranker" — Data-Dense Dashboard.
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
JSONL_PATH = PROJECT_ROOT / "data" / "candidates.jsonl"
OFFSETS_PATH = PROJECT_ROOT / "data" / "labeling_candidates.json"

sys.path.insert(0, str(PIPELINE_DIR))
from scorer import (composite_score, consistency_adjustment,  # noqa: E402
                    negative_anchor_penalty)

RERANK_COOLDOWN_S = 60
PREVIEW_MAX_IDS = 200
_ID_RE = re.compile(r"CAND_\d{7}")
_ID_PREFIX_B = re.compile(rb'^\{"candidate_id": "(CAND_\d{7})"')

# Design-system tokens (generated palette, verbatim).
C = {
    "primary": "#1E40AF", "secondary": "#3B82F6", "accent": "#D97706",
    "background": "#F8FAFC", "foreground": "#1E3A8A", "muted": "#E9EEF6",
    "border": "#DBEAFE", "destructive": "#DC2626",
    "good": "#10B981", "warn": "#EAB308", "low": "#F97316",
}
PART_COLORS = {"semantic": "#1E40AF", "career": "#3B82F6", "skill": "#60A5FA",
               "experience": "#93C5FD", "assessment": "#D97706"}

st.set_page_config(page_title="Redrob Ranker", page_icon="📡", layout="wide")

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
                    f"margin-bottom:0'>Redrob Ranker</h1>",
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
