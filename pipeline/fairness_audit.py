"""fairness_audit.py — adverse-impact audit of the top-100 vs the qualified pool.

READ-ONLY: this module never touches the ranking pipeline or its artifacts; it
reads features.pkl + submission.csv (+ candidates.jsonl for company sizes) and
writes a markdown report and a JSON twin for the web UI. Deterministic: no
timestamps, fixed group order, fixed rounding — two runs are byte-identical.

Methodology: for each proxy attribute, compare each group's selection rate
(top-100 members / qualified-pool members) against the highest group's rate.
An impact ratio below 0.80 — the four-fifths rule of thumb from US employment
law (29 CFR 1607.4(D)) — flags the group for review.

Honest framing (also stated in the report): education tier, location, YoE band
and company background are NOT protected classes. The dataset contains no
gender, age, or ethnicity fields, and this audit deliberately does not infer
them from names or anything else. The four-fifths methodology is borrowed as
an engineering health-check, not as a legal compliance claim — a real NYC
LL144 audit requires an independent auditor and actual demographic data.

Usage:
    python pipeline/fairness_audit.py \
        --features precomputed/features.pkl \
        --submission submission/submission.csv \
        --out submission/fairness_report.md \
        --json submission/fairness_report.json
"""
from __future__ import annotations

import argparse
import csv
import json
import pickle
from pathlib import Path

from build_features import CITY_TIER1_RE

FOUR_FIFTHS = 0.80
SMALL_POOL_N = 100          # groups smaller than this get a small-sample caution

# Weighted composite components decomposable pool-wide (semantic, 0.25, is
# query-relative and embedding-based — not computable offline; stated in
# limitations). experience splits 0.40/0.35/0.25 inside its 0.10 weight.
WEIGHTED_COMPONENTS = [
    ("career_score", 0.30),
    ("skill_score", 0.20),
    ("assessment_score", 0.15),
    ("yoe_fit", 0.10 * 0.40),
    ("location_fit", 0.10 * 0.35),
    ("education_tier_score", 0.10 * 0.25),
]

SMALL_SIZES = {"1-10", "11-50", "51-200"}
LARGE_SIZES = {"1001-5000", "5001-10000", "10001+"}


# ---------------------------------------------------------------------------
# Group assignment (fixed bucket order = report order)
# ---------------------------------------------------------------------------
EDUCATION_BUCKETS = ["tier_1", "tier_2", "tier_3", "tier_4+unknown"]


def education_bucket(rec: dict) -> str:
    """Invert education_tier_score: TIER_SCORE {1.0,0.8,0.6,0.4} + capped
    +0.1 STEM bonus -> {1.0}, {0.8,0.9}, {0.6,0.7}, {0.4,0.5}. tier_4 and
    unknown share a base score by design and stay one bucket."""
    s = rec.get("education_tier_score", 0.4)
    if s >= 0.95:
        return "tier_1"
    if s >= 0.75:
        return "tier_2"
    if s >= 0.55:
        return "tier_3"
    return "tier_4+unknown"


LOCATION_BUCKETS = ["Pune+Noida", "Other tier-1 India", "Other India",
                    "International"]


def location_bucket(rec: dict) -> str:
    loc = str(rec.get("location") or "").lower()
    country = str(rec.get("country") or "").lower()
    if "pune" in loc or "noida" in loc:
        return "Pune+Noida"
    if country == "india" and CITY_TIER1_RE.search(loc):
        return "Other tier-1 India"
    if country == "india":
        return "Other India"
    return "International"


YOE_BUCKETS = ["<5 yrs", "5-9 yrs (JD target)", "10-13 yrs", ">13 yrs"]


def yoe_bucket(rec: dict) -> str:
    y = rec.get("years_of_experience") or 0.0
    if y < 5:
        return "<5 yrs"
    if y < 10:
        return "5-9 yrs (JD target)"
    if y < 14:
        return "10-13 yrs"
    return ">13 yrs"


COMPANY_BUCKETS = ["Predominantly startup/scale-up", "Mixed / unknown",
                   "Predominantly enterprise"]


def company_bucket(sizes: list[str]) -> str:
    """Majority (>50%) of career roles small (<=200) or large (>=1001)."""
    if not sizes:
        return "Mixed / unknown"
    small = sum(1 for s in sizes if s in SMALL_SIZES)
    large = sum(1 for s in sizes if s in LARGE_SIZES)
    if small / len(sizes) > 0.5:
        return "Predominantly startup/scale-up"
    if large / len(sizes) > 0.5:
        return "Predominantly enterprise"
    return "Mixed / unknown"


def load_company_sizes(jsonl_path: Path, wanted: set[str]) -> dict[str, list[str]]:
    """One sequential read of candidates.jsonl; only `wanted` ids are kept."""
    sizes: dict[str, list[str]] = {}
    with open(jsonl_path, "rb") as f:
        for line in f:
            # cheap prefix check before full JSON parse
            cid = line[18:30].decode("ascii", errors="replace")
            if cid not in wanted:
                continue
            row = json.loads(line)
            sizes[row["candidate_id"]] = [
                j.get("company_size") for j in (row.get("career_history") or [])
                if j.get("company_size")
            ]
    return sizes


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------
def audit_attribute(name: str, buckets: list[str], assign, pool: list[str],
                    top100: list[str], feats: dict) -> dict:
    pool_counts = {b: 0 for b in buckets}
    top_counts = {b: 0 for b in buckets}
    for cid in pool:
        pool_counts[assign(cid)] += 1
    for cid in top100:
        top_counts[assign(cid)] += 1

    assert sum(pool_counts.values()) == len(pool), f"{name}: pool counts drift"
    assert sum(top_counts.values()) == len(top100), f"{name}: top-100 counts drift"

    rates = {b: (top_counts[b] / pool_counts[b]) if pool_counts[b] else 0.0
             for b in buckets}
    best_rate = max(rates.values()) or 1.0
    best_group = max(buckets, key=lambda b: rates[b])

    rows = []
    for b in buckets:
        ratio = rates[b] / best_rate if best_rate else 0.0
        rows.append({
            "group": b,
            "pool_count": pool_counts[b],
            "pool_share_pct": round(100 * pool_counts[b] / len(pool), 3),
            "top100_count": top_counts[b],
            "top100_share_pct": round(100 * top_counts[b] / len(top100), 3),
            "selection_rate_pct": round(100 * rates[b], 3),
            "impact_ratio": round(ratio, 3),
            "flagged": bool(ratio < FOUR_FIFTHS),
            "small_pool": bool(pool_counts[b] < SMALL_POOL_N),
        })
    return {"attribute": name, "highest_rate_group": best_group, "rows": rows}


def decomposition_note(attr: dict, members: dict[str, list[str]],
                       feats: dict) -> list[str]:
    """For each flagged group: which decomposable composite components differ
    most (weighted) vs the highest-selection-rate group, over the qualified
    pool. Names the drivers; bounds the pedigree effect."""
    notes = []
    best = attr["highest_rate_group"]
    best_ids = members[best]
    if not best_ids:
        return notes

    def mean(ids, field):
        vals = [feats[c].get(field, 0.0) for c in ids]
        return sum(vals) / len(vals) if vals else 0.0

    for row in attr["rows"]:
        g = row["group"]
        if not row["flagged"] or not members[g]:
            continue
        gaps = []
        for field, weight in WEIGHTED_COMPONENTS:
            delta = (mean(best_ids, field) - mean(members[g], field)) * weight
            gaps.append((field, round(delta, 4)))
        gaps.sort(key=lambda t: -abs(t[1]))
        top = ", ".join(f"{f} ({d:+.4f} weighted)" for f, d in gaps[:2])
        bounded = ("education pedigree is bounded by design: education_tier_score "
                   "carries 0.25 of the 0.10-weight experience component, i.e. "
                   "at most 2.5% of the composite"
                   if any(f == "education_tier_score" for f, _ in gaps[:2])
                   else "career evidence (weight 0.30) dominates pedigree signals")
        notes.append(
            f"**{g}** (impact ratio {row['impact_ratio']}): largest decomposable "
            f"qualified-pool gaps vs '{best}': {top}; {bounded}. The semantic "
            f"component (0.25 weight) is not decomposable offline."
        )
    return notes


# ---------------------------------------------------------------------------
# Report rendering
# ---------------------------------------------------------------------------
def render_markdown(result: dict) -> str:
    L = []
    L.append("# Fairness & Adverse-Impact Audit — Glasshouse top-100\n")
    L.append("## 1. What this audit is — and is not\n")
    L.append(result["disclaimer"] + "\n")
    L.append("## 2. Attributes audited vs unavailable\n")
    L.append("**Audited (proxy attributes present in the data):** "
             + ", ".join(result["attributes_audited"]) + ".\n")
    L.append("**Not available in the source data:** "
             + result["attributes_unavailable"] + "\n")
    L.append("## 3. Reference pool\n")
    m = result["methodology"]
    L.append(f"Qualified pool = {m['qualified_pool_definition']} — "
             f"**{m['qualified_pool_count']:,} candidates** out of "
             f"{m['total_candidates']:,} total. Top-100 = the submitted "
             f"ranking ({m['top100_count']} rows, all inside the qualified "
             f"pool). Selection rates use the qualified pool as denominator; "
             f"the four-fifths threshold is {FOUR_FIFTHS}.\n")

    for attr in result["attributes"]:
        L.append(f"## 4.{result['attributes'].index(attr) + 1} {attr['attribute']}\n")
        L.append("| Group | Pool n | Pool share | Top-100 n | Top-100 share "
                 "| Selection rate | Impact ratio | Flag |")
        L.append("|---|---|---|---|---|---|---|---|")
        for r in attr["rows"]:
            flag = "⚠ review" if r["flagged"] else "ok"
            if r["flagged"] and r["small_pool"]:
                flag += " (small pool)"
            L.append(
                f"| {r['group']} | {r['pool_count']:,} | {r['pool_share_pct']}% "
                f"| {r['top100_count']} | {r['top100_share_pct']}% "
                f"| {r['selection_rate_pct']}% | {r['impact_ratio']} | {flag} |")
        L.append("")
        if attr["notes"]:
            L.append("**Decomposition of flagged gaps:**\n")
            for n in attr["notes"]:
                L.append(f"- {n}")
            L.append("")

    L.append("## 5. Design factors that bound pedigree effects\n")
    for d in result["design_factors"]:
        L.append(f"- {d}")
    L.append("")
    L.append("## 6. Limitations\n")
    for d in result["limitations"]:
        L.append(f"- {d}")
    L.append("")
    L.append("---")
    L.append("Reproduce: `python pipeline/fairness_audit.py` "
             "(deterministic — reruns are byte-identical).")
    return "\n".join(L) + "\n"


# ---------------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser(description="Read-only adverse-impact audit")
    root = Path(__file__).resolve().parents[1]
    ap.add_argument("--features", default=str(root / "precomputed" / "features.pkl"))
    ap.add_argument("--submission", default=str(root / "submission" / "submission.csv"))
    ap.add_argument("--candidates", default=str(root / "data" / "candidates.jsonl"))
    ap.add_argument("--out", default=str(root / "submission" / "fairness_report.md"))
    ap.add_argument("--json", default=str(root / "submission" / "fairness_report.json"))
    args = ap.parse_args()

    with open(args.features, "rb") as f:
        feats: dict[str, dict] = pickle.load(f)
    with open(args.submission, encoding="utf-8", newline="") as f:
        top100 = [r["candidate_id"] for r in csv.DictReader(f)]

    pool = sorted(
        cid for cid, r in feats.items()
        if r.get("matched_required_skills") and not r.get("disqualifier_flag")
        and not r.get("is_honeypot")
    )
    pool_set = set(pool)
    outside = [c for c in top100 if c not in pool_set]
    assert not outside, f"top-100 members outside qualified pool: {outside}"

    # company sizes need the raw jsonl; degrade gracefully without it
    jsonl = Path(args.candidates)
    sizes = load_company_sizes(jsonl, pool_set) if jsonl.exists() else None

    attributes = []
    assigners = [
        ("Education tier", EDUCATION_BUCKETS, lambda c: education_bucket(feats[c])),
        ("Location", LOCATION_BUCKETS, lambda c: location_bucket(feats[c])),
        ("Years-of-experience band", YOE_BUCKETS, lambda c: yoe_bucket(feats[c])),
    ]
    if sizes is not None:
        assigners.append(
            ("Company-size background", COMPANY_BUCKETS,
             lambda c: company_bucket(sizes.get(c, []))))

    for name, buckets, assign in assigners:
        attr = audit_attribute(name, buckets, assign, pool, top100, feats)
        members = {b: [c for c in pool if assign(c) == b] for b in buckets}
        attr["notes"] = decomposition_note(attr, members, feats)
        attributes.append(attr)

    result = {
        "title": "Fairness & Adverse-Impact Audit — Glasshouse top-100",
        "disclaimer": (
            "This audit borrows the four-fifths (80%) impact-ratio methodology "
            "from US employment law as an engineering health-check. The "
            "attributes below are NOT protected classes; the dataset contains "
            "no gender, age, or ethnicity fields, and this system deliberately "
            "does not infer them from names or any other signal. This is a "
            "fairness-aware design practice, not a legal compliance claim — a "
            "real NYC Local Law 144 audit requires an independent auditor and "
            "actual demographic data."),
        "attributes_audited": [
            "education tier", "location", "years-of-experience band",
            "company-size background" if sizes is not None
            else "company-size background (skipped: candidates.jsonl absent)"],
        "attributes_unavailable": (
            "gender, age, ethnicity, disability, or any other protected "
            "attribute — none exist in candidate_schema.json (names are "
            "pre-anonymized), and none are inferred."),
        "methodology": {
            "qualified_pool_definition": (
                "≥1 matched required JD skill AND not disqualified AND not "
                "honeypot"),
            "qualified_pool_count": len(pool),
            "total_candidates": len(feats),
            "top100_count": len(top100),
            "four_fifths_threshold": FOUR_FIFTHS,
            "small_pool_caution_n": SMALL_POOL_N,
            "yoe_bands": "<5, [5,10), [10,14), >=14 years",
            "company_size_rule": (
                "majority (>50%) of career roles with company_size <=200 -> "
                "startup/scale-up; >=1001 -> enterprise; else mixed/unknown"),
        },
        "attributes": attributes,
        "design_factors": [
            "Education is capped at 2.5% of the composite by construction "
            "(0.25 of the 0.10-weight experience component) — career evidence "
            "carries 0.30, skills 0.20.",
            "Skill matching is canonicalized (SBERT + aliases), so skill names "
            "— not institution names — drive the 0.20 skill weight.",
            "No name, photo, gender, or age signal exists anywhere in the "
            "feature set (contracts.py is the locked schema).",
            "Location preference is an explicit, documented JD requirement "
            "(Pune/Noida office), not a learned correlation.",
        ],
        "limitations": [
            "The semantic component (0.25 weight) is embedding-based and "
            "query-relative; it cannot be decomposed pool-wide offline, so "
            "decomposition notes cover the remaining 75% of the composite.",
            "tier_4 and unknown education are indistinguishable in the "
            "feature set (identical base score) and are audited as one group.",
            "Selection into the top 100 from a ~20K pool makes every "
            "selection rate small; impact ratios, not absolute rates, carry "
            "the signal.",
            "Proxy attributes can correlate with protected classes; absent "
            "demographic data, this audit cannot measure that correlation.",
        ],
    }

    md = render_markdown(result)
    Path(args.out).write_text(md, encoding="utf-8", newline="\n")
    with open(args.json, "w", encoding="utf-8", newline="\n") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"wrote {args.out}\nwrote {args.json}")
    flagged = [(a["attribute"], r["group"], r["impact_ratio"])
               for a in attributes for r in a["rows"] if r["flagged"]]
    print(f"qualified pool: {len(pool):,} | flags: {len(flagged)}")
    for a, g, ir in flagged:
        # ASCII-only console output (Windows cp1252-safe); files are UTF-8
        print(f"  FLAG {a} / {g}: impact ratio {ir}")


if __name__ == "__main__":
    main()
