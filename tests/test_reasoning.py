"""Unit tests for pipeline/reasoning.py — generate_reasoning output contract,
zero-hallucination checks, determinism, variety, and tone-by-rank behaviour.

All tests are deterministic, use only stdlib + pytest, and build synthetic
FeatureRecords via the make_feature() helper.
"""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path

import pytest

# Ensure pipeline/ is importable regardless of working directory.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))

from reasoning import (  # noqa: E402
    _CONCERN_RANK_FROM,
    _SKELETONS,
    _TONE_BANDS,
    generate_reasoning,
)

# ---------------------------------------------------------------------------
# Synthetic FeatureRecord helper
# ---------------------------------------------------------------------------
_DEFAULTS: dict = {
    "candidate_id": "CAND_0000001",
    "company_type_score": 0.5,
    "role_relevance_score": 0.5,
    "production_signal": 0.0,
    "domain_indicator": 0.0,
    "tenure_stability": 0.5,
    "career_score": 0.60,
    "skill_score": 0.30,
    "matched_required_skills": ["embedding models"],
    "matched_nicetohave_skills": [],
    "yoe_fit": 0.7,
    "location_fit": 0.7,
    "education_tier_score": 0.5,
    "experience_score": 0.70,
    "assessment_score": 0.50,
    "trajectory_adjustment": 0.00,
    "availability_multiplier": 1.00,
    "recruiter_response_rate": 0.0,
    "interview_completion_rate": 0.0,
    "offer_acceptance_rate": -1.0,
    "days_inactive": 30,
    "notice_period_days": 30,
    "github_activity_score": -1.0,
    "open_to_work_flag": False,
    "saved_by_recruiters_30d": 0,
    "applications_submitted_30d": 0,
    "disqualifier_flag": False,
    "disqualifier_reasons": [],
    "is_honeypot": False,
    "honeypot_reasons": [],
    "overlap_months_max": 0.0,
    "yoe_ratio": 1.0,
    "expert_zero_count": 0,
    "current_title": "ML Engineer",
    "years_of_experience": 6.0,
    "location": "Pune",
    "country": "India",
}


def make_feature(overrides: dict | None = None) -> dict:
    """Build a valid FeatureRecord-shaped dict with sensible defaults."""
    rec = dict(_DEFAULTS)
    if overrides:
        rec.update(overrides)
    return rec


def _parts(**overrides) -> dict:
    """Build a parts_dict with default mid-tier weights applied."""
    base = {
        "semantic": 0.15, "career": 0.18, "skill": 0.06,
        "experience": 0.07, "assessment": 0.075,
    }
    base.update(overrides)
    return base


# ===================================================================
# Group 1 — basic contract
# ===================================================================
class TestBasicContract:

    def test_reasoning_returns_string(self):
        """generate_reasoning with a valid FeatureRecord must return a str."""
        rec = make_feature()
        result = generate_reasoning("CAND_0000001", rec, _parts(), rank=1)
        assert isinstance(result, str)

    def test_reasoning_length_in_range(self):
        """Output word count must be between 10 and 60 words."""
        rec = make_feature()
        result = generate_reasoning("CAND_0000001", rec, _parts(), rank=50)
        word_count = len(result.split())
        assert 10 <= word_count <= 60, (
            f"Word count {word_count} outside [10, 60]: {result}")

    def test_reasoning_csv_safe(self):
        """Output must not contain unescaped double quotes or newline chars."""
        rec = make_feature()
        result = generate_reasoning("CAND_0000001", rec, _parts(), rank=50)
        assert '"' not in result, f'Found double quote in: {result}'
        assert "\n" not in result, f"Found newline in: {result}"
        assert "\r" not in result, f"Found carriage return in: {result}"


# ===================================================================
# Group 2 — zero hallucination
# ===================================================================
class TestZeroHallucination:

    def test_reasoning_uses_real_title(self):
        """If current_title = 'Senior ML Engineer', the reasoning string must
        contain that title (or a recognisable substring), not an invented one.
        Uses CAND_0000003 whose hash rotation surfaces the title evidence."""
        rec = make_feature({"current_title": "Senior ML Engineer"})
        result = generate_reasoning("CAND_0000003", rec, _parts(), rank=5)
        assert "Senior ML Engineer" in result, (
            f"Expected 'Senior ML Engineer' in: {result}")

    def test_reasoning_no_fake_yoe(self):
        """If years_of_experience = 11, the reasoning must not claim a
        different YoE value. If it mentions YoE at all, it must say '11'."""
        rec = make_feature({"years_of_experience": 11})
        result = generate_reasoning("CAND_0000001", rec, _parts(), rank=5)
        # If the reasoning mentions years, the number must be 11
        import re
        yoe_matches = re.findall(r"(\d+)\s*years?", result)
        for match in yoe_matches:
            assert match == "11", (
                f"Expected 11 years but found {match} in: {result}")

    def test_reasoning_location_consistent(self):
        """If location = 'Trivandrum', any location mention must match."""
        rec = make_feature({"location": "Trivandrum", "location_fit": 0.8})
        result = generate_reasoning("CAND_0000001", rec, _parts(), rank=5)
        # If the reasoning mentions a city at all from the location field,
        # it must be "Trivandrum". Check it doesn't mention a different city.
        if "Trivandrum" in result:
            pass  # correct
        # Verify no OTHER Indian city names leaked in
        for fake_city in ["Mumbai", "Delhi", "Bangalore", "Noida", "Kolkata"]:
            assert fake_city not in result, (
                f"Fake city {fake_city} found in: {result}")


# ===================================================================
# Group 3 — determinism and variety
# ===================================================================
class TestDeterminismAndVariety:

    def test_reasoning_deterministic(self):
        """Same FeatureRecord + same rank → identical output on two calls.
        SHA-256 of both strings must match."""
        rec = make_feature()
        r1 = generate_reasoning("CAND_0000001", rec, _parts(), rank=1)
        r2 = generate_reasoning("CAND_0000001", rec, _parts(), rank=1)
        h1 = hashlib.sha256(r1.encode()).hexdigest()
        h2 = hashlib.sha256(r2.encode()).hexdigest()
        assert h1 == h2, f"Non-deterministic output:\n  {r1}\n  {r2}"

    def test_reasoning_variety_across_ids(self):
        """10 synthetic candidates with different candidate_ids but identical
        FeatureRecords and rank=1 → at least 3 distinct outputs."""
        rec = make_feature()
        parts = _parts()
        outputs = set()
        for i in range(10):
            cid = f"CAND_{i:07d}"
            text = generate_reasoning(cid, rec, parts, rank=1)
            outputs.add(text)
        assert len(outputs) >= 3, (
            f"Only {len(outputs)} distinct outputs from 10 candidates")


# ===================================================================
# Group 4 — tone by rank
# ===================================================================
class TestToneByRank:

    def test_high_rank_confident_tone(self):
        """rank=1 reasoning for a strong candidate must not contain hedging
        words that belong to balanced/candid tones."""
        rec = make_feature({
            "career_score": 0.9, "skill_score": 0.8,
            "assessment_score": 0.9, "experience_score": 0.85,
            "matched_required_skills": ["embedding models", "Python",
                                         "vector search & retrieval"],
        })
        parts = _parts(career=0.27, skill=0.16, assessment=0.135)
        result = generate_reasoning("CAND_0000001", rec, parts, rank=1)
        # Confident-band skeletons never contain {c} (concern clause),
        # so no concern phrases should appear.
        hedging = ["concern", "however", "limited", "weak", "gap",
                    "caveat", "trade-off", "despite"]
        for word in hedging:
            assert word not in result.lower(), (
                f"Hedging word '{word}' found in rank-1 reasoning: {result}")

    def test_low_rank_candid_tone(self):
        """rank=85 reasoning for a weak candidate — the skeleton includes a
        concern clause ({c}) since rank >= _CONCERN_RANK_FROM (31)."""
        rec = make_feature({
            "career_score": 0.3, "skill_score": 0.1,
            "assessment_score": 0.2, "experience_score": 0.3,
            "days_inactive": 130,
            "matched_required_skills": [],
        })
        parts = _parts(career=0.09, skill=0.02, assessment=0.03,
                        experience=0.03)
        result = generate_reasoning("CAND_0000001", rec, parts, rank=85)
        # All candid skeletons contain one of: "but", "though", "yet",
        # "despite", "trade-off", "accepting that" — verify at least one.
        concern_markers = ["but", "though", "yet", "despite",
                           "trade-off", "accepting that"]
        assert any(m in result.lower() for m in concern_markers), (
            f"No concern marker found in rank-85 reasoning: {result}")
