"""Unit tests for pipeline/scorer.py — composite scoring, consistency,
anchor penalty, and assessment gate functions.

All tests are deterministic, use only stdlib + pytest + numpy, and build
synthetic FeatureRecords via the make_feature() helper.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

# Ensure pipeline/ is importable regardless of working directory.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))

from scorer import (  # noqa: E402
    ANCHOR_HARD,
    ANCHOR_PENALTY_HARD,
    ANCHOR_PENALTY_SOFT,
    ANCHOR_SOFT,
    ASSESSMENT_GATE_MIN,
    CONSISTENCY_BONUS,
    CONSISTENCY_HIGH,
    CONSISTENCY_LOW,
    DQ_MULTIPLIER,
    HONEYPOT_MULTIPLIER,
    assessment_gate_violations,
    composite_score,
    consistency_adjustment,
    negative_anchor_penalty,
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


# ===================================================================
# Group 1 — composite_score ordering
# ===================================================================
class TestCompositeScoreOrdering:

    def test_star_candidate_scores_highest(self):
        """A perfect-profile candidate must score > 0.90."""
        rec = make_feature({
            "career_score": 1.0, "skill_score": 1.0, "assessment_score": 1.0,
            "experience_score": 1.0, "trajectory_adjustment": 0.05,
            "availability_multiplier": 1.25,
            "disqualifier_flag": False, "is_honeypot": False,
        })
        comp, _base, _parts = composite_score(rec, semantic_score=1.0,
                                               consistency=0.03,
                                               anchor_pen=0.0)
        assert comp > 0.90, f"Star composite {comp} should exceed 0.90"

    def test_honeypot_scores_zero(self):
        """A honeypot candidate must score exactly 0.0 (HONEYPOT_MULTIPLIER=0)."""
        rec = make_feature({
            "career_score": 1.0, "skill_score": 1.0, "assessment_score": 1.0,
            "experience_score": 1.0, "trajectory_adjustment": 0.05,
            "availability_multiplier": 1.25,
            "is_honeypot": True, "disqualifier_flag": False,
        })
        comp, _base, _parts = composite_score(rec, 1.0, 0.03, 0.0)
        assert comp == HONEYPOT_MULTIPLIER  # 0.0

    def test_disqualifier_near_zero(self):
        """A disqualified (non-honeypot) candidate must score < 0.10."""
        rec = make_feature({
            "career_score": 1.0, "skill_score": 1.0, "assessment_score": 1.0,
            "experience_score": 1.0, "trajectory_adjustment": 0.05,
            "availability_multiplier": 1.25,
            "disqualifier_flag": True, "is_honeypot": False,
        })
        comp, _base, _parts = composite_score(rec, 1.0, 0.03, 0.0)
        assert comp < 0.10, f"DQ composite {comp} should be < 0.10"
        # Verify the multiplier was applied correctly.
        assert comp == pytest.approx(
            _base * 1.25 * DQ_MULTIPLIER, abs=1e-9)


# ===================================================================
# Group 2 — consistency_adjustment
# ===================================================================
DIM = 384  # SBERT embedding dimension


def _unit_vec(index: int = 0, dim: int = DIM) -> np.ndarray:
    """Unit vector with a 1.0 at `index`."""
    v = np.zeros(dim, dtype=np.float32)
    v[index] = 1.0
    return v


def _vec_with_cosine(target_cos: float, dim: int = DIM) -> tuple[np.ndarray, np.ndarray]:
    """Return (v1, v2) unit vectors with cosine similarity = target_cos."""
    v1 = _unit_vec(0, dim)
    v2 = np.zeros(dim, dtype=np.float32)
    v2[0] = target_cos
    v2[1] = np.sqrt(1.0 - target_cos ** 2)
    return v1, v2


class TestConsistencyAdjustment:

    def test_consistency_high_sim_positive(self):
        """cosine > CONSISTENCY_HIGH → +CONSISTENCY_BONUS."""
        v1, v2 = _vec_with_cosine(CONSISTENCY_HIGH + 0.05)
        result = consistency_adjustment(v1, v2, summary_text="A" * 30)
        assert result == CONSISTENCY_BONUS

    def test_consistency_mid_sim_zero(self):
        """cosine between CONSISTENCY_LOW and CONSISTENCY_HIGH → 0.0."""
        mid_cos = (CONSISTENCY_LOW + CONSISTENCY_HIGH) / 2.0
        v1, v2 = _vec_with_cosine(mid_cos)
        result = consistency_adjustment(v1, v2, summary_text="A" * 30)
        assert result == 0.0

    def test_consistency_low_sim_negative(self):
        """cosine < CONSISTENCY_LOW → -CONSISTENCY_BONUS."""
        v1, v2 = _vec_with_cosine(CONSISTENCY_LOW - 0.10)
        result = consistency_adjustment(v1, v2, summary_text="A" * 30)
        assert result == -CONSISTENCY_BONUS


# ===================================================================
# Group 3 — negative_anchor_penalty
# ===================================================================
class TestNegativeAnchorPenalty:

    def test_anchor_penalty_low_sim_zero(self):
        """max cosine to all anchors < ANCHOR_SOFT → penalty = 0.0."""
        career = _unit_vec(0)
        anchor = _unit_vec(1)  # orthogonal → cosine 0.0
        assert negative_anchor_penalty(career, anchor.reshape(1, -1)) == 0.0

    def test_anchor_penalty_mid_sim_five(self):
        """max cosine in [ANCHOR_SOFT, ANCHOR_HARD) → penalty = 0.05."""
        career = _unit_vec(0)
        mid = (ANCHOR_SOFT + ANCHOR_HARD) / 2.0
        anchor = np.zeros(DIM, dtype=np.float32)
        anchor[0] = mid
        anchor[1] = np.sqrt(1.0 - mid ** 2)
        result = negative_anchor_penalty(career, anchor.reshape(1, -1))
        assert result == ANCHOR_PENALTY_SOFT

    def test_anchor_penalty_high_sim_ten(self):
        """max cosine >= ANCHOR_HARD → penalty = 0.10."""
        career = _unit_vec(0)
        anchor = np.zeros(DIM, dtype=np.float32)
        anchor[0] = ANCHOR_HARD + 0.05
        anchor[1] = np.sqrt(1.0 - (ANCHOR_HARD + 0.05) ** 2)
        result = negative_anchor_penalty(career, anchor.reshape(1, -1))
        assert result == ANCHOR_PENALTY_HARD


# ===================================================================
# Group 4 — assessment_gate_violations
# ===================================================================
class TestAssessmentGateViolations:

    def test_gate_clean_candidate_no_violations(self):
        """Expert claim on a required skill with score >= 40 → no violations."""
        entries = [("FAISS", "vector search & retrieval", 85.0)]
        assert assessment_gate_violations(entries) == []

    def test_gate_liar_flagged(self):
        """Expert claim on a required skill with score < 40 → flagged."""
        entries = [("FAISS", "vector search & retrieval", 22.0)]
        result = assessment_gate_violations(entries)
        assert len(result) > 0
        assert "FAISS" in result

    def test_gate_nicetohave_not_flagged(self):
        """gate_entries only contains items that map to required skills in
        practice, but a low score on a nice-to-have skill (if it appeared)
        would still fire if the score < 40 because the function checks all
        entries. However, gate_data.pkl only ever contains required-skill
        entries, so in practice nice-to-haves never reach the gate.

        Test with an empty gate_entries list (as would happen for a candidate
        with no expert claims on required skills) → empty violations list."""
        assert assessment_gate_violations([]) == []
        assert assessment_gate_violations(None) == []

    def test_gate_none_score_no_fire(self):
        """An entry with score=None (no assessment taken) must NOT fire."""
        entries = [("Pinecone", "vector search & retrieval", None)]
        assert assessment_gate_violations(entries) == []


# ===================================================================
# Group 5 — score ordering
# ===================================================================
class TestScoreOrdering:

    def test_inactive_candidate_penalised(self):
        """availability_multiplier 1.25 vs 0.10 → active scores strictly higher."""
        active = make_feature({"availability_multiplier": 1.25})
        inactive = make_feature({"availability_multiplier": 0.10})
        c_active, _, _ = composite_score(active, 0.70, 0.0, 0.0)
        c_inactive, _, _ = composite_score(inactive, 0.70, 0.0, 0.0)
        assert c_active > c_inactive

    def test_trajectory_bonus_matters(self):
        """trajectory_adjustment +0.05 vs -0.05 → positive scores higher,
        and the difference is approximately 0.10 in base score."""
        pos = make_feature({"trajectory_adjustment": 0.05,
                            "availability_multiplier": 1.0})
        neg = make_feature({"trajectory_adjustment": -0.05,
                            "availability_multiplier": 1.0})
        c_pos, b_pos, _ = composite_score(pos, 0.70, 0.0, 0.0)
        c_neg, b_neg, _ = composite_score(neg, 0.70, 0.0, 0.0)
        assert c_pos > c_neg
        assert b_pos - b_neg == pytest.approx(0.10, abs=1e-9)
