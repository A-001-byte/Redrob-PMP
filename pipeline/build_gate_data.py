"""build_gate_data.py — offline extractor for the L5 assessment hard gate.

features.pkl deliberately aggregates assessments into one assessment_score,
but the L5 gate (Phase 3) needs per-skill granularity: "claims <skill> at
expert proficiency, <skill> maps to a REQUIRED JD group, and the candidate's
own assessment for that named skill is < 40". That raw data lives only in
candidates.jsonl, which is too large (465 MB) to stream inside the 5-minute
ranking budget — so this script streams it ONCE offline and saves just the
gate-relevant slice.

Output: precomputed\gate_data.pkl
    dict[candidate_id, list[tuple[skill_name, required_group, score|None]]]
    Only expert-proficiency skills that map to a required group are kept;
    candidates with none are omitted entirely (the gate treats a missing
    key as "nothing to check"). score is None when the candidate has no
    assessment for that named skill (no signal — the gate cannot fire).

Usage:
    python build_gate_data.py [--candidates ...] [--skill-canon ...] [--out ...]
"""
from __future__ import annotations

import argparse
import pickle
import time
from pathlib import Path

from build_skill_canon import DATA_DIR, PRECOMPUTED_DIR, iter_candidates

DEFAULT_OUT = PRECOMPUTED_DIR / "gate_data.pkl"


def required_name_map(skill_canon: dict) -> dict[str, str]:
    """lowercased raw skill name -> required JD group it maps to."""
    mapping: dict[str, str] = {}
    for group in skill_canon["required_skills"]:
        for raw_name in skill_canon["canon"].get(group, []):
            mapping[raw_name.strip().lower()] = group
    return mapping


def extract_gate_entries(
    candidate: dict, name_to_group: dict[str, str]
) -> list[tuple[str, str, float | None]]:
    """Expert-claimed, required-mapped skills with their assessment scores.

    Tolerant of missing/malformed fields, mirroring honeypot.py: skills must
    be a list of dicts; assessment keys are matched case-insensitively after
    strip (the dataset mixes e.g. "Python" and "python").
    """
    skills = candidate.get("skills") if isinstance(candidate, dict) else None
    if not isinstance(skills, list):
        return []

    signals = candidate.get("redrob_signals")
    raw_scores = signals.get("skill_assessment_scores") if isinstance(signals, dict) else None
    scores: dict[str, float] = {}
    if isinstance(raw_scores, dict):
        for key, value in raw_scores.items():
            if isinstance(key, str) and isinstance(value, (int, float)):
                scores[key.strip().lower()] = float(value)

    entries: list[tuple[str, str, float | None]] = []
    for skill in skills:
        if not isinstance(skill, dict) or skill.get("proficiency") != "expert":
            continue
        name = skill.get("name")
        if not isinstance(name, str):
            continue
        group = name_to_group.get(name.strip().lower())
        if group is None:
            continue
        entries.append((name, group, scores.get(name.strip().lower())))
    return entries


def main() -> None:
    parser = argparse.ArgumentParser(description="Build gate_data.pkl")
    parser.add_argument("--candidates", default=str(DATA_DIR / "candidates.jsonl"))
    parser.add_argument("--skill-canon", default=str(PRECOMPUTED_DIR / "skill_canon.pkl"))
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    args = parser.parse_args()

    with open(args.skill_canon, "rb") as f:
        skill_canon = pickle.load(f)
    name_to_group = required_name_map(skill_canon)
    print(f"{len(name_to_group)} raw skill names map to a required group")

    t0 = time.time()
    gate_data: dict[str, list[tuple[str, str, float | None]]] = {}
    n_seen = 0
    for candidate in iter_candidates(args.candidates):
        n_seen += 1
        cid = candidate.get("candidate_id")
        if not isinstance(cid, str):
            continue
        entries = extract_gate_entries(candidate, name_to_group)
        if entries:
            gate_data[cid] = entries

    out = Path(args.out)
    with open(out, "wb") as f:
        pickle.dump(gate_data, f, protocol=pickle.HIGHEST_PROTOCOL)

    n_scored = sum(1 for v in gate_data.values()
                   for _, _, s in v if s is not None)
    n_low = sum(1 for v in gate_data.values()
                for _, _, s in v if s is not None and s < 40)
    print(f"streamed {n_seen} candidates in {time.time() - t0:.0f}s")
    print(f"gate_data: {len(gate_data)} candidates with expert+required claims "
          f"({n_scored} scored entries, {n_low} below 40)")
    print(f"saved {out} ({out.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
