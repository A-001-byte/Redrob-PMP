"""verify_phase3.py — seven-point verification of rank.py and submission.csv.

Checks, in order:
    1. Format: header + exactly 100 rows, ranks 1-100 once each, unique ids
       present in candidate_ids.json, scores non-increasing with id-ascending
       ties, pandas round-trip agrees with the csv module, AND the
       organizers' own validate_submission.py reports zero errors.
    2. Safety: zero honeypots / disqualified in the final 100, checked
       against features.pkl directly (not the pipeline's own flags).
    3. Quality eyeball: top-20 with title, location, score and the two
       biggest score parts (from rank_details.json).
    4. Reasoning audit: 10 seeded-random rows; every factual claim in the
       sentence is regenerated from that candidate's FeatureRecord and must
       match — zero hallucination tolerance; sentences pairwise distinct.
    5. Gate audit: independent re-run of the L5 assessment gate over the
       final top-20 — zero violations may remain.
    6. Timing: recorded total ranking time < 300 s.
    7. Determinism: two fresh rank.py runs are byte-identical to each other
       AND to the submitted CSV.

Read-only with respect to artifacts; determinism runs write to a temp dir.

Usage:
    python pipeline\\verify_phase3.py
"""
from __future__ import annotations

import csv
import json
import pickle
import random
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import pandas as pd

from build_skill_canon import PRECOMPUTED_DIR, PROJECT_ROOT
from scorer import assessment_gate_violations

SUBMISSION_DIR = PROJECT_ROOT / "submission"
SUBMISSION_CSV = SUBMISSION_DIR / "submission.csv"
RNG_SEED = 42

PASS, FAIL = "PASS", "FAIL"
results: list[tuple[str, str]] = []


def record(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, PASS if ok else FAIL))
    print(f"[{PASS if ok else FAIL}] {name}" + (f" — {detail}" if detail else ""))


# ---------------------------------------------------------------------------
# Check 4 helper: regenerate every factual phrase reasoning.py could have
# emitted from this record and confirm the sentence is consistent with it.
# ---------------------------------------------------------------------------
def audit_claims(text: str, rec: dict) -> tuple[int, list[str]]:
    """Returns (n_verified_claims, problems). problems == [] means clean."""
    verified, problems = 0, []
    title = (rec.get("current_title") or "").strip()
    loc = (rec.get("location") or "").strip()
    groups = rec.get("matched_required_skills") or []
    expected_groups = " and ".join(groups[:2])

    def claim(marker: str, ok: bool, why: str) -> None:
        nonlocal verified
        if marker in text:
            if ok:
                verified += 1
            else:
                problems.append(f"'{marker}': {why}")

    claim("years' experience as", f"{rec['years_of_experience']:g} years' "
          f"experience as" in text and title in text,
          f"yoe={rec['years_of_experience']} title={title!r}")
    claim("a current role as", title in text, f"title={title!r}")
    claim("a base in", f"a base in {loc}" in text
          and rec.get("location_fit", 0) >= 0.5,
          f"loc={loc!r} fit={rec.get('location_fit')}")
    claim("would require relocation", f"being based in {loc}" in text
          and rec.get("location_fit", 1) < 0.5,
          f"loc={loc!r} fit={rec.get('location_fit')}")
    claim("matched ", bool(groups)
          and f"matched {expected_groups} skills" in text,
          f"groups={groups}")
    claim("direct skill coverage of", bool(groups)
          and f"direct skill coverage of {expected_groups}" in text,
          f"groups={groups}")
    claim("production ML deployments", rec.get("production_signal") == 1.0,
          f"production_signal={rec.get('production_signal')}")
    claim("open-to-work status", rec.get("open_to_work_flag") is True,
          "open_to_work_flag is not True")
    claim("recent platform activity", 0 <= rec.get("days_inactive", -1) <= 7,
          f"days_inactive={rec.get('days_inactive')}")
    claim("immediate availability", rec.get("notice_period_days") == 0,
          f"notice_period_days={rec.get('notice_period_days')}")
    claim("-day notice period",
          f"the {rec.get('notice_period_days', -1):g}-day notice period"
          in text, f"notice_period_days={rec.get('notice_period_days')}")
    claim("inactive for ",
          f"inactive for {rec.get('days_inactive', -1):g} days" in text,
          f"days_inactive={rec.get('days_inactive')}")
    return verified, problems


def main() -> None:
    t_start = time.time()

    with open(PRECOMPUTED_DIR / "candidate_ids.json", encoding="utf-8") as f:
        all_ids = set(json.load(f))
    with open(PRECOMPUTED_DIR / "features.pkl", "rb") as f:
        feats: dict[str, dict] = pickle.load(f)
    with open(PRECOMPUTED_DIR / "gate_data.pkl", "rb") as f:
        gate_data: dict[str, list] = pickle.load(f)
    with open(SUBMISSION_DIR / "rank_details.json", encoding="utf-8") as f:
        details: dict[str, dict] = json.load(f)

    with open(SUBMISSION_CSV, encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = [dict(zip(header, r)) for r in reader]

    # ---- check 1: format ---------------------------------------------------
    print("=== Check 1: format ===")
    ok = header == ["candidate_id", "rank", "score", "reasoning"]
    ok &= len(rows) == 100
    ranks = [int(r["rank"]) for r in rows]
    ok &= sorted(ranks) == list(range(1, 101)) and ranks == sorted(ranks)
    ids = [r["candidate_id"] for r in rows]
    ok &= len(set(ids)) == 100 and all(cid in all_ids for cid in ids)
    scores = [float(r["score"]) for r in rows]
    ok &= all(a >= b for a, b in zip(scores, scores[1:]))
    ok &= all(not (s1 == s2 and c1 > c2) for (s1, c1), (s2, c2)
              in zip(zip(scores, ids), zip(scores[1:], ids[1:])))
    df = pd.read_csv(SUBMISSION_CSV)
    ok &= len(df) == 100 and list(df.columns) == header
    ok &= all(df["reasoning"].iloc[i] == rows[i]["reasoning"]
              for i in range(100))                      # pandas/csv agree
    sys.path.insert(0, str(SUBMISSION_DIR))
    from validate_submission import validate_submission
    val_errors = validate_submission(str(SUBMISSION_CSV))
    ok &= not val_errors
    record("1 format", ok,
           f"organizer validator errors: {val_errors or 'none'}")

    # ---- check 2: safety ---------------------------------------------------
    print("\n=== Check 2: safety (against features.pkl directly) ===")
    bad = [cid for cid in ids
           if feats[cid]["is_honeypot"] or feats[cid]["disqualifier_flag"]]
    record("2 safety", not bad, f"flagged in final 100: {bad or 'none'}")

    # ---- check 3: quality eyeball -------------------------------------------
    print("\n=== Check 3: top-20 quality eyeball ===")
    meta_keys = {"base", "availability_multiplier", "dq_multiplier",
                 "honeypot_multiplier", "composite", "cross_encoder"}
    for r in rows[:20]:
        cid = r["candidate_id"]
        parts = details[cid]["parts"]
        top2 = sorted(((k, v) for k, v in parts.items() if k not in meta_keys),
                      key=lambda t: -t[1])[:2]
        part_s = " ".join(f"{k}={v:.3f}" for k, v in top2)
        rec = feats[cid]
        print(f"  {int(r['rank']):3d} {r['score']}  {cid}  "
              f"{str(rec['current_title'])[:38]:38s} "
              f"{str(rec['location'])[:22]:22s} {part_s}")
    recurring = [c for c in ("CAND_0081846", "CAND_0018499") if c in ids]
    record("3 top-20 printed (manual eyeball)", True,
           f"recurring Phase-1/2 ids present: {recurring}")

    # ---- check 4: reasoning audit -------------------------------------------
    print("\n=== Check 4: reasoning audit (10 seeded-random rows) ===")
    sample = random.Random(RNG_SEED).sample(rows, 10)
    ok4, texts_seen = True, set()
    for r in sample:
        cid = r["candidate_id"]
        text = r["reasoning"]
        n_claims, problems = audit_claims(text, feats[cid])
        clean = not problems and n_claims >= 1
        ok4 &= clean and text not in texts_seen
        texts_seen.add(text)
        status = "ok" if clean else f"PROBLEMS: {problems}"
        print(f"  rank {int(r['rank']):3d} {cid}: {n_claims} claims verified "
              f"— {status}")
    ok4 &= len(texts_seen) == 10
    record("4 reasoning audit", ok4,
           f"{len(texts_seen)}/10 distinct, zero hallucinations" if ok4 else "")

    # ---- check 5: independent L5 gate audit ----------------------------------
    print("\n=== Check 5: L5 gate audit over final top-20 ===")
    viol = {cid: assessment_gate_violations(gate_data.get(cid))
            for cid in ids[:20]}
    viol = {k: v for k, v in viol.items() if v}
    record("5 gate audit", not viol, f"violations: {viol or 'none'}")

    # ---- check 6: timing ------------------------------------------------------
    print("\n=== Check 6: timing ===")
    with open(SUBMISSION_DIR / "rank_timing.json", encoding="utf-8") as f:
        timing = json.load(f)
    total = timing["timings_s"]["total"]
    record("6 timing", total < 300, f"recorded total {total}s < 300s")

    # ---- check 7: determinism (two fresh runs) --------------------------------
    print("\n=== Check 7: determinism (running rank.py twice) ===")
    with tempfile.TemporaryDirectory() as tmp:
        outs = []
        for run in (1, 2):
            out_csv = Path(tmp) / f"run{run}" / "submission.csv"
            t0 = time.time()
            proc = subprocess.run(
                [sys.executable, str(PROJECT_ROOT / "pipeline" / "rank.py"),
                 "--out", str(out_csv)],
                cwd=str(PROJECT_ROOT), capture_output=True, text=True)
            if proc.returncode != 0:
                print(proc.stdout[-2000:], proc.stderr[-2000:])
                raise RuntimeError(f"determinism run {run} failed")
            print(f"  run {run}: {time.time() - t0:.0f}s")
            outs.append(out_csv.read_bytes())
    submitted = SUBMISSION_CSV.read_bytes()
    ok7 = outs[0] == outs[1] == submitted
    record("7 determinism", ok7,
           "two fresh runs byte-identical to each other and to the "
           "submitted CSV" if ok7 else "BYTE DIFFERENCE FOUND")

    # ---- summary ---------------------------------------------------------------
    print(f"\n=== Summary ({time.time() - t_start:.0f}s) ===")
    for name, status in results:
        print(f"  [{status}] {name}")
    if any(s == FAIL for _, s in results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
