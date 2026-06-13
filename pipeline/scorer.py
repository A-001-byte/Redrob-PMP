"""scorer.py — File A of Phase 3: the L3 composite scoring functions.

Pure functions, no I/O. rank.py feeds them artifact rows; reasoning.py and
the future LightGBM ranker consume the parts_dict breakdown they return.

Composite formula (weights locked by the Phase-3 spec):

    base = 0.25*semantic + 0.30*career + 0.20*skill
         + 0.10*experience + 0.15*assessment
         + trajectory_adjustment        (precomputed, one of -0.05/0/+0.05)
         + consistency_adjustment       (computed here, one of -0.03/0/+0.03)
         - negative_anchor_penalty      (computed here, one of 0/0.05/0.10)
    base = clamp(base, 0, 1)
    composite = base * availability_multiplier        (precomputed, 0.10-1.25)
                     * 0.05 if disqualifier_flag
                     * 0.0  if is_honeypot

semantic_score is the L1 hybrid score min-max normalised over the working
pool (raw dense cosine is compressed and uncalibrated — Phase-2 finding).
The cross-encoder score deliberately does NOT enter the composite: its
logits are uncalibrated, so it is used for L2 ordering only and passed
through as a feature for the future LightGBM ranker.
"""
from __future__ import annotations

import numpy as np

from config_loader import CONFIG

_SC = CONFIG["scoring"]

# --- composite weights (sum of the five blend weights = 1.0) ---
W_SEMANTIC = _SC["w_semantic"]
W_CAREER = _SC["w_career"]
W_SKILL = _SC["w_skill"]
W_EXPERIENCE = _SC["w_experience"]
W_ASSESSMENT = _SC["w_assessment"]

# --- consistency adjustment: summary vs career embedding agreement ---
CONSISTENCY_HIGH = _SC["consistency_high_threshold"]
CONSISTENCY_LOW = _SC["consistency_low_threshold"]
CONSISTENCY_BONUS = _SC["consistency_bonus"]
MIN_SUMMARY_CHARS = _SC["min_summary_chars"]

# --- negative-anchor penalty: proximity to anti-fit archetypes ---
# Phase-2 measurement: JD top-20 mean max-anchor cosine 0.285, honeypots
# 0.376, HR/Marketing 0.439 — the band below sits in that gap.
ANCHOR_SOFT = _SC["anchor_soft_threshold"]
ANCHOR_HARD = _SC["anchor_hard_threshold"]
ANCHOR_PENALTY_SOFT = _SC["anchor_penalty_soft"]
ANCHOR_PENALTY_HARD = _SC["anchor_penalty_hard"]

# --- gate / kill multipliers ---
DQ_MULTIPLIER = _SC["disqualifier_multiplier"]
HONEYPOT_MULTIPLIER = _SC["honeypot_multiplier"]
ASSESSMENT_GATE_MIN = CONFIG["assessment_gate"]["min_score_for_expert"]


def consistency_adjustment(
    summary_vec: np.ndarray,
    career_vec: np.ndarray,
    summary_text: str | None = None,
) -> float:
    """+-0.03 from cosine(summary, career); 0.0 when the summary is empty.

    Both vectors are L2-normalised on disk, so the dot product is cosine.
    A missing/near-empty summary means "no signal", not "inconsistent".
    """
    if summary_text is not None and len(summary_text.strip()) < MIN_SUMMARY_CHARS:
        return 0.0
    sim = float(np.dot(summary_vec, career_vec))
    if sim > CONSISTENCY_HIGH:
        return CONSISTENCY_BONUS
    if sim < CONSISTENCY_LOW:
        return -CONSISTENCY_BONUS
    return 0.0


def negative_anchor_penalty(career_vec: np.ndarray, anchors: np.ndarray) -> float:
    """0 / 0.05 / 0.10 by max cosine against the 5 anti-fit anchor vectors."""
    max_sim = float(np.max(anchors @ career_vec))
    if max_sim >= ANCHOR_HARD:
        return ANCHOR_PENALTY_HARD
    if max_sim >= ANCHOR_SOFT:
        return ANCHOR_PENALTY_SOFT
    return 0.0


def composite_score(
    feature_record: dict,
    semantic_score: float,
    consistency: float,
    anchor_pen: float,
) -> tuple[float, float, dict[str, float]]:
    """The L3 composite. Returns (composite, base, parts_dict).

    parts_dict carries every term with its weight already applied, plus the
    multipliers — reasoning.py picks the strongest/weakest parts from it and
    the future LightGBM ranker consumes it as a feature vector.
    """
    parts: dict[str, float] = {
        "semantic": W_SEMANTIC * semantic_score,
        "career": W_CAREER * feature_record["career_score"],
        "skill": W_SKILL * feature_record["skill_score"],
        "experience": W_EXPERIENCE * feature_record["experience_score"],
        "assessment": W_ASSESSMENT * feature_record["assessment_score"],
        "trajectory": feature_record["trajectory_adjustment"],
        "consistency": consistency,
        "anchor_penalty": -anchor_pen,
    }
    base = max(0.0, min(1.0, sum(parts.values())))

    availability = feature_record["availability_multiplier"]
    dq_mult = DQ_MULTIPLIER if feature_record["disqualifier_flag"] else 1.0
    hp_mult = HONEYPOT_MULTIPLIER if feature_record["is_honeypot"] else 1.0
    composite = base * availability * dq_mult * hp_mult

    parts["base"] = base
    parts["availability_multiplier"] = availability
    parts["dq_multiplier"] = dq_mult
    parts["honeypot_multiplier"] = hp_mult
    parts["composite"] = composite
    return composite, base, parts


def assessment_gate_violations(
    gate_entries: list[tuple[str, str, float | None]] | None,
    threshold: float = ASSESSMENT_GATE_MIN,
) -> list[str]:
    """L5 hard gate: violated skill names, empty list = passes.

    gate_entries comes from gate_data.pkl (built by build_gate_data.py):
    (skill_name, required_group, assessment_score|None) for every skill the
    candidate claims at EXPERT proficiency that maps to a required JD group.
    A violation is a scored entry below threshold; None scores (no
    assessment taken for that skill) carry no signal and cannot fire.

    NOTE: the spec signature was (feature_record, skill_canon), but
    features.pkl only stores the aggregated assessment_score — the per-skill
    data lives in gate_data.pkl, so the record from there is the input.
    """
    if not gate_entries:
        return []
    return [name for name, _group, score in gate_entries
            if score is not None and score < threshold]


# ---------------------------------------------------------------------------
# Unit tests: three synthetic profiles must order star > inactive > liar.
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    def _record(**overrides) -> dict:
        rec = {
            "career_score": 0.5, "skill_score": 0.5, "experience_score": 0.5,
            "assessment_score": 0.5, "trajectory_adjustment": 0.0,
            "availability_multiplier": 1.0,
            "disqualifier_flag": False, "is_honeypot": False,
        }
        rec.update(overrides)
        return rec

    star = _record(career_score=0.9, skill_score=0.8, experience_score=0.85,
                   assessment_score=0.9, trajectory_adjustment=0.05,
                   availability_multiplier=1.2)
    liar = _record(skill_score=0.95, career_score=0.3, assessment_score=0.2,
                   is_honeypot=True)            # stuffed skills, flagged fraud
    inactive = _record(career_score=0.85, skill_score=0.7,
                       experience_score=0.8, assessment_score=0.85,
                       availability_multiplier=0.4)   # great but gone cold

    c_star, b_star, p_star = composite_score(star, 0.9, 0.03, 0.0)
    c_liar, b_liar, p_liar = composite_score(liar, 0.8, -0.03, 0.10)
    c_inact, b_inact, p_inact = composite_score(inactive, 0.85, 0.03, 0.0)

    assert c_star > c_inact > c_liar, (c_star, c_inact, c_liar)
    assert c_liar == 0.0, "honeypot must be eliminated outright"
    assert 0.0 <= b_star <= 1.0 and abs(
        sum(p_star[k] for k in ("semantic", "career", "skill", "experience",
                                "assessment", "trajectory", "consistency",
                                "anchor_penalty")) - b_star) < 1e-9
    print(f"ordering OK: star={c_star:.4f} > inactive={c_inact:.4f} "
          f"> liar={c_liar:.4f}")

    # DQ crush: same profile as star but disqualified -> ~5% of the score.
    dq = dict(star, disqualifier_flag=True)
    c_dq, _, _ = composite_score(dq, 0.9, 0.03, 0.0)
    assert abs(c_dq - c_star * DQ_MULTIPLIER) < 1e-9
    print(f"DQ crush OK: {c_star:.4f} -> {c_dq:.4f}")

    # consistency_adjustment: aligned, opposed, and empty-summary cases.
    v = np.zeros(384, dtype=np.float32); v[0] = 1.0
    w = np.zeros(384, dtype=np.float32); w[1] = 1.0   # orthogonal -> sim 0.0
    assert consistency_adjustment(v, v) == CONSISTENCY_BONUS
    assert consistency_adjustment(w, v) == -CONSISTENCY_BONUS
    assert consistency_adjustment(v, v, summary_text="  ") == 0.0
    mid = (0.6 * v + 0.8 * w)                          # sim 0.6 -> dead zone
    assert consistency_adjustment(mid, v) == 0.0

    # negative_anchor_penalty bands.
    anchors = np.stack([w, 0.45 * v + np.sqrt(1 - 0.45**2) * w])  # sims 0, .45
    assert negative_anchor_penalty(v, anchors) == ANCHOR_PENALTY_SOFT
    anchors_far = np.stack([w])
    assert negative_anchor_penalty(v, anchors_far) == 0.0
    anchors_near = np.stack([0.6 * v + 0.8 * w])                  # sim 0.60
    assert negative_anchor_penalty(v, anchors_near) == ANCHOR_PENALTY_HARD

    # assessment gate.
    entries = [("FAISS", "vector search & retrieval", 22.0),
               ("Python", "Python", 88.0),
               ("Pinecone", "vector search & retrieval", None)]
    assert assessment_gate_violations(entries) == ["FAISS"]
    assert assessment_gate_violations(None) == []
    assert assessment_gate_violations([]) == []
    print("consistency / anchor / gate unit tests OK")
