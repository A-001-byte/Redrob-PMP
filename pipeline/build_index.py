"""build_index.py — File C of the Phase-2 embedding/retrieval layer.

Builds a FAISS IndexFlatIP over the L2-normalised career embeddings (inner
product == cosine similarity on unit vectors) and saves it to
faiss_index.bin. IndexFlatIP is exact brute-force search: at 100K x 384 a
full scan takes ~10 ms on CPU, so there is no reason to trade recall for
an approximate index.

Phase 3 imports search() from this module:
    from build_index import search
    scores, ids = search(jd_embedding, k=5000)   # ids are candidate_ids

Usage:
    python build_index.py [--embeddings ...] [--ids ...] [--out ...]
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any

import faiss
import numpy as np

from build_skill_canon import PRECOMPUTED_DIR

DEFAULT_INDEX_PATH = PRECOMPUTED_DIR / "faiss_index.bin"
DEFAULT_IDS_PATH = PRECOMPUTED_DIR / "candidate_ids.json"
EMBED_DIM = 384


# ---------------------------------------------------------------------------
# Query-time helper (imported by Phase 3)
# ---------------------------------------------------------------------------
_loaded: dict[str, Any] | None = None


def load_index(
    index_path: str | Path = DEFAULT_INDEX_PATH,
    ids_path: str | Path = DEFAULT_IDS_PATH,
) -> dict[str, Any]:
    """Load (and memoize) the FAISS index plus the row->candidate_id map."""
    global _loaded
    if _loaded is None:
        index = faiss.read_index(str(index_path))
        with open(ids_path, "r", encoding="utf-8") as f:
            candidate_ids: list[str] = json.load(f)
        if index.ntotal != len(candidate_ids):
            raise ValueError(
                f"row mismatch: index has {index.ntotal} vectors but "
                f"candidate_ids.json has {len(candidate_ids)} ids")
        _loaded = {"index": index, "ids": candidate_ids}
    return _loaded


def search(
    query_vec: np.ndarray,
    k: int = 100,
    index_path: str | Path = DEFAULT_INDEX_PATH,
    ids_path: str | Path = DEFAULT_IDS_PATH,
) -> tuple[np.ndarray, list[str]]:
    """Top-k cosine search. Returns (scores, candidate_ids), best first.

    query_vec must be L2-normalised, shape (384,) or (1, 384).
    """
    payload = load_index(index_path, ids_path)
    query = np.ascontiguousarray(query_vec, dtype=np.float32).reshape(1, -1)
    scores, rows = payload["index"].search(query, k)
    return scores[0], [payload["ids"][r] for r in rows[0]]


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(description="Build faiss_index.bin")
    parser.add_argument("--embeddings",
                        default=str(PRECOMPUTED_DIR / "career_embeddings.npy"))
    parser.add_argument("--ids", default=str(DEFAULT_IDS_PATH))
    parser.add_argument("--out", default=str(DEFAULT_INDEX_PATH))
    args = parser.parse_args()

    embeddings = np.load(args.embeddings)
    with open(args.ids, "r", encoding="utf-8") as f:
        candidate_ids: list[str] = json.load(f)

    if embeddings.shape != (len(candidate_ids), EMBED_DIM):
        raise ValueError(f"unexpected embedding shape {embeddings.shape}, "
                         f"want ({len(candidate_ids)}, {EMBED_DIM})")
    if embeddings.dtype != np.float32:
        raise ValueError(f"embeddings must be float32, got {embeddings.dtype}")

    t0 = time.time()
    index = faiss.IndexFlatIP(EMBED_DIM)
    index.add(embeddings)
    print(f"IndexFlatIP built: ntotal={index.ntotal} "
          f"in {time.time() - t0:.1f}s")

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    faiss.write_index(index, str(out))
    print(f"saved {out} ({out.stat().st_size / 1e6:.0f} MB)")

    # Verification 1: row count matches the id order.
    assert index.ntotal == len(candidate_ids), "ntotal != len(candidate_ids)"

    # Verification 2: self-query — row 0 must retrieve itself at score ~1.
    scores, rows = index.search(embeddings[:1], 1)
    assert rows[0][0] == 0, f"self-query returned row {rows[0][0]}, not 0"
    assert abs(scores[0][0] - 1.0) < 1e-3, f"self-score {scores[0][0]} != 1.0"
    print(f"self-query OK: row 0 -> row 0 at score {scores[0][0]:.4f}")

    # Verification 3: the module-level search() helper round-trips ids.
    global _loaded
    _loaded = {"index": index, "ids": candidate_ids}
    s, ids = search(embeddings[0], k=3)
    assert ids[0] == candidate_ids[0], "search() id mapping broken"
    print(f"search() helper OK: top hit {ids[0]} at {s[0]:.4f}")


if __name__ == "__main__":
    main()
