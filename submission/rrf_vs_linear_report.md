# RRF vs Linear Blend — Comparison Report

## Methods

**RRF (current):** `rrf_score = 0.70 / (60 + rank_dense) + 0.30 / (60 + rank_bm25)` — rank-based, immune to scale mismatch between cosine similarities and raw BM25 scores; k=60 following Cormack et al. Both ranks are computed within the FAISS top-5,000 pool.

**Linear blend (legacy):** `linear_score = 0.70 · minmax(dense) + 0.30 · bm25_global` — dense cosine scores are min-max normalised within the L0 pool; BM25 scores are pre-normalised globally over all 100K candidates by `score_query()`. A candidate with extreme BM25 scores compresses the range for every other candidate in the linear case.

## L1 Pool Comparison (top-500)

| Metric | RRF | Linear |
|--------|-----|--------|
| Candidates selected | 500 | 500 |
| Overlap | 468/500 | — |
| Unique to method | **32** (RRF-only) | **32** (Linear-only) |

## What RRF Promoted
Candidates in RRF's top-500 but not linear's — sorted by RRF score descending.
High BM25 rank (low number) with middling FAISS rank reveals the rescue effect: these
candidates use ML-specific vocabulary (FAISS, NDCG, retrieval) that the dense embedding
blurs but BM25 picks up clearly.

| Candidate | FAISS Rank | BM25 Rank | RRF Score | Linear Score | In Top-100? |
|-----------|-----------|----------|-----------|-------------|-------------|
| CAND_0049615 | 1,866 | 85 | 0.00243 | 0.13327 | no |
| CAND_0080534 | 1,867 | 86 | 0.00242 | 0.13327 | no |
| CAND_0064904 | 2,032 | 84 | 0.00242 | 0.13277 | YES |
| CAND_0058688 | 2,273 | 83 | 0.00240 | 0.12675 | no |
| CAND_0009236 | 2,041 | 87 | 0.00237 | 0.12815 | no |
| CAND_0016267 | 2,394 | 94 | 0.00223 | 0.11720 | no |
| CAND_0051593 | 2,395 | 95 | 0.00222 | 0.11720 | no |
| CAND_0089012 | 2,396 | 96 | 0.00221 | 0.11720 | no |
| CAND_0061479 | 2,779 | 108 | 0.00203 | 0.10674 | no |
| CAND_0013122 | 1,480 | 132 | 0.00202 | 0.13944 | no |

## What Linear Promoted (that RRF dropped)
Candidates in linear's top-500 but not RRF's — sorted by linear score descending.
These tend to have high FAISS cosine similarity but weak BM25 rank, so RRF's 0.30 weight
on BM25 rank pulls them below the 500 cutoff.

| Candidate | FAISS Rank | BM25 Rank | RRF Score | Linear Score | In Top-100? |
|-----------|-----------|----------|-----------|-------------|-------------|
| CAND_0068892 | 863 | 317 | 0.00155 | 0.15188 | no |
| CAND_0029762 | 441 | 1,599 | 0.00158 | 0.15140 | no |
| CAND_0064071 | 428 | 2,033 | 0.00158 | 0.15104 | no |
| CAND_0059638 | 444 | 1,636 | 0.00157 | 0.15086 | no |
| CAND_0045710 | 425 | 2,077 | 0.00158 | 0.15083 | no |
| CAND_0010546 | 460 | 1,464 | 0.00154 | 0.14939 | no |
| CAND_0067427 | 454 | 1,745 | 0.00153 | 0.14937 | no |
| CAND_0048360 | 995 | 265 | 0.00159 | 0.14918 | no |
| CAND_0037990 | 470 | 1,125 | 0.00157 | 0.14891 | no |
| CAND_0097829 | 475 | 1,039 | 0.00158 | 0.14889 | no |

### Linear-only candidates confirmed absent from top-100
Linear-only candidates that appear in the final top-100: **0** (expected: 0)

## Score Distribution (FAISS top-5,000)

| Metric | RRF | Linear |
|--------|-----|--------|
| Mean   | 0.000885 | 0.077068 |
| Std    | 0.001438 | 0.082800 |
| Min    | 0.000198 | 0.000000 |
| Max    | 0.015761 | 0.890238 |
| p25    | 0.000304 | 0.029414 |
| p75    | 0.000807 | 0.095395 |
| p95    | 0.002890 | 0.206300 |
| CV (std/mean) | 1.6249 | 1.0744 |

**RRF has 1.5× higher coefficient of variation** (1.6249 vs 1.0744).
This is expected: RRF scores are bounded by `1/(k+1) ≈ 0.016` at the top and converge
toward `1/(k+5000)` at the bottom, creating a right-skewed distribution where the top
few candidates diverge sharply from the dense mid-tier. Linear's problem is different
and more subtle: BM25 is globally normalised (over 100K), so its absolute values within
the L0 pool are compressed relative to dense scores that are minmaxed locally over the
5,000 — candidates with strong BM25 rank in the pool still carry a small absolute BM25
contribution because the global normaliser was set by non-pool outliers.

## Pool Rank Profile (median FAISS & BM25 rank within L0)

| Group | Median FAISS Rank | Median BM25 Rank |
|-------|------------------|-----------------|
| Overlap (in both) | 234 | 272 |
| RRF-only (RRF rescues) | 1,671 | 139 |
| Linear-only (linear rescues) | 446 | 2,132 |

RRF-rescued candidates have a **weaker median FAISS rank** but a **stronger median BM25 rank**
than the overlap group — exactly the use-case RRF was designed for: candidates whose
exact ML vocabulary (FAISS, NDCG, retrieval embeddings) is under-represented in the dense
embedding but clear in BM25.

## Impact on Final Top-100

- **Candidates in top-100 that RRF contributed (would be missed by linear at L1):** 1
- **Top-100 candidates that linear kept but RRF dropped:** 0 (expected: 0)

RRF-contributed candidates:
- CAND_0064904 (FAISS rank 2,032, BM25 rank 84)

## Key Findings

- **468/500 (94%) overlap** at L1: the two methods agree on the vast majority of candidates; the difference is concentrated at the margin of the 500-slot pool.
- **RRF rescues BM25-strong / FAISS-weak candidates.** The 32 RRF-only candidates have a median BM25 rank of 139 vs 272 for the overlap group — they surface candidates who use the exact lexical signals (FAISS, NDCG, vector search) that SBERT blurs across synonyms.
- **Scale mismatch is the core flaw of linear.** BM25 is globally normalised over 100K candidates but dense is minmaxed within the 5,000 pool — a strong BM25 rank within the pool (e.g. rank 84) still carries a small absolute BM25 value (0.13) because the global normaliser was set by non-pool documents. RRF avoids this entirely by working in rank space within the pool: a BM25 rank of 84 contributes `0.30/(60+84) = 0.0021` regardless of absolute score scale.
- **1 top-100 candidate(s) are RRF-exclusive** — they would not have reached L2 (the cross-encoder) under the legacy linear blend, meaning RRF measurably improves final output quality.

## Interview Answer

We measured the L1 pool difference by reconstructing both scoring methods from precomputed FAISS and BM25 artifacts: RRF and linear agree on 468/500 candidates (94%), with RRF exclusively promoting 32 candidates whose strong BM25 rank (median 139 in the pool) was suppressed by their weaker FAISS cosine score under min-max normalisation. The switch to RRF directly added 1 candidate(s) to the final top-100 who would have been eliminated at L1 before the cross-encoder ever scored them. RRF is the right choice here because it prevents the scale-mismatch between cosine similarities and global BM25 scores from compressing mid-tier candidates, and because the BM25 channel's job — catching explicit JD vocabulary like FAISS, NDCG, and retrieval — is exactly the scenario where rank-based fusion outperforms score-based blending.
