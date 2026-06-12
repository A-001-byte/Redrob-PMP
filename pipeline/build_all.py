"""build_all.py — one-command rebuild of every precomputed/ artifact.

Runs the six Phase-1/2 builders in dependency order, each in its own
subprocess (clean memory between steps; a crash in one cannot corrupt the
next). This is the ONLY networked stage of the project — the builders may
download HF models on first run. rank.py itself stays fully offline.

    python pipeline/build_all.py             # full rebuild (~15 min)
    python pipeline/build_all.py --from build_bm25      # resume mid-chain
    python pipeline/build_all.py --only build_features  # one step

Row-alignment invariant: every matrix/index keys off candidate_ids.json
order and bm25_index.pkl carries an order-sensitive SHA-256 of the ids, so
partial rebuilds are only safe for steps downstream of the one that changed.
When in doubt, run the full chain.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = PIPELINE_DIR.parent

# Dependency order — do not reorder.
BUILDERS = [
    "build_skill_canon",   # JD skills + canon (needs network for SBERT)
    "build_features",      # FeatureRecords + honeypot/DQ flags
    "build_embeddings",    # career/summary embeddings + jd_embedding
    "build_bm25",          # sparse index + order-sensitive ids hash
    "build_index",         # FAISS IndexFlatIP over career embeddings
    "build_gate_data",     # L5 assessment-gate lookup
]


def run_step(name: str) -> float:
    print(f"\n{'=' * 70}\n  {name}.py\n{'=' * 70}", flush=True)
    t0 = time.time()
    result = subprocess.run(
        [sys.executable, "-u", str(PIPELINE_DIR / f"{name}.py")],
        cwd=str(PROJECT_ROOT))
    elapsed = time.time() - t0
    if result.returncode != 0:
        print(f"\nFAILED at {name}.py (exit {result.returncode}) after "
              f"{elapsed:.0f}s. Fix and resume with:\n"
              f"  python pipeline/build_all.py --from {name}")
        sys.exit(result.returncode)
    return elapsed


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Rebuild all precomputed/ artifacts in dependency order")
    parser.add_argument("--from", dest="from_step", choices=BUILDERS,
                        help="resume the chain from this builder")
    parser.add_argument("--only", choices=BUILDERS,
                        help="run a single builder (mind row alignment)")
    args = parser.parse_args()

    if args.only:
        steps = [args.only]
    elif args.from_step:
        steps = BUILDERS[BUILDERS.index(args.from_step):]
    else:
        steps = list(BUILDERS)

    t_total = time.time()
    timings = {name: run_step(name) for name in steps}

    print(f"\n{'=' * 70}\n  build complete in "
          f"{time.time() - t_total:.0f}s\n{'=' * 70}")
    for name, secs in timings.items():
        print(f"  {name:24s} {secs:7.1f}s")
    print("\nnext: python pipeline/rank.py  &&  python pipeline/verify_phase3.py")


if __name__ == "__main__":
    main()
