"""verify_phase2.py — six-point sanity verification of the Phase-2 artifacts.

Checks, in order:
    1. Shapes, dtypes and unit-norms of the four .npy artifacts.
    2. Row alignment: re-encode 3 random candidates' career_text and confirm
       the fresh vector matches the stored row (proves candidate_ids.json,
       texts.pkl and career_embeddings.npy agree).
    3. FAISS top-20 for the JD embedding — printed for eyeballing.
    4. Negative-anchor separation: honeypots and HR/Marketing-titled
       candidates must sit closer to the anti-fit anchors than the JD's
       top-20 do.
    5. BM25 relevance: top-10 for a retrieval-flavoured query must all have
       skill_score > 0 or domain_indicator == 1.
    6. Hybrid preview: 0.70*dense + 0.30*BM25 over the FAISS top-5000,
       compared side-by-side with pure dense.

Read-only: verifies artifacts, never writes them.

Usage:
    python verify_phase2.py
"""
from __future__ import annotations

import json
import pickle
import random
import re
import time

import faiss
import numpy as np

from build_skill_canon import MODEL_CACHE_DIR, MODEL_NAME, PRECOMPUTED_DIR
from build_bm25 import score_query

RNG_SEED = 42
BM25_QUERY = "production vector search FAISS embeddings ranking NDCG retrieval"
HR_MARKETING_RE = re.compile(
    r"\b(hr|human resources|recruit\w*|talent|marketing|brand|content|seo|"
    r"social media)\b", re.IGNORECASE)

PASS, FAIL = "PASS", "FAIL"
results: list[tuple[str, str]] = []


def record(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, PASS if ok else FAIL))
    print(f"[{PASS if ok else FAIL}] {name}" + (f" — {detail}" if detail else ""))


def main() -> None:
    t_start = time.time()

    # ---- shared loads ----------------------------------------------------
    with open(PRECOMPUTED_DIR / "candidate_ids.json", encoding="utf-8") as f:
        ids: list[str] = json.load(f)
    row_of = {cid: i for i, cid in enumerate(ids)}

    career = np.load(PRECOMPUTED_DIR / "career_embeddings.npy")
    summary = np.load(PRECOMPUTED_DIR / "summary_embeddings.npy")
    jd = np.load(PRECOMPUTED_DIR / "jd_embedding.npy")
    anchors = np.load(PRECOMPUTED_DIR / "negative_anchors.npy")

    with open(PRECOMPUTED_DIR / "features.pkl", "rb") as f:
        feats: dict[str, dict] = pickle.load(f)

    index = faiss.read_index(str(PRECOMPUTED_DIR / "faiss_index.bin"))

    def describe(cid: str) -> str:
        rec = feats[cid]
        flags = []
        if rec["is_honeypot"]:
            flags.append("HONEYPOT")
        if rec["disqualifier_flag"]:
            flags.append("DQ")
        flag = (" [" + ",".join(flags) + "]") if flags else ""
        return (f"{cid}  {str(rec['current_title'])[:42]:42s} "
                f"{str(rec['location'])[:24]:24s}{flag}")

    # ---- check 1: shapes / dtypes / unit norms ---------------------------
    print("\n=== Check 1: shapes, dtypes, unit norms ===")
    n = len(ids)
    specs = [("career_embeddings", career, (n, 384)),
             ("summary_embeddings", summary, (n, 384)),
             ("jd_embedding", jd, (384,)),
             ("negative_anchors", anchors, (5, 384))]
    ok1 = True
    for name, arr, shape in specs:
        norms = np.linalg.norm(arr.reshape(-1, 384), axis=1)
        good = (arr.shape == shape and arr.dtype == np.float32
                and abs(float(norms.min()) - 1.0) < 1e-3
                and abs(float(norms.max()) - 1.0) < 1e-3)
        ok1 &= good
        print(f"  {name:20s} shape={arr.shape} dtype={arr.dtype} "
              f"norm=[{norms.min():.6f}, {norms.max():.6f}]")
    record("1 shapes/dtypes/unit-norms", ok1)

    # ---- check 2: row alignment via re-encoding --------------------------
    print("\n=== Check 2: row alignment (re-encode 3 random candidates) ===")
    with open(PRECOMPUTED_DIR / "texts.pkl", "rb") as f:
        texts: dict[str, dict] = pickle.load(f)

    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer(MODEL_NAME, cache_folder=MODEL_CACHE_DIR)

    rng = random.Random(RNG_SEED)
    probe_ids = rng.sample(ids, 3)
    fresh = model.encode([texts[cid]["career_text"] for cid in probe_ids],
                         normalize_embeddings=True, convert_to_numpy=True)
    ok2 = True
    for cid, vec in zip(probe_ids, fresh):
        sim = float(vec @ career[row_of[cid]])
        in_feats, in_texts = cid in feats, cid in texts
        ok2 &= sim > 0.999 and in_feats and in_texts
        print(f"  {cid} row={row_of[cid]:6d} re-encode cosine={sim:.6f} "
              f"features={in_feats} texts={in_texts}")
    del texts
    record("2 row alignment", ok2)

    # ---- check 3: FAISS top-20 for the JD --------------------------------
    print("\n=== Check 3: FAISS top-20 for the JD embedding (eyeball) ===")
    scores20, rows20 = index.search(jd.reshape(1, -1), 20)
    scores20, rows20 = scores20[0], rows20[0]
    for s, r in zip(scores20, rows20):
        print(f"  {s:.4f}  {describe(ids[r])}")
    record("3 JD top-20 printed (manual eyeball)", True,
           "see listing above")

    # ---- check 4: negative-anchor separation -----------------------------
    print("\n=== Check 4: negative-anchor separation ===")
    def max_anchor(rows: list[int]) -> np.ndarray:
        return (career[rows] @ anchors.T).max(axis=1)

    top20_anchor = float(max_anchor(list(rows20)).mean())

    hp_rows = [row_of[cid] for cid, f in feats.items() if f["is_honeypot"]]
    hp_anchor = float(max_anchor(hp_rows).mean())

    hr_ids = [cid for cid, f in feats.items()
              if isinstance(f["current_title"], str)
              and HR_MARKETING_RE.search(f["current_title"])]
    hr_sample = rng.sample(hr_ids, min(200, len(hr_ids)))
    hr_anchor = float(max_anchor([row_of[c] for c in hr_sample]).mean())

    ok4 = hp_anchor > top20_anchor and hr_anchor > top20_anchor
    print(f"  mean max-anchor cosine — JD top-20: {top20_anchor:.4f} | "
          f"honeypots (n={len(hp_rows)}): {hp_anchor:.4f} | "
          f"HR/Marketing sample (n={len(hr_sample)}): {hr_anchor:.4f}")
    record("4 negative-anchor separation", ok4,
           "both groups closer to anchors than JD top-20")

    # ---- check 5: BM25 relevance -----------------------------------------
    print(f"\n=== Check 5: BM25 top-10 for {BM25_QUERY!r} ===")
    bm25 = score_query(BM25_QUERY)
    top10 = np.argsort(bm25)[::-1][:10]
    ok5 = True
    for r in top10:
        f5 = feats[ids[r]]
        relevant = f5["skill_score"] > 0 or f5["domain_indicator"] == 1
        ok5 &= relevant
        print(f"  {bm25[r]:.3f}  skill={f5['skill_score']:.3f} "
              f"domain={f5['domain_indicator']}  {describe(ids[r])}")
    record("5 BM25 top-10 all relevant", ok5,
           "skill_score > 0 or domain_indicator == 1")

    # ---- check 6: hybrid preview -----------------------------------------
    print("\n=== Check 6: hybrid preview (0.70 dense + 0.30 BM25, top-5000) ===")
    dense5k, rows5k = index.search(jd.reshape(1, -1), 5000)
    dense5k, rows5k = dense5k[0], rows5k[0]
    hybrid = 0.70 * dense5k + 0.30 * bm25[rows5k]
    order = np.argsort(hybrid)[::-1][:10]
    print("  hybrid top-10:")
    for i in order:
        r = rows5k[i]
        print(f"    {hybrid[i]:.4f} (dense={dense5k[i]:.4f} "
              f"bm25={bm25[r]:.3f})  {describe(ids[r])}")
    print("  pure-dense top-10 (for comparison):")
    for s, r in zip(scores20[:10], rows20[:10]):
        print(f"    {s:.4f}  {describe(ids[r])}")
    overlap = len({rows5k[i] for i in order} & set(rows20[:10]))
    record("6 hybrid preview", True, f"{overlap}/10 overlap with pure dense")

    # ---- summary ----------------------------------------------------------
    print(f"\n=== Summary ({time.time() - t_start:.0f}s) ===")
    for name, status in results:
        print(f"  [{status}] {name}")
    if any(s == FAIL for _, s in results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
