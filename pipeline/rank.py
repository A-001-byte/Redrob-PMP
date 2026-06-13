"""rank.py — File C of Phase 3: THE ranking entry point (organizers run this).

Six-layer funnel over the precomputed artifacts, CPU-only, zero network:

    L0  FAISS retrieval        top --topk-l0 (5000) by dense cosine vs JD
    L1  Hybrid re-score        weighted RRF(dense, bm25)      -> top 500
    L2  Cross-encoder re-rank  ms-marco on (JD query, career_text) -> top 200
    L3  Composite score        scorer.composite_score()       -> top 150
    L4  L2-ranker re-rank      pass-through placeholder       -> top 100
    L5  Assessment hard gate   ranks 1-20 only (gate_data.pkl)
    L6  Honeypot/DQ safety     zero tolerance in the final 100
    OUT reasoning.generate_reasoning() + submission.csv

Design notes (locked by Phase-2 measurement and the submission validator):
- The BM25 sparse channel uses a fixed keyword query of the JD's
  distinctive lexical terms, validated in Phase-2 checks 5-6 (top-10 all
  relevant). The dense channel uses the full JD-section embedding.
- L1 fusion is weighted Reciprocal Rank Fusion (70/30, k=60) by default;
  `--fusion linear` restores the legacy minmax blend for rollback.
- Raw cross-encoder logits order L2 but never enter the composite
  (uncalibrated scale); they are passed through per candidate for the
  future LightGBM ranker.
- The validator demands scores non-increasing by rank AND equal scores in
  candidate_id-ascending order. L5/L6 reorder away from score order, so
  the score column is capped after final ordering: a row outscoring its
  predecessor is capped to it, and a capped tie that would break the
  id-ascending rule is nudged 0.0001 below instead.

Usage:
    python pipeline\\rank.py --precomputed precomputed --out submission\\submission.csv
"""
from __future__ import annotations

import os

# Hard offline guarantee BEFORE any HuggingFace import: rank time must
# never touch the network, even for a metadata HEAD request.
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

import argparse
import csv
import json
import pickle
import time
from pathlib import Path

import numpy as np

from build_bm25 import ids_hash, load_index as load_bm25, score_query
from build_index import search
from build_skill_canon import MODEL_CACHE_DIR, PRECOMPUTED_DIR, PROJECT_ROOT
from reasoning import generate_reasoning
from config_loader import CONFIG
from scorer import (assessment_gate_violations, composite_score,
                    consistency_adjustment, negative_anchor_penalty)

_PC = CONFIG["pipeline"]

CROSS_ENCODER_NAME = "cross-encoder/ms-marco-MiniLM-L-6-v2"
CE_BATCH_SIZE = _PC["ce_batch_size"]
CE_MAX_LENGTH = _PC["ce_max_length"]

# Sparse-channel query: the JD's distinctive lexical terms. Validated in
# Phase 2 (BM25 top-10 all skill/domain-relevant; hybrid preview promoted
# candidates with explicit FAISS/NDCG/retrieval language).
BM25_QUERY = "production vector search FAISS embeddings ranking NDCG retrieval"
W_DENSE, W_BM25 = _PC["rrf_dense_weight"], _PC["rrf_bm25_weight"]
RRF_K = _PC["rrf_k"]

FINAL_K = _PC["topk_final"]
GATE_TOP_N = _PC["gate_top_n"]
SCORE_DECIMALS = 4

# L4 placeholder: the LightGBM LambdaRank model is trained in a later phase
# (needs hand-labelled validation data). Flag stays False until then.
USE_L2_RANKER = False


def l2_rerank(ordered_ids: list[str], records: dict[str, dict],
              use_l2_ranker: bool = USE_L2_RANKER) -> list[str]:
    """L4: LightGBM LambdaRank re-rank — currently a pass-through.

    TODO(phase-5): load the trained LambdaRank model and re-order using each
    record's parts_dict + cross_encoder feature vector. The interface is
    final; only the body changes, so the funnel needs no surgery.
    """
    if not use_l2_ranker:
        return ordered_ids
    raise NotImplementedError("LightGBM ranker not trained yet (later phase)")


def rrf_fuse(ids: list[str], dense: np.ndarray, sparse: np.ndarray,
             w_dense: float = W_DENSE, w_sparse: float = W_BM25,
             k: int = RRF_K) -> np.ndarray:
    """L1 weighted Reciprocal Rank Fusion over the L0 pool.

    Rank-based, so immune to the scale mismatch between dense cosine and
    raw BM25 that the linear blend has to minmax away. Ranks are tie-broken
    by candidate_id ascending — deterministic across runs.
    """
    def ranks(scores: np.ndarray) -> np.ndarray:
        order = sorted(range(len(ids)), key=lambda i: (-scores[i], ids[i]))
        r = np.empty(len(ids), dtype=np.float64)
        r[order] = np.arange(1, len(ids) + 1)
        return r

    return w_dense / (k + ranks(dense)) + w_sparse / (k + ranks(sparse))


def minmax(x: np.ndarray) -> np.ndarray:
    """Min-max to [0,1]; all-equal input maps to zeros."""
    x = np.asarray(x, dtype=np.float64)
    lo, hi = float(x.min()), float(x.max())
    if hi <= lo:
        return np.zeros_like(x)
    return (x - lo) / (hi - lo)


def rank_sort(scored: list[tuple[str, float]]) -> list[tuple[str, float]]:
    """Score descending, ties broken by candidate_id ascending — explicit."""
    return sorted(scored, key=lambda t: (-t[1], t[0]))


def main() -> None:
    parser = argparse.ArgumentParser(description="Six-layer candidate ranker")
    parser.add_argument("--precomputed", default=str(PRECOMPUTED_DIR))
    parser.add_argument("--out",
                        default=str(PROJECT_ROOT / "submission" / "submission.csv"))
    parser.add_argument("--topk-l0", type=int, default=_PC["topk_l0"])
    parser.add_argument("--topk-l1", type=int, default=_PC["topk_l1"])
    parser.add_argument("--topk-l2", type=int, default=_PC["topk_l2"])
    parser.add_argument("--topk-l3", type=int, default=_PC["topk_l3"])
    parser.add_argument("--fusion", choices=["rrf", "linear"], default="rrf",
                        help="L1 dense+sparse fusion: weighted RRF (default) "
                             "or the legacy 0.70*minmax(dense)+0.30*bm25 blend")
    args = parser.parse_args()
    precomp = Path(args.precomputed)

    timings: dict[str, float] = {}
    t_total = time.time()

    # ---- load artifacts (+ alignment check) -------------------------------
    t0 = time.time()
    with open(precomp / "candidate_ids.json", encoding="utf-8") as f:
        ids: list[str] = json.load(f)
    row_of = {cid: i for i, cid in enumerate(ids)}

    bm25_payload = load_bm25(precomp / "bm25_index.pkl")
    if bm25_payload["ids_sha256"] != ids_hash(ids):
        raise RuntimeError("bm25_index.pkl ids_sha256 mismatch — artifacts "
                           "are not row-aligned; rebuild Phase 2")

    jd = np.load(precomp / "jd_embedding.npy")
    anchors = np.load(precomp / "negative_anchors.npy")
    career = np.load(precomp / "career_embeddings.npy", mmap_mode="r")
    summary = np.load(precomp / "summary_embeddings.npy", mmap_mode="r")
    with open(precomp / "features.pkl", "rb") as f:
        feats: dict[str, dict] = pickle.load(f)
    with open(precomp / "texts.pkl", "rb") as f:
        texts: dict[str, dict] = pickle.load(f)
    with open(precomp / "gate_data.pkl", "rb") as f:
        gate_data: dict[str, list] = pickle.load(f)
    jd_query = (precomp / "jd_query.txt").read_text(encoding="utf-8")
    timings["load"] = time.time() - t0

    # ---- L0: dense retrieval ----------------------------------------------
    t0 = time.time()
    dense, l0_ids = search(jd, k=args.topk_l0,
                           index_path=precomp / "faiss_index.bin",
                           ids_path=precomp / "candidate_ids.json")
    timings["L0_faiss"] = time.time() - t0

    # ---- L1: hybrid dense + sparse ----------------------------------------
    t0 = time.time()
    bm25_all = score_query(BM25_QUERY, index_path=precomp / "bm25_index.pkl")
    l0_rows = np.array([row_of[cid] for cid in l0_ids])
    sparse = bm25_all[l0_rows]
    if args.fusion == "rrf":
        hybrid = rrf_fuse(l0_ids, dense, sparse)
    else:
        hybrid = W_DENSE * minmax(dense) + W_BM25 * sparse
    l1 = rank_sort(list(zip(l0_ids, hybrid.tolist())))[: args.topk_l1]
    hybrid_of = dict(l1)
    timings["L1_hybrid"] = time.time() - t0

    # ---- L2: cross-encoder re-rank ----------------------------------------
    t0 = time.time()
    from sentence_transformers import CrossEncoder
    ce = CrossEncoder(CROSS_ENCODER_NAME, max_length=CE_MAX_LENGTH,
                      cache_folder=MODEL_CACHE_DIR)
    pairs = [(jd_query, texts[cid]["career_text"]) for cid, _ in l1]
    # Sort by career_text length to minimise padding waste in CE batches
    orig_indices = list(range(len(pairs)))
    sorted_order = sorted(orig_indices, key=lambda i: len(pairs[i][1]))
    pairs_sorted = [pairs[i] for i in sorted_order]
    ce_logits_sorted = ce.predict(pairs_sorted, batch_size=CE_BATCH_SIZE,
                                  show_progress_bar=False)
    # Re-align scores back to original pair order
    ce_logits = [0.0] * len(pairs)
    for orig_i, score in zip(sorted_order, ce_logits_sorted):
        ce_logits[orig_i] = score
    l2 = rank_sort([(cid, float(s))
                    for (cid, _), s in zip(l1, ce_logits)])[: args.topk_l2]
    ce_of = dict(l2)
    timings["L2_cross_encoder"] = time.time() - t0
    print(f"L2 cross-encoder: {len(pairs)} pairs in "
          f"{timings['L2_cross_encoder']:.1f}s")

    # ---- L3: composite score ----------------------------------------------
    t0 = time.time()
    l2_ids = [cid for cid, _ in l2]
    sem_norm = minmax(np.array([hybrid_of[cid] for cid in l2_ids]))
    records: dict[str, dict] = {}
    scored: list[tuple[str, float]] = []
    for cid, sem in zip(l2_ids, sem_norm.tolist()):
        r = row_of[cid]
        cons = consistency_adjustment(summary[r], career[r],
                                      texts[cid]["summary_text"])
        pen = negative_anchor_penalty(career[r], anchors)
        comp, base, parts = composite_score(feats[cid], sem, cons, pen)
        parts["cross_encoder"] = ce_of[cid]   # L2-only signal, kept for LightGBM
        records[cid] = {"composite": comp, "base": base, "parts": parts}
        scored.append((cid, comp))
    l3_ids = [cid for cid, _ in rank_sort(scored)[: args.topk_l3]]
    timings["L3_composite"] = time.time() - t0

    # ---- L4: ranker placeholder -------------------------------------------
    t0 = time.time()
    l4_ids = l2_rerank(l3_ids, records)
    final = l4_ids[:FINAL_K]
    bench = l4_ids[FINAL_K:]            # replacement pool for L6
    timings["L4_rerank"] = time.time() - t0

    # ---- L5: assessment hard gate on ranks 1-20 ----------------------------
    t0 = time.time()
    demotions: list[str] = []
    for _ in range(GATE_TOP_N + 5):     # bounded: each pass demotes one
        violator = next(
            (i for i in range(min(GATE_TOP_N, len(final)))
             if assessment_gate_violations(gate_data.get(final[i]))), None)
        if violator is None:
            break
        cid = final.pop(violator)
        final.insert(GATE_TOP_N, cid)   # just below rank 20
        viols = assessment_gate_violations(gate_data.get(cid))
        detail = ", ".join(f"{name} ({score:.0f})"
                           for name, _, score in gate_data[cid]
                           if name in viols and score is not None)
        msg = (f"L5 DEMOTION: {cid} rank {violator + 1} -> {GATE_TOP_N + 1}: "
               f"expert claim on required skill below 40: {detail}")
        demotions.append(msg)
        print(msg)
    timings["L5_gate"] = time.time() - t0

    # ---- L6: honeypot/DQ zero tolerance ------------------------------------
    t0 = time.time()
    replacements: list[str] = []
    clean_bench = iter([cid for cid in bench
                        if not feats[cid]["is_honeypot"]
                        and not feats[cid]["disqualifier_flag"]])
    for i, cid in enumerate(list(final)):
        rec = feats[cid]
        if rec["is_honeypot"] or rec["disqualifier_flag"]:
            sub = next(clean_bench, None)
            if sub is None:
                raise RuntimeError("L6: replacement pool exhausted")
            final.remove(cid)
            final.append(sub)
            msg = (f"L6 WARNING: {cid} (honeypot={rec['is_honeypot']}, "
                   f"dq={rec['disqualifier_flag']}) reached rank {i + 1} — "
                   f"replaced with {sub}")
            replacements.append(msg)
            print(msg)
    assert not any(feats[c]["is_honeypot"] or feats[c]["disqualifier_flag"]
                   for c in final), "L6 safety check failed after replacement"
    assert len(final) == FINAL_K
    timings["L6_safety"] = time.time() - t0

    # ---- OUT: reasoning + CSV ----------------------------------------------
    t0 = time.time()
    rows: list[tuple[str, int, float, str]] = []
    prev_score, prev_id = None, None
    for i, cid in enumerate(final):
        score = round(records[cid]["composite"], SCORE_DECIMALS)
        if prev_score is not None:
            if score > prev_score:              # demoted/replaced row: cap
                score = prev_score
            if score == prev_score and cid < prev_id:
                score = round(prev_score - 10 ** -SCORE_DECIMALS,
                              SCORE_DECIMALS)   # keep id-ascending tie rule
        reason = generate_reasoning(cid, feats[cid],
                                    records[cid]["parts"], i + 1)
        rows.append((cid, i + 1, score, reason))
        prev_score, prev_id = score, cid

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["candidate_id", "rank", "score", "reasoning"])
        for cid, rank, score, reason in rows:
            writer.writerow([cid, rank, f"{score:.{SCORE_DECIMALS}f}", reason])
    timings["output"] = time.time() - t0
    timings["total"] = time.time() - t_total

    with open(out.parent / "rank_timing.json", "w", encoding="utf-8") as f:
        json.dump({"timings_s": {k: round(v, 2) for k, v in timings.items()},
                   "funnel": [len(l0_ids), len(l1), len(l2), len(l3_ids),
                              len(final)],
                   "l5_demotions": demotions,
                   "l6_replacements": replacements}, f, indent=2)

    # Per-finalist score breakdown: consumed by verify_phase3.py (quality
    # eyeball) and the future LightGBM phase (feature vectors incl. the
    # cross-encoder logit).
    with open(out.parent / "rank_details.json", "w", encoding="utf-8") as f:
        json.dump({cid: {"rank": i + 1, **records[cid]}
                   for i, cid in enumerate(final)}, f, indent=2)

    # ---- report -------------------------------------------------------------
    print(f"\nfunnel: {len(l0_ids)} -> {len(l1)} -> {len(l2)} "
          f"-> {len(l3_ids)} -> {len(final)}")
    print("timings: " + "  ".join(f"{k}={v:.1f}s" for k, v in timings.items()))
    if timings["total"] >= 300:
        print("!! TOTAL EXCEEDS THE 5-MINUTE BUDGET !!")
    print(f"\nwrote {out}\n\ntop 10:")
    for cid, rank, score, _ in rows[:10]:
        rec = feats[cid]
        print(f"  {rank:3d}  {score:.4f}  {cid}  "
              f"{str(rec['current_title'])[:40]:40s} {rec['location']}")


if __name__ == "__main__":
    main()
