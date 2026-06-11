"""build_features.py — File C of the Phase-1 offline pipeline.

Streams candidates.jsonl and pre-computes, for every candidate:
  * features.pkl — dict[candidate_id, FeatureRecord]  (see contracts.py)
  * texts.pkl    — dict[candidate_id, TextRecord]

No model loading happens here: skill matching uses the pre-built
skill_canon.pkl (File A) and honeypot detection is pure logic (File B).

Usage:
    python build_features.py \
        --candidates ../data/candidates.jsonl \
        --skill-canon ../precomputed/skill_canon.pkl \
        --out-features ../precomputed/features.pkl \
        --out-texts ../precomputed/texts.pkl
"""
from __future__ import annotations

import argparse
import pickle
import re
from datetime import date
from pathlib import Path
from typing import Any

from dateutil import parser as dateparser
from tqdm import tqdm

from build_skill_canon import (
    DATA_DIR,
    NICETOHAVE_SKILLS,
    PRECOMPUTED_DIR,
    REQUIRED_SKILLS,
    iter_candidates,
)
from honeypot import is_honeypot

# ---------------------------------------------------------------------------
# Company classification (career_score component + disqualifier 1)
# company_size in the real data is an employee range ("10001+"), not a type,
# so classification relies on company name + industry as the spec requires.
# ---------------------------------------------------------------------------
IT_SERVICES_COMPANIES = [
    "tcs", "tata consultancy", "infosys", "wipro", "accenture", "cognizant",
    "capgemini", "hcl", "tech mahindra", "mindtree", "ltimindtree",
    "mphasis", "l&t infotech", "ntt data", "dxc technology",
]
IT_SERVICES_INDUSTRIES = {
    "it services", "it consulting", "outsourcing", "bpo",
    "it services and it consulting",
}

# ---------------------------------------------------------------------------
# Title relevance (role_relevance_score + trajectory + disqualifier 2)
# Buckets follow the spec anchors: ML/AI = 1.0, tech-adjacent = 0.5 with ML
# exposure (0.3 without), non-technical = 0.05, unknown = 0.3.
# ---------------------------------------------------------------------------
ML_TITLE_RE = re.compile(
    r"machine learning|\bml\b|\bai\b|artificial intelligence|deep learning"
    r"|research (engineer|scientist)|data scien|nlp|search engineer"
    r"|recommendation|information retrieval|computer vision", re.I)
TECH_TITLE_RE = re.compile(
    r"software|backend|back end|developer|devops|sre|full stack|frontend"
    r"|front end|mobile|cloud|data engineer|analytics|platform|qa\b"
    r"|test engineer|architect|engineer", re.I)
NONTECH_TITLE_RE = re.compile(
    r"marketing|\bhr\b|human resources|sales|consult|recruit|account"
    r"|finance|content|designer|support|operations manager|business analyst"
    r"|project manager|civil|mechanical|writer|admin|legal|procurement", re.I)

ML_EXPOSURE_RE = re.compile(
    r"machine learning|\bml\b|model training|trained .{0,20}model|embedding"
    r"|recommendation|ranking|nlp|deep learning|tensorflow|pytorch"
    r"|scikit|xgboost|feature engineering|data science", re.I)

# Spec keyword lists for the two binary career-description signals.
PRODUCTION_RE = re.compile(
    r"deploy|production|serving|real users|a/b test|ab test|a-b test"
    r"|rollout|rolled out|launched", re.I)
DOMAIN_RE = re.compile(
    r"ranking|retrieval|search|recommend|vector|embedding|ndcg|index"
    r"|semantic", re.I)

# Disqualifier 3: CV/Speech/Robotics specialist with zero NLP/retrieval.
CV_SPEECH_ROBOTICS_RE = re.compile(
    r"computer vision|opencv|image (classification|segmentation|processing)"
    r"|object detection|yolo\b|speech|\basr\b|\btts\b|voice|robotic|slam\b"
    r"|autonomous (vehicle|driving)|lidar|drone", re.I)
NLP_SIGNAL_RE = re.compile(
    r"nlp|natural language|language model|\bllm\b|\bbert\b|transformer"
    r"|text (classification|mining|analytics)|sentiment|\bner\b"
    r"|chatbot|question answering", re.I)

# Seniority ladder for the title-chaser escalation check.
_SENIORITY = [
    (re.compile(r"intern|trainee", re.I), 0),
    (re.compile(r"junior|associate|graduate", re.I), 1),
    (re.compile(r"director|vp\b|vice president|chief|cxo|cto|head", re.I), 6),
    (re.compile(r"manager", re.I), 5),
    (re.compile(r"lead|staff|principal", re.I), 4),
    (re.compile(r"senior|\bsr\.?\b", re.I), 3),
]

PROFICIENCY_MULT = {"expert": 1.0, "advanced": 0.8,
                    "intermediate": 0.5, "beginner": 0.2}

CITY_TIER1_RE = re.compile(
    r"bengaluru|bangalore|mumbai|delhi|gurgaon|gurugram|hyderabad"
    r"|chennai|kolkata", re.I)

STEM_FIELD_RE = re.compile(
    r"computer|software|informat|electronic|electrical|communication"
    r"|math|statistic|data science|artificial intelligence"
    r"|machine learning", re.I)

TIER_SCORE = {"tier_1": 1.0, "tier_2": 0.8, "tier_3": 0.6,
              "tier_4": 0.4, "unknown": 0.4}


# ---------------------------------------------------------------------------
# Small tolerant accessors — every raw field may be missing or malformed.
# ---------------------------------------------------------------------------
def _str(value: Any, default: str = "") -> str:
    return value.strip() if isinstance(value, str) else default


def _num(value: Any, default: float | None = None) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return default
    return float(value)


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def _parse_date(value: Any) -> date | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return dateparser.parse(value.strip()).date()
    except (ValueError, OverflowError, TypeError):
        return None


def _roles(candidate: dict) -> list[dict]:
    roles = candidate.get("career_history")
    if not isinstance(roles, list):
        return []
    return [r for r in roles if isinstance(r, dict)]


def _roles_recent_first(roles: list[dict]) -> list[dict]:
    """Sort roles most-recent-first: current roles first, then by start_date
    descending. Roles without a parseable start keep their original position
    (the raw data lists roles most-recent-first already)."""
    def key(item: tuple[int, dict]):
        idx, role = item
        start = _parse_date(role.get("start_date"))
        is_current = bool(role.get("is_current"))
        # Sortable triple: current first, then newest start, then file order.
        return (0 if is_current else 1,
                -(start.toordinal()) if start else 0,
                idx)
    return [r for _, r in sorted(enumerate(roles), key=key)]


def _all_descriptions(roles: list[dict]) -> str:
    return " ".join(_str(r.get("description")) for r in roles)


# ---------------------------------------------------------------------------
# Career sub-scores
# ---------------------------------------------------------------------------
def _is_it_services(role: dict) -> bool:
    name = _str(role.get("company")).lower()
    industry = _str(role.get("industry")).lower()
    if industry in IT_SERVICES_INDUSTRIES:
        return True
    return any(svc in name for svc in IT_SERVICES_COMPANIES)


def company_type_score(roles: list[dict], profile: dict) -> float:
    """Product/startup/scale-up = 1.0, mixed career = 0.5, all-services = 0.1."""
    if not roles:
        # Fall back to the current employer from the profile.
        pseudo = {"company": profile.get("current_company"),
                  "industry": profile.get("current_industry")}
        if _str(pseudo["company"]) or _str(pseudo["industry"]):
            return 0.1 if _is_it_services(pseudo) else 1.0
        return 0.5  # no signal
    services = sum(1 for r in roles if _is_it_services(r))
    if services == 0:
        return 1.0
    if services == len(roles):
        return 0.1
    return 0.5


def _title_base_score(title: str) -> float:
    """Pure title bucket, no description context (used by trajectory too)."""
    if not title:
        return 0.3
    if ML_TITLE_RE.search(title):
        return 1.0
    if NONTECH_TITLE_RE.search(title):
        return 0.05
    if TECH_TITLE_RE.search(title):
        return 0.5
    return 0.3


def role_relevance_score(profile: dict, roles: list[dict]) -> float:
    """Recency-weighted title relevance over current + 2 previous roles.

    Tech-adjacent titles (the 0.5 bucket) only keep 0.5 when the career
    descriptions show actual ML exposure; otherwise they drop to 0.3.
    """
    has_ml_exposure = bool(ML_EXPOSURE_RE.search(_all_descriptions(roles)))

    titles = [_str(profile.get("current_title"))]
    for role in _roles_recent_first(roles)[:2]:
        titles.append(_str(role.get("title")))
    titles = [t for t in titles if t][:3]
    if not titles:
        return 0.3

    weights = [0.5, 0.3, 0.2][: len(titles)]
    total_w = sum(weights)
    score = 0.0
    for title, w in zip(titles, weights):
        base = _title_base_score(title)
        if base == 0.5 and not has_ml_exposure:
            base = 0.3
        score += base * w
    return _clamp(score / total_w)


def tenure_stability(roles: list[dict]) -> float:
    """1 - fraction of roles shorter than 18 months (known durations only)."""
    durations = [m for r in roles
                 if (m := _num(r.get("duration_months"))) is not None and m >= 0]
    if not durations:
        return 0.5  # no signal
    short = sum(1 for m in durations if m < 18)
    return _clamp(1.0 - short / len(durations))


# ---------------------------------------------------------------------------
# Skill score
# ---------------------------------------------------------------------------
def build_skill_lookup(canon: dict[str, list[str]]) -> dict[str, list[str]]:
    """Invert the canon: candidate skill name (lowercased) -> [JD skills]."""
    lookup: dict[str, list[str]] = {}
    for jd_skill, names in canon.items():
        for name in names:
            lookup.setdefault(name.strip().lower(), []).append(jd_skill)
    return lookup


def _duration_mult(months: float | None) -> float:
    if months is None:
        return 0.1  # unverifiable claim scores as the lowest bracket
    if months >= 48:
        return 1.0
    if months >= 24:
        return 0.8
    if months >= 12:
        return 0.6
    if months >= 6:
        return 0.4
    return 0.1


# Perfect candidate: every JD skill matched at expert with >= 48 months.
MAX_SKILL_SUM = len(REQUIRED_SKILLS) * 1.0 + len(NICETOHAVE_SKILLS) * 0.4
REQUIRED_SET = set(REQUIRED_SKILLS)


def skill_score(
    skills: list[Any], lookup: dict[str, list[str]]
) -> tuple[float, list[str], list[str]]:
    """Returns (score in [0,1], matched required JD skills, matched nice-to-haves).

    When several candidate skills match the same JD skill, only the best
    per-skill value counts — duplicates must not inflate the score.
    """
    best: dict[str, float] = {}
    for skill in skills:
        if not isinstance(skill, dict):
            continue
        name = _str(skill.get("name")).lower()
        if not name or name not in lookup:
            continue
        prof_mult = PROFICIENCY_MULT.get(skill.get("proficiency"), 0.2)
        dur_mult = _duration_mult(_num(skill.get("duration_months")))
        for jd_skill in lookup[name]:
            base = 1.0 if jd_skill in REQUIRED_SET else 0.4
            value = base * prof_mult * dur_mult
            if value > best.get(jd_skill, 0.0):
                best[jd_skill] = value

    matched_req = sorted(j for j in best if j in REQUIRED_SET)
    matched_nth = sorted(j for j in best if j not in REQUIRED_SET)
    score = _clamp(sum(best.values()) / MAX_SKILL_SUM)
    return score, matched_req, matched_nth


# ---------------------------------------------------------------------------
# Experience score
# ---------------------------------------------------------------------------
def yoe_fit(yoe: float | None) -> float:
    if yoe is None:
        return 0.2
    if 5 <= yoe <= 9:
        return 1.0
    if yoe in (4, 10):
        return 0.7
    if yoe == 3 or 11 <= yoe <= 13:
        return 0.4
    return 0.2


def location_fit(profile: dict, signals: dict) -> float:
    location = _str(profile.get("location")).lower()
    country = _str(profile.get("country")).lower()
    if "pune" in location or "noida" in location:
        return 1.0
    if CITY_TIER1_RE.search(location):
        return 0.8
    in_india = country == "india" or "india" in location
    if in_india:
        return 0.65 if signals.get("willing_to_relocate") is True else 0.3
    return 0.2


def education_tier_score(education: Any) -> float:
    """Best education entry: tier base + 0.1 STEM-field bonus, capped at 1.0."""
    if not isinstance(education, list):
        return TIER_SCORE["unknown"]
    best = None
    for entry in education:
        if not isinstance(entry, dict):
            continue
        score = TIER_SCORE.get(entry.get("tier"), TIER_SCORE["unknown"])
        if STEM_FIELD_RE.search(_str(entry.get("field_of_study"))):
            score = min(score + 0.1, 1.0)
        best = score if best is None else max(best, score)
    return best if best is not None else TIER_SCORE["unknown"]


# ---------------------------------------------------------------------------
# Assessment score
# ---------------------------------------------------------------------------
def assessment_score(signals: dict, required_names: set[str]) -> float:
    """Mean Redrob assessment over skills that match a REQUIRED JD skill."""
    scores = signals.get("skill_assessment_scores")
    if not isinstance(scores, dict):
        return 0.0
    values = [
        float(v) for k, v in scores.items()
        if isinstance(k, str) and k.strip().lower() in required_names
        and isinstance(v, (int, float)) and not isinstance(v, bool)
    ]
    if not values:
        return 0.0
    return _clamp(sum(values) / len(values) / 100.0)


# ---------------------------------------------------------------------------
# Trajectory
# ---------------------------------------------------------------------------
def trajectory_adjustment(roles: list[dict]) -> float:
    """+0.05 if the last 2 roles are clearly more ML-relevant than older ones,
    -0.05 if clearly less, else 0. Needs >= 3 roles to have a baseline."""
    ordered = _roles_recent_first(roles)
    if len(ordered) < 3:
        return 0.0
    scores = [_title_base_score(_str(r.get("title"))) for r in ordered]
    recent = sum(scores[:2]) / 2
    older = sum(scores[2:]) / len(scores[2:])
    delta = recent - older
    if delta > 0.10:
        return 0.05
    if delta < -0.10:
        return -0.05
    return 0.0


# ---------------------------------------------------------------------------
# Availability multiplier
# ---------------------------------------------------------------------------
def days_inactive(signals: dict, ref_date: date) -> int:
    """Days since last_active_date; -1 when unknown."""
    last_active = _parse_date(signals.get("last_active_date"))
    if last_active is None:
        return -1
    return max(0, (ref_date - last_active).days)


def availability_multiplier(signals: dict, inactive_days: int) -> float:
    mult = 1.0

    if inactive_days >= 0:  # -1 = unknown = no adjustment
        if inactive_days < 14:
            mult += 0.15
        elif inactive_days <= 30:
            mult += 0.10
        elif inactive_days <= 90:
            pass
        elif inactive_days <= 180:
            mult -= 0.10
        else:
            mult -= 0.25

    rate = _num(signals.get("recruiter_response_rate"))
    if rate is not None:
        if rate > 0.70:
            mult += 0.10
        elif rate >= 0.40:
            pass
        elif rate >= 0.20:
            mult -= 0.05
        else:
            mult -= 0.15

    if signals.get("open_to_work_flag") is True:
        mult += 0.05
    if (_num(signals.get("applications_submitted_30d")) or 0) > 3:
        mult += 0.05
    if (_num(signals.get("github_activity_score")) or -1) > 60:
        mult += 0.05
    if (_num(signals.get("saved_by_recruiters_30d")) or 0) > 5:
        mult += 0.05

    notice = _num(signals.get("notice_period_days"))
    if notice is not None:
        if notice <= 30:
            pass
        elif notice <= 60:
            mult -= 0.03
        elif notice <= 90:
            mult -= 0.07
        else:
            mult -= 0.12

    return _clamp(mult, 0.10, 1.25)


# ---------------------------------------------------------------------------
# Disqualifiers
# ---------------------------------------------------------------------------
def _seniority_rank(title: str) -> int:
    for pattern, rank in _SENIORITY:
        if pattern.search(title):
            return rank
    return 2  # unmarked title = mid-level


def disqualifiers(
    profile: dict, roles: list[dict], domain_flag: float
) -> tuple[bool, list[str]]:
    reasons: list[str] = []

    # 1. Entire career at IT-services firms.
    if roles and all(_is_it_services(r) for r in roles):
        reasons.append("all_it_services: every role is at an IT-services firm")

    # 2. Title-chaser: > 60% of roles under 18 months, with title escalation
    #    across at least one consecutive pair of short-tenure roles.
    if len(roles) >= 2:
        durations = [_num(r.get("duration_months")) for r in roles]
        known = [(r, m) for r, m in zip(roles, durations) if m is not None]
        if known:
            short_frac = sum(1 for _, m in known if m < 18) / len(known)
            chronological = list(reversed(_roles_recent_first(roles)))
            escalation = False
            for a, b in zip(chronological, chronological[1:]):
                dur_a = _num(a.get("duration_months"))
                dur_b = _num(b.get("duration_months"))
                if dur_a is not None and dur_a < 18 \
                        and dur_b is not None and dur_b < 18 \
                        and _seniority_rank(_str(b.get("title"))) \
                        > _seniority_rank(_str(a.get("title"))):
                    escalation = True
                    break
            if short_frac > 0.6 and escalation:
                reasons.append(
                    f"title_chaser: {short_frac:.0%} of roles under 18 months "
                    f"with title escalation")

    # 3. Pure CV/Speech/Robotics specialist with zero NLP/retrieval signal.
    texts = [_str(profile.get("headline"))] + \
            [_str(r.get("title")) + " " + _str(r.get("description"))
             for r in roles]
    cv_hits = sum(1 for t in texts if CV_SPEECH_ROBOTICS_RE.search(t))
    has_nlp = any(NLP_SIGNAL_RE.search(t) for t in texts)
    if cv_hits >= 2 and not has_nlp and domain_flag == 0.0:
        reasons.append(
            "pure_cv_speech_robotics: CV/Speech/Robotics specialist with "
            "zero NLP/retrieval signal")

    return bool(reasons), reasons


# ---------------------------------------------------------------------------
# Texts (for the Phase-2 embedding step)
# ---------------------------------------------------------------------------
def build_career_text(roles: list[dict]) -> str:
    """Recency-weighted concatenation: most recent role twice (title-prefixed),
    roles 2-3 once in full, older roles truncated to 250 chars — so the
    embedding represents who the candidate is NOW."""
    parts: list[str] = []
    for idx, role in enumerate(_roles_recent_first(roles)):
        desc = _str(role.get("description"))
        if not desc:
            continue
        text = f"{_str(role.get('title'))}. {desc}".strip(". ")
        if idx == 0:
            parts.extend([text, text])
        elif idx <= 2:
            parts.append(text)
        else:
            parts.append(text[:250])
    return " ".join(parts)


# ---------------------------------------------------------------------------
# Per-candidate driver
# ---------------------------------------------------------------------------
def compute_features(
    candidate: dict,
    lookup: dict[str, list[str]],
    required_names: set[str],
    ref_date: date,
) -> tuple[dict, dict]:
    """Compute one (FeatureRecord, TextRecord) pair for a raw candidate."""
    profile = candidate.get("profile")
    profile = profile if isinstance(profile, dict) else {}
    signals = candidate.get("redrob_signals")
    signals = signals if isinstance(signals, dict) else {}
    roles = _roles(candidate)
    skills = candidate.get("skills") if isinstance(candidate.get("skills"), list) else []

    descriptions = _all_descriptions(roles)

    # career
    company_type = company_type_score(roles, profile)
    role_rel = role_relevance_score(profile, roles)
    production = 1.0 if PRODUCTION_RE.search(descriptions) else 0.0
    domain = 1.0 if DOMAIN_RE.search(descriptions) else 0.0
    tenure = tenure_stability(roles)
    career = _clamp(0.40 * company_type + 0.30 * role_rel
                    + 0.10 * production + 0.10 * domain + 0.10 * tenure)

    # skills
    s_score, matched_req, matched_nth = skill_score(skills, lookup)

    # experience
    yoe = _num(profile.get("years_of_experience"))
    y_fit = yoe_fit(yoe)
    l_fit = location_fit(profile, signals)
    e_tier = education_tier_score(candidate.get("education"))
    experience = _clamp(0.40 * y_fit + 0.35 * l_fit + 0.25 * e_tier)

    # behavioral
    inactive = days_inactive(signals, ref_date)
    avail = availability_multiplier(signals, inactive)

    # disqualifiers + honeypot
    dq_flag, dq_reasons = disqualifiers(profile, roles, domain)
    hp_flag, hp_reasons, hp_diag = is_honeypot(candidate, ref_date=ref_date)

    features = {
        "candidate_id": _str(candidate.get("candidate_id")),
        # career
        "company_type_score": company_type,
        "role_relevance_score": role_rel,
        "production_signal": production,
        "domain_indicator": domain,
        "tenure_stability": tenure,
        "career_score": career,
        # skills
        "skill_score": s_score,
        "matched_required_skills": matched_req,
        "matched_nicetohave_skills": matched_nth,
        # experience
        "yoe_fit": y_fit,
        "location_fit": l_fit,
        "education_tier_score": e_tier,
        "experience_score": experience,
        # assessment
        "assessment_score": assessment_score(signals, required_names),
        # trajectory
        "trajectory_adjustment": trajectory_adjustment(roles),
        # availability
        "availability_multiplier": avail,
        # raw behavioral passthrough (-1 sentinels = unknown)
        "recruiter_response_rate": _num(signals.get("recruiter_response_rate"), -1.0),
        "interview_completion_rate": _num(signals.get("interview_completion_rate"), -1.0),
        "offer_acceptance_rate": _num(signals.get("offer_acceptance_rate"), -1.0),
        "days_inactive": inactive,
        "notice_period_days": int(_num(signals.get("notice_period_days"), 0)),
        "github_activity_score": _num(signals.get("github_activity_score"), -1.0),
        "open_to_work_flag": signals.get("open_to_work_flag") is True,
        "saved_by_recruiters_30d": int(_num(signals.get("saved_by_recruiters_30d"), 0)),
        "applications_submitted_30d": int(_num(signals.get("applications_submitted_30d"), 0)),
        # disqualifier
        "disqualifier_flag": dq_flag,
        "disqualifier_reasons": dq_reasons,
        # honeypot
        "is_honeypot": hp_flag,
        "honeypot_reasons": hp_reasons,
        "overlap_months_max": hp_diag["overlap_months_max"],
        "yoe_ratio": hp_diag["yoe_ratio"],
        "expert_zero_count": hp_diag["expert_zero_count"],
        # passthrough
        "current_title": _str(profile.get("current_title")),
        "years_of_experience": yoe if yoe is not None else 0.0,
        "location": _str(profile.get("location")),
        "country": _str(profile.get("country")),
    }
    texts = {
        "career_text": build_career_text(roles),
        "summary_text": (_str(profile.get("headline")) + " "
                         + _str(profile.get("summary"))).strip(),
    }
    return features, texts


def main() -> None:
    parser = argparse.ArgumentParser(description="Build features.pkl + texts.pkl")
    parser.add_argument("--candidates", default=str(DATA_DIR / "candidates.jsonl"))
    parser.add_argument("--skill-canon", default=str(PRECOMPUTED_DIR / "skill_canon.pkl"))
    parser.add_argument("--out-features", default=str(PRECOMPUTED_DIR / "features.pkl"))
    parser.add_argument("--out-texts", default=str(PRECOMPUTED_DIR / "texts.pkl"))
    parser.add_argument("--ref-date", default=None,
                        help="Reference 'today' (YYYY-MM-DD); defaults to wall clock")
    args = parser.parse_args()

    ref_date = (dateparser.parse(args.ref_date).date()
                if args.ref_date else date.today())

    with open(args.skill_canon, "rb") as f:
        canon_payload = pickle.load(f)
    lookup = build_skill_lookup(canon_payload["canon"])
    # Candidate skill names (lowercased) that count as required JD skills,
    # used to restrict the assessment-score average.
    required_names = {
        name.strip().lower()
        for jd in canon_payload["required_skills"]
        for name in canon_payload["canon"].get(jd, [])
    }

    features: dict[str, dict] = {}
    texts: dict[str, dict] = {}
    missing_id = 0
    for line_no, candidate in enumerate(
        tqdm(iter_candidates(args.candidates), desc="Building features",
             unit=" cand"), start=1
    ):
        feat, text = compute_features(candidate, lookup, required_names, ref_date)
        if not feat["candidate_id"]:
            feat["candidate_id"] = f"LINE_{line_no:07d}"
            missing_id += 1
        cid = feat["candidate_id"]
        features[cid] = feat
        texts[cid] = text

    for out_path, payload in ((args.out_features, features),
                              (args.out_texts, texts)):
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "wb") as f:
            pickle.dump(payload, f, protocol=pickle.HIGHEST_PROTOCOL)

    # Summary stats so a bad run is obvious at a glance.
    n = max(len(features), 1)
    def mean(key: str) -> float:
        return sum(f[key] for f in features.values()) / n
    print(f"\nProcessed {len(features)} candidates (ref date {ref_date})")
    if missing_id:
        print(f"  candidates missing candidate_id: {missing_id}")
    print(f"  honeypots:        {sum(f['is_honeypot'] for f in features.values())}")
    print(f"  disqualified:     {sum(f['disqualifier_flag'] for f in features.values())}")
    print(f"  mean career_score:     {mean('career_score'):.3f}")
    print(f"  mean skill_score:      {mean('skill_score'):.3f}")
    print(f"  mean experience_score: {mean('experience_score'):.3f}")
    print(f"  mean availability:     {mean('availability_multiplier'):.3f}")
    print(f"  with >=1 required skill match: "
          f"{sum(bool(f['matched_required_skills']) for f in features.values())}")
    print(f"  saved: {args.out_features}, {args.out_texts}")


if __name__ == "__main__":
    main()
