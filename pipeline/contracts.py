"""contracts.py — shared Phase-1 data contract (Redrob Hackathon, Track 01).

Locked interface between Phase-1 (offline feature building) and later phases
(scoring / LightGBM ranking / output). Do NOT rename fields here without
updating every consumer.

Artifacts produced by Phase 1:
    features.pkl    : dict[str, FeatureRecord]  keyed by candidate_id
    texts.pkl       : dict[str, TextRecord]     keyed by candidate_id
    skill_canon.pkl : SkillCanon
"""
from typing import TypedDict


class FeatureRecord(TypedDict):
    candidate_id: str

    # --- career sub-scores (all floats in [0, 1]) ---
    company_type_score: float
    role_relevance_score: float
    production_signal: float        # 0.0 or 1.0
    domain_indicator: float         # 0.0 or 1.0
    tenure_stability: float
    career_score: float             # 0.40/0.30/0.10/0.10/0.10 weighted blend

    # --- skills ---
    skill_score: float                       # [0, 1]
    matched_required_skills: list[str]       # canonical JD-skill names matched
    matched_nicetohave_skills: list[str]

    # --- experience ---
    yoe_fit: float
    location_fit: float
    education_tier_score: float
    experience_score: float         # 0.40*yoe + 0.35*location + 0.25*education

    # --- assessment ---
    assessment_score: float         # mean JD-required assessment scores / 100

    # --- trajectory ---
    trajectory_adjustment: float    # one of {-0.05, 0.0, +0.05}

    # --- availability ---
    availability_multiplier: float  # clamped [0.10, 1.25]

    # --- raw behavioral passthrough (for the later LightGBM ranker) ---
    recruiter_response_rate: float
    interview_completion_rate: float
    offer_acceptance_rate: float    # -1.0 means no offer history
    days_inactive: int              # vs dataset reference date, not wall clock
    notice_period_days: int
    github_activity_score: float    # -1.0 means no GitHub
    open_to_work_flag: bool
    saved_by_recruiters_30d: int
    applications_submitted_30d: int

    # --- disqualifiers ---
    disqualifier_flag: bool
    disqualifier_reasons: list[str]

    # --- honeypot ---
    is_honeypot: bool
    honeypot_reasons: list[str]
    overlap_months_max: float       # raw diagnostics from honeypot.is_honeypot()
    yoe_ratio: float
    expert_zero_count: int

    # --- passthrough for reasoning/output ---
    current_title: str
    years_of_experience: float
    location: str
    country: str


class TextRecord(TypedDict):
    career_text: str    # recency-weighted concat of career descriptions
    summary_text: str   # headline + " " + summary (anti-fraud check only)


class SkillCanon(TypedDict):
    canon: dict[str, list[str]]     # JD skill -> matching raw candidate skills
    threshold: float                # cosine similarity cutoff used (0.75)
    required_skills: list[str]
    nicetohave_skills: list[str]
    model_name: str                 # SBERT model used to build the canon
