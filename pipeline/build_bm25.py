"""build_bm25.py — File B of the Phase-2 embedding/retrieval layer.

Builds a BM25Okapi index over every candidate's career_text, in the exact
row order fixed by candidate_ids.json, and saves it to bm25_index.pkl.

The pickle payload is a dict:
    {
        "bm25": rank_bm25.BM25Okapi,        # the index itself
        "tokenizer": {"lowercase": True, "split": "non-alphanumeric",
                       "min_token_len": 2, "stemming": None},
        "n_docs": int,                       # == len(candidate_ids)
        "ids_sha256": str,                   # hash of the id order, so any
    }                                        # misalignment fails loudly

Tokeniser: lowercase, split on non-alphanumerics, keep tokens of length
>= 2, NO stemming — the vocabulary contains product names ("pgvector",
"faiss", "bm25") that stemming would mangle, and determinism matters more
than recall here because BM25 is blended with dense retrieval in Phase 3.

Phase 3 imports score_query() from this module:
    from build_bm25 import score_query
    scores = score_query("vector search ranking")   # (N,) float in [0,1]

Usage:
    python build_bm25.py [--texts ...] [--ids ...] [--out ...]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pickle
import re
import time
from pathlib import Path
from typing import Any

import numpy as np
from rank_bm25 import BM25Okapi

from build_skill_canon import PRECOMPUTED_DIR

DEFAULT_INDEX_PATH = PRECOMPUTED_DIR / "bm25_index.pkl"
MIN_TOKEN_LEN = 2

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def tokenize(text: str) -> list[str]:
    """Lowercase, split on non-alphanumerics, drop tokens shorter than 2."""
    if not isinstance(text, str):
        return []
    return [t for t in _TOKEN_RE.findall(text.lower())
            if len(t) >= MIN_TOKEN_LEN]


def ids_hash(candidate_ids: list[str]) -> str:
    """Order-sensitive fingerprint of the candidate id sequence."""
    return hashlib.sha256("\n".join(candidate_ids).encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Query-time helper (imported by Phase 3)
# ---------------------------------------------------------------------------
_loaded: dict[str, Any] | None = None


def load_index(path: str | Path = DEFAULT_INDEX_PATH) -> dict[str, Any]:
    """Load (and memoize) the saved BM25 payload."""
    global _loaded
    if _loaded is None:
        with open(path, "rb") as f:
            _loaded = pickle.load(f)
    return _loaded


def score_query(
    query_text: str, index_path: str | Path = DEFAULT_INDEX_PATH
) -> np.ndarray:
    """BM25 scores for query_text against all candidates.

    Returns a float64 array of shape (n_docs,), min-max normalised to
    [0, 1], aligned to the row order of candidate_ids.json. A query with
    no in-vocabulary tokens returns all zeros.
    """
    payload = load_index(index_path)
    tokens = tokenize(query_text)
    if not tokens:
        return np.zeros(payload["n_docs"])
    scores = np.asarray(payload["bm25"].get_scores(tokens), dtype=np.float64)
    lo, hi = scores.min(), scores.max()
    if hi <= lo:
        return np.zeros_like(scores)
    return (scores - lo) / (hi - lo)


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(description="Build bm25_index.pkl")
    parser.add_argument("--texts", default=str(PRECOMPUTED_DIR / "texts.pkl"))
    parser.add_argument("--ids", default=str(PRECOMPUTED_DIR / "candidate_ids.json"))
    parser.add_argument("--out", default=str(DEFAULT_INDEX_PATH))
    args = parser.parse_args()

    with open(args.ids, "r", encoding="utf-8") as f:
        candidate_ids: list[str] = json.load(f)
    print(f"candidate order: {len(candidate_ids)} ids")

    with open(args.texts, "rb") as f:
        texts = pickle.load(f)

    t0 = time.time()
    corpus = [tokenize(texts[cid]["career_text"]) for cid in candidate_ids]
    del texts
    print(f"tokenised in {time.time() - t0:.0f}s "
          f"(mean {sum(map(len, corpus)) / len(corpus):.0f} tokens/doc)")

    t0 = time.time()
    bm25 = BM25Okapi(corpus)
    print(f"BM25Okapi built in {time.time() - t0:.0f}s")

    payload = {
        "bm25": bm25,
        "tokenizer": {"lowercase": True, "split": "non-alphanumeric",
                      "min_token_len": MIN_TOKEN_LEN, "stemming": None},
        "n_docs": len(candidate_ids),
        "ids_sha256": ids_hash(candidate_ids),
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    with open(out, "wb") as f:
        pickle.dump(payload, f, protocol=pickle.HIGHEST_PROTOCOL)
    print(f"saved {out} ({out.stat().st_size / 1e6:.0f} MB) "
          f"in {time.time() - t0:.0f}s")

    # Post-build smoke test: a retrieval-flavoured query should surface
    # retrieval-flavoured candidates.
    global _loaded
    _loaded = payload
    smoke = "production vector search FAISS embeddings ranking NDCG retrieval"
    scores = score_query(smoke)
    top5 = np.argsort(scores)[::-1][:5]
    print(f"smoke query top-5: "
          f"{[(candidate_ids[i], round(float(scores[i]), 3)) for i in top5]}")


if __name__ == "__main__":
    main()
