"""reasoning.py — File B of Phase 3: rule-based per-candidate reasoning.

generate_reasoning() produces the 1-2 sentence (target 15-40 words)
justification column of submission.csv. No LLM, no invented facts: every
clause is assembled from the candidate's own FeatureRecord and the
parts_dict breakdown returned by scorer.composite_score().

Structure: [strength clause from the highest-contributing score parts]
+ [specific evidence: title, YoE, matched skill groups, location,
behavioral signal] + [for ranks beyond ~30, one honest concern drawn from
the weakest part or a concrete negative signal].

Tone tracks rank (1-10 confident / 11-30 positive / 31-70 balanced /
71-100 candid), and each band has >= 6 sentence skeletons. Selection is
deterministic via SHA-256 of the candidate_id — NOT the builtin hash(),
which is salt-randomised per process and would break run-to-run
reproducibility. Same input always yields the same sentence; adjacent
ranks draw different skeletons.
"""
from __future__ import annotations

import hashlib
import re

from config_loader import CONFIG

_RC = CONFIG["reasoning"]

# Score parts eligible as "strengths", in parts_dict (weights applied).
_BLEND_PARTS = ("semantic", "career", "skill", "experience", "assessment")

# Concern triggers on raw signals (checked before falling back to the
# weakest blend part). Thresholds are deliberately conservative so a
# concern is only voiced when the negative is unambiguous.
_NOTICE_CONCERN_DAYS = _RC["notice_concern_days"]
_INACTIVE_CONCERN_DAYS = _RC["inactive_concern_days"]
_LOW_LOCATION_FIT = _RC["low_location_fit"]

_CONCERN_RANK_FROM = _RC["concern_rank_from"]

_TONE_BANDS = (             # (max_rank, band_name)
    (_RC["band_confident_max"], "confident"),
    (_RC["band_positive_max"], "positive"),
    (_RC["band_balanced_max"], "balanced"),
    (10**9, "candid"),
)

# {s} strength clause, {e} evidence clause, {c} concern clause.
_SKELETONS: dict[str, list[str]] = {
    "confident": [
        "Exceptional fit: {s}, backed by {e}.",
        "A standout profile: {s}, combined with {e}.",
        "Top-tier match: {s}; {e} seals it.",
        "Clear front-runner thanks to {s} and {e}.",
        "Outstanding alignment with the role: {s}, plus {e}.",
        "Hard to argue with {s} here, reinforced by {e}.",
    ],
    "positive": [
        "Strong candidate: {s}, supported by {e}.",
        "A very good fit, showing {s} alongside {e}.",
        "Convincing profile: {s}, and {e} adds confidence.",
        "Ranks highly on {s}, with {e} as further evidence.",
        "Solidly qualified: {s}; {e} rounds out the picture.",
        "Brings {s} to the table, underlined by {e}.",
    ],
    "balanced": [
        "Solid match: {s} and {e}, though {c}.",
        "A capable profile with {s} and {e}; the caveat is that {c}.",
        "Worth shortlisting for {s} and {e}, even if {c}.",
        "Shows {s}, with {e}; note that {c}.",
        "Good overall signal from {s} plus {e}, although {c}.",
        "Competitive on {s} and {e}, but {c}.",
    ],
    "candid": [
        "A boundary pick: {s} and {e}, but {c}.",
        "Makes the cut on {s} plus {e}; the trade-off is that {c}.",
        "Included for {s} and {e}, despite the fact that {c}.",
        "Marginal but defensible: {s} and {e}, yet {c}.",
        "Just inside the top 100 thanks to {s} and {e}, though {c}.",
        "A calculated bet on {s} and {e}, accepting that {c}.",
    ],
}


def _stable_hash(candidate_id: str) -> int:
    """Process-independent integer hash (builtin hash() is salted)."""
    return int(hashlib.sha256(candidate_id.encode("utf-8")).hexdigest(), 16)


# Initialisms whose letter-name starts with a vowel sound ("an ML Engineer").
_VOWEL_SOUND_INITIALS = set("AEFHILMNORSX")


def _article(noun_phrase: str) -> str:
    """'a'/'an' for a title: handles both words and spelled-out initialisms."""
    first = noun_phrase.split()[0]
    if first.isupper() and len(first) <= 4:          # initialism: AI, ML, NLP
        return "an" if first[0] in _VOWEL_SOUND_INITIALS else "a"
    return "an" if first[0].upper() in "AEIOU" else "a"


def _fmt_groups(groups: list[str], limit: int = 2) -> str:
    shown = groups[:limit]
    return " and ".join(shown)


def _strength_clause(record: dict, parts: dict, h: int) -> str:
    """Phrase for the highest-weighted contribution, from real fields only."""
    ranked = sorted(_BLEND_PARTS, key=lambda k: parts.get(k, 0.0), reverse=True)
    top = ranked[0]
    if top == "skill" and record.get("matched_required_skills"):
        return (f"direct skill coverage of "
                f"{_fmt_groups(record['matched_required_skills'])}")
    if top == "career":
        if record.get("production_signal") == 1.0:
            return "a highly relevant career with production ML deployments"
        return "a highly relevant career track record"
    if top == "assessment":
        return "strong verified skill assessments"
    if top == "experience":
        return "a well-matched experience and location profile"
    # semantic (or skill without named matches)
    variants = ("career history that closely mirrors the role's focus",
                "work history squarely in this role's territory")
    return variants[h % len(variants)]


def _evidence_pieces(record: dict) -> list[str]:
    """Concrete, verifiable facts; only emitted when the field supports them."""
    pieces: list[str] = []
    title = record.get("current_title")
    yoe = record.get("years_of_experience")
    if isinstance(title, str) and title.strip():
        if isinstance(yoe, (int, float)) and yoe > 0:
            pieces.append(f"{yoe:g} years' experience as "
                          f"{_article(title.strip())} {title.strip()}")
        else:
            pieces.append(f"a current role as {title.strip()}")
    location = record.get("location")
    if isinstance(location, str) and location.strip() \
            and record.get("location_fit", 0.0) >= _LOW_LOCATION_FIT:
        pieces.append(f"a base in {location.strip()}")
    groups = record.get("matched_required_skills") or []
    if groups:
        pieces.append(f"matched {_fmt_groups(groups)} skills")
    if record.get("open_to_work_flag"):
        pieces.append("an active open-to-work status")
    days = record.get("days_inactive", -1)
    if isinstance(days, (int, float)) and 0 <= days <= 7:
        pieces.append("recent platform activity")
    if record.get("notice_period_days") == 0:
        pieces.append("immediate availability")
    return pieces or ["a consistent overall profile"]


def _concern_clause(record: dict, parts: dict, h: int) -> str:
    """One honest negative: concrete raw signals first, weakest part after."""
    concerns: list[str] = []
    notice = record.get("notice_period_days")
    if isinstance(notice, (int, float)) and notice >= _NOTICE_CONCERN_DAYS:
        concerns.append(f"the {notice:g}-day notice period delays a start")
    days = record.get("days_inactive")
    if isinstance(days, (int, float)) and days >= _INACTIVE_CONCERN_DAYS:
        concerns.append(f"the profile has been inactive for {days:g} days")
    location = record.get("location")
    if record.get("location_fit", 1.0) < _LOW_LOCATION_FIT \
            and isinstance(location, str) and location.strip():
        concerns.append(f"being based in {location.strip()} would require "
                        f"relocation")
    if len(record.get("matched_required_skills") or []) <= 1:
        concerns.append("the listed skills only partially cover the "
                        "required groups")
    if concerns:
        return concerns[h % len(concerns)]
    weakest = min(_BLEND_PARTS, key=lambda k: parts.get(k, 0.0))
    return {
        "semantic": "the career history is a looser thematic match",
        "career": "the career background is less squarely aligned",
        "skill": "explicit skill-list coverage is thinner than peers",
        "experience": "the experience profile is only a partial fit",
        "assessment": "assessment results are middling",
    }[weakest]


def generate_reasoning(
    candidate_id: str, feature_record: dict, parts_dict: dict, rank: int
) -> str:
    """Deterministic 1-2 sentence justification, CSV-safe."""
    h = _stable_hash(candidate_id)
    band = next(name for max_rank, name in _TONE_BANDS if rank <= max_rank)
    skeleton = _SKELETONS[band][h % len(_SKELETONS[band])]

    strength = _strength_clause(feature_record, parts_dict, h)
    pieces = _evidence_pieces(feature_record)
    # rotate which evidence leads so adjacent rows don't all open alike
    start = (h // 7) % len(pieces)
    chosen = list(dict.fromkeys(
        [pieces[start], pieces[(start + 1) % len(pieces)]]))
    # ", as well as" rather than a second "and": the skeleton and the
    # strength clause already use "and", and triple-and chains read badly.
    evidence = ", as well as ".join(chosen)

    text = skeleton.format(
        s=strength, e=evidence,
        c=_concern_clause(feature_record, parts_dict, h)
        if rank >= _CONCERN_RANK_FROM else "",
    )
    # CSV safety: collapse whitespace/newlines, escape double quotes.
    text = re.sub(r"\s+", " ", text).strip().replace('"', "'")
    return text


# ---------------------------------------------------------------------------
# Demo: 10 mock records across the four tone bands — eyeball the variety.
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import itertools

    def _mock(cid, title, yoe, loc, loc_fit, groups, **extra):
        rec = {
            "current_title": title, "years_of_experience": yoe,
            "location": loc, "location_fit": loc_fit,
            "matched_required_skills": groups, "production_signal": 1.0,
            "open_to_work_flag": False, "days_inactive": 12,
            "notice_period_days": 30,
        }
        rec.update(extra)
        return rec

    def _parts(**kv):
        base = {"semantic": 0.15, "career": 0.20, "skill": 0.10,
                "experience": 0.06, "assessment": 0.09}
        base.update(kv)
        return base

    demo = [
        (1, _mock("CAND_A", "Senior ML Engineer", 7, "Pune, Maharashtra", 1.0,
                  ["vector search & retrieval", "Python"]), _parts(career=0.27)),
        (5, _mock("CAND_B", "Lead AI Engineer", 9, "Noida, Uttar Pradesh", 1.0,
                  ["embedding models"], open_to_work_flag=True),
         _parts(skill=0.18)),
        (9, _mock("CAND_C", "Staff ML Engineer", 11, "Mumbai, Maharashtra", 0.8,
                  ["Python", "ranking & evaluation"]), _parts(semantic=0.24)),
        (15, _mock("CAND_D", "Senior NLP Engineer", 6, "Delhi, Delhi", 1.0,
                   ["vector search & retrieval"]), _parts(assessment=0.14)),
        (25, _mock("CAND_E", "Applied Scientist", 8, "Bengaluru, Karnataka", 0.8,
                   ["embedding models", "Python"], notice_period_days=0),
         _parts(career=0.26)),
        (40, _mock("CAND_F", "ML Engineer", 5, "Berlin", 0.2,
                   ["Python"]), _parts(experience=0.03)),
        (55, _mock("CAND_G", "Senior AI Engineer", 7, "Jaipur, Rajasthan", 0.8,
                   [], days_inactive=95), _parts(skill=0.02)),
        (70, _mock("CAND_H", "Search Engineer", 6, "Chennai, Tamil Nadu", 0.8,
                   ["vector search & retrieval"], notice_period_days=90),
         _parts(semantic=0.22)),
        (88, _mock("CAND_I", "Data Scientist", 4, "Kolkata, West Bengal", 0.8,
                   ["Python"], days_inactive=130), _parts(assessment=0.04)),
        (95, _mock("CAND_J", "AI Research Engineer", 5, "Austin", 0.2,
                   ["embedding models"]), _parts(career=0.12)),
    ]

    outputs = []
    for rank, rec, parts in demo:
        text = generate_reasoning(rec_id := f"CAND_{rank:04d}X", rec, parts, rank)
        again = generate_reasoning(rec_id, rec, parts, rank)
        assert text == again, "non-deterministic output"
        words = len(text.split())
        assert 10 <= words <= 45, f"rank {rank}: {words} words — {text}"
        assert "\n" not in text and '"' not in text
        outputs.append(text)
        print(f"rank {rank:3d} ({words:2d}w): {text}")

    for a, b in itertools.combinations(outputs, 2):
        assert a != b, f"duplicate reasoning: {a}"
    print("\nall 10 distinct, deterministic, CSV-safe, within word budget")
