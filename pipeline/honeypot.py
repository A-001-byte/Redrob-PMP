"""honeypot.py — File B of the Phase-1 offline pipeline.

Pure-logic honeypot (fake/fraudulent profile) detection. No model loading.

A candidate is a honeypot if ANY of these four checks fires:
    1. Skill duration fraud   — "expert" skill with duration_months < 3.
    2. Experience inflation   — sum of career durations < stated YoE months
                                * 0.35 (generous allowance for gaps).
    3. Assessment contradiction — "expert" skill whose Redrob assessment
                                score is < 25/100.
    4. Impossible timeline    — two roles overlapping by > 6 months.

Public interface (locked by the Phase-1 contract):
    is_honeypot(candidate, ref_date=None) -> (flag, reasons, diagnostics)
where diagnostics == {"overlap_months_max": float,
                      "yoe_ratio": float,
                      "expert_zero_count": int}

`ref_date` is the date that open-ended roles (is_current / null end_date /
"present") are extended to. It defaults to the wall clock, but
build_features.py passes the dataset's inferred reference date because the
data was generated months before run time.

Every check treats missing / null / unparseable fields as "no signal" and
never raises on malformed input.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from dateutil import parser as dateparser

from config_loader import CONFIG

_HP = CONFIG["honeypot"]

# Tunables, named so the numbers in the checks are self-explanatory.
EXPERT_MIN_MONTHS = _HP["expert_min_duration_months"]
YOE_GAP_ALLOWANCE = _HP["yoe_gap_tolerance"]
ASSESSMENT_CONTRADICTION = _HP["expert_assessment_min"]
MAX_OVERLAP_MONTHS = _HP["overlap_months_threshold"]
_DAYS_PER_MONTH = 30.44          # mean Gregorian month length

_PRESENT_TOKENS = {"present", "current", "now", "ongoing"}


def _safe_int(value: Any) -> int | None:
    """Return value as int if it is a real number, else None (no signal)."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value)
    return None


def _parse_date(value: Any, default: date | None = None) -> date | None:
    """Parse an ISO-ish date string; 'present'/None map to `default`.

    Returns None (no signal) when the value is unparseable.
    """
    if value is None:
        return default
    if isinstance(value, str):
        text = value.strip()
        if not text or text.lower() in _PRESENT_TOKENS:
            return default
        try:
            return dateparser.parse(text).date()
        except (ValueError, OverflowError, TypeError):
            return None
    return None


def _iter_skills(candidate: dict) -> list[dict]:
    skills = candidate.get("skills") if isinstance(candidate, dict) else None
    if not isinstance(skills, list):
        return []
    return [s for s in skills if isinstance(s, dict)]


def _iter_roles(candidate: dict) -> list[dict]:
    roles = candidate.get("career_history") if isinstance(candidate, dict) else None
    if not isinstance(roles, list):
        return []
    return [r for r in roles if isinstance(r, dict)]


def _check_skill_durations(skills: list[dict]) -> tuple[list[str], int]:
    """Check 1 + the expert_zero_count diagnostic."""
    reasons: list[str] = []
    expert_zero_count = 0
    for skill in skills:
        if skill.get("proficiency") != "expert":
            continue
        months = _safe_int(skill.get("duration_months"))
        if months is None:
            continue  # no signal
        name = skill.get("name") if isinstance(skill.get("name"), str) else "?"
        if months == 0:
            expert_zero_count += 1
        if months < EXPERT_MIN_MONTHS:
            reasons.append(
                f"skill_duration_fraud: '{name}' claimed expert with "
                f"{months} months experience"
            )
    return reasons, expert_zero_count


def _check_experience_inflation(
    candidate: dict, roles: list[dict]
) -> tuple[list[str], float]:
    """Check 2 + the yoe_ratio diagnostic.

    yoe_ratio = total career months / max(stated months, 1). A ratio near or
    above 1.0 is healthy; below YOE_GAP_ALLOWANCE means the stated years of
    experience are not backed by the career history.
    """
    profile = candidate.get("profile") if isinstance(candidate, dict) else None
    yoe = _safe_int(profile.get("years_of_experience")) if isinstance(profile, dict) else None

    durations = [
        m for r in roles
        if (m := _safe_int(r.get("duration_months"))) is not None and m >= 0
    ]
    total_months = sum(durations)

    if yoe is None or yoe <= 0 or not durations:
        return [], 1.0  # no signal -> neutral ratio

    stated_months = yoe * 12
    ratio = total_months / max(stated_months, 1)
    if total_months < stated_months * YOE_GAP_ALLOWANCE:
        return [
            f"experience_inflation: career history covers {total_months} "
            f"months but profile claims {yoe} years ({stated_months} months)"
        ], ratio
    return [], ratio


def _check_assessment_contradiction(candidate: dict, skills: list[dict]) -> list[str]:
    """Check 3. Assessment keys matched case-insensitively after strip."""
    signals = candidate.get("redrob_signals") if isinstance(candidate, dict) else None
    scores = signals.get("skill_assessment_scores") if isinstance(signals, dict) else None
    if not isinstance(scores, dict):
        return []

    scores_lower: dict[str, float] = {}
    for key, value in scores.items():
        if isinstance(key, str) and isinstance(value, (int, float)) \
                and not isinstance(value, bool):
            scores_lower[key.strip().lower()] = float(value)

    reasons: list[str] = []
    for skill in skills:
        if skill.get("proficiency") != "expert":
            continue
        name = skill.get("name")
        if not isinstance(name, str):
            continue
        score = scores_lower.get(name.strip().lower())
        if score is not None and score < ASSESSMENT_CONTRADICTION:
            reasons.append(
                f"assessment_contradiction: '{name.strip()}' claimed expert "
                f"but assessed {score:.0f}/100"
            )
    return reasons


def _check_timeline(roles: list[dict], ref_date: date) -> tuple[list[str], float]:
    """Check 4 + the overlap_months_max diagnostic.

    Open-ended roles (is_current, null/'present' end_date) extend to ref_date.
    Roles with unparseable dates contribute no signal.
    """
    intervals: list[tuple[date, date, str]] = []
    for role in roles:
        start = _parse_date(role.get("start_date"))
        if start is None:
            continue
        end_default = ref_date if role.get("is_current") else None
        end = _parse_date(role.get("end_date"), default=ref_date)
        if end is None:
            end = end_default
        if end is None or end < start:
            continue
        company = role.get("company") if isinstance(role.get("company"), str) else "?"
        intervals.append((start, end, company))

    reasons: list[str] = []
    overlap_months_max = 0.0
    for i in range(len(intervals)):
        for j in range(i + 1, len(intervals)):
            s1, e1, c1 = intervals[i]
            s2, e2, c2 = intervals[j]
            overlap_days = (min(e1, e2) - max(s1, s2)).days
            if overlap_days <= 0:
                continue
            overlap_months = overlap_days / _DAYS_PER_MONTH
            overlap_months_max = max(overlap_months_max, overlap_months)
            if overlap_months > MAX_OVERLAP_MONTHS:
                reasons.append(
                    f"impossible_timeline: roles at '{c1}' and '{c2}' overlap "
                    f"by {overlap_months:.1f} months"
                )
    return reasons, overlap_months_max


def is_honeypot(
    candidate: dict, ref_date: date | datetime | None = None
) -> tuple[bool, list[str], dict]:
    """Run all honeypot checks on one raw candidate record.

    Returns (flag, reasons, diagnostics). diagnostics always contains
    overlap_months_max (float), yoe_ratio (float), expert_zero_count (int),
    even when no check fires, so build_features.py can pass them through
    as LightGBM features.
    """
    if isinstance(ref_date, datetime):
        ref_date = ref_date.date()
    if ref_date is None:
        ref_date = date.today()
    if not isinstance(candidate, dict):
        candidate = {}

    skills = _iter_skills(candidate)
    roles = _iter_roles(candidate)

    duration_reasons, expert_zero_count = _check_skill_durations(skills)
    inflation_reasons, yoe_ratio = _check_experience_inflation(candidate, roles)
    assessment_reasons = _check_assessment_contradiction(candidate, skills)
    timeline_reasons, overlap_months_max = _check_timeline(roles, ref_date)

    reasons = (
        duration_reasons + inflation_reasons
        + assessment_reasons + timeline_reasons
    )
    diagnostics = {
        "overlap_months_max": round(overlap_months_max, 2),
        "yoe_ratio": round(yoe_ratio, 3),
        "expert_zero_count": expert_zero_count,
    }
    return bool(reasons), reasons, diagnostics


# ---------------------------------------------------------------------------
# Smoke test: targeted cases for each check, then a pass over the sample file.
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys
    from pathlib import Path

    REF = date(2025, 2, 1)

    clean = {
        "profile": {"years_of_experience": 7},
        "career_history": [
            {"company": "A", "start_date": "2023-06-01", "end_date": None,
             "is_current": True, "duration_months": 20},
            {"company": "B", "start_date": "2021-03-15",
             "end_date": "2023-05-30", "duration_months": 26},
        ],
        "skills": [{"name": "Python", "proficiency": "expert",
                    "duration_months": 84}],
        "redrob_signals": {"skill_assessment_scores": {"Python": 92}},
    }
    flag, reasons, diag = is_honeypot(clean, ref_date=REF)
    assert not flag, f"clean candidate flagged: {reasons}"

    fraud = {"skills": [{"name": "FAISS", "proficiency": "expert",
                         "duration_months": 0}]}
    flag, reasons, diag = is_honeypot(fraud, ref_date=REF)
    assert flag and "skill_duration_fraud" in reasons[0]
    assert diag["expert_zero_count"] == 1

    inflated = {"profile": {"years_of_experience": 10},
                "career_history": [{"company": "A", "duration_months": 24}]}
    flag, reasons, diag = is_honeypot(inflated, ref_date=REF)
    assert flag and "experience_inflation" in reasons[0]
    assert abs(diag["yoe_ratio"] - 0.2) < 0.01

    contradicted = {
        "skills": [{"name": "Python", "proficiency": "expert",
                    "duration_months": 60}],
        "redrob_signals": {"skill_assessment_scores": {"python": 10}},
    }
    flag, reasons, diag = is_honeypot(contradicted, ref_date=REF)
    assert flag and "assessment_contradiction" in reasons[0]

    overlapping = {"career_history": [
        {"company": "A", "start_date": "2020-01-01", "end_date": "2022-01-01"},
        {"company": "B", "start_date": "2020-06-01", "end_date": "2021-12-01"},
    ]}
    flag, reasons, diag = is_honeypot(overlapping, ref_date=REF)
    assert flag and "impossible_timeline" in reasons[0]
    assert diag["overlap_months_max"] > 17

    garbage = {"profile": None, "career_history": "nope",
               "skills": [None, "x", {"proficiency": "expert"}],
               "redrob_signals": {"skill_assessment_scores": [1, 2]}}
    flag, reasons, diag = is_honeypot(garbage, ref_date=REF)
    assert not flag and diag == {"overlap_months_max": 0.0,
                                 "yoe_ratio": 1.0, "expert_zero_count": 0}

    print("All targeted honeypot checks pass.")

    from build_skill_canon import DATA_DIR, iter_candidates

    sample = Path(sys.argv[1]) if len(sys.argv) > 1 \
        else DATA_DIR / "sample_candidates.json"
    if sample.exists():
        n = flagged = 0
        for cand in iter_candidates(sample):
            n += 1
            hit, why, _ = is_honeypot(cand, ref_date=REF)
            if hit:
                flagged += 1
                print(f"  HONEYPOT {cand.get('candidate_id', '?')}: {why[0]}")
        print(f"Sample pass: {flagged}/{n} flagged.")
    else:
        print(f"(no sample file at {sample} — skipped file pass)")
