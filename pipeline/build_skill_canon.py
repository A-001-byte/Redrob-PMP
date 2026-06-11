"""build_skill_canon.py — File A of the Phase-1 offline pipeline.

Builds skill_canon.pkl: a mapping from each JD skill (required + nice-to-have)
to the list of raw candidate-skill name strings that match it.

A candidate skill matches a JD skill if EITHER:
  1. SBERT cosine similarity >= 0.75 (all-MiniLM-L6-v2), OR
  2. a lexical alias of the JD skill appears (word-bounded) in the
     normalized candidate skill name.

The lexical fallback exists because measured MiniLM similarities for obvious
variants fall well below 0.75 on short strings ("FAISS" vs "faiss vector
search" = 0.51, "Pinecone" vs "pinecone vector database" = 0.62), so a pure
embedding threshold would silently drop legitimate matches.

This is the ONLY Phase-1 file that loads a model. It streams the candidate
file to collect unique skill names (never holds all candidates in memory)
and embeds each unique skill exactly once.

Usage:
    python build_skill_canon.py --candidates ./data/candidates.jsonl \
        --out ./precomputed/skill_canon.pkl

Output pickle layout (see contracts.SkillCanon):
    {
        "canon": {jd_skill: [candidate_skill, ...], ...},
        "threshold": 0.75,
        "required_skills": [...],
        "nicetohave_skills": [...],
        "model_name": "all-MiniLM-L6-v2",
    }
"""
from __future__ import annotations

import argparse
import json
import pickle
import re
from pathlib import Path
from typing import Any, Iterator

import numpy as np
from tqdm import tqdm

# ---------------------------------------------------------------------------
# JD skill lists — module constants. build_features.py imports these.
#
# These are CAPABILITY GROUPS, not individual products. The dataset uses a
# controlled vocabulary of 133 skill names; product-level JD skills caused
# two measured problems on the full 100K corpus:
#   * capability-level names (Vector Search, BM25, Information Retrieval,
#     RAG, pgvector, ...) matched no JD skill at all, and
#   * the generic "Embeddings" skill matched both "BGE embeddings" and
#     "E5 embeddings", double-counting one listed skill (5,080 candidates).
# Grouping fixes both: each group is matched at most once per candidate,
# and the alias lists carry the product-level mapping.
# ---------------------------------------------------------------------------
REQUIRED_SKILLS: list[str] = [
    "embedding models",          # sentence-transformers / OpenAI / BGE / E5
    "vector search & retrieval", # vector DBs, hybrid search, IR, RAG stack
    "Python",
    "ranking & evaluation",      # NDCG / MRR / MAP / A/B testing / ranking
]

NICETOHAVE_SKILLS: list[str] = [
    "parameter-efficient fine-tuning",  # LoRA / QLoRA / PEFT
    "learning-to-rank",
    "NLP",
    "recommendation systems",
    "MLOps tooling",                    # MLflow / W&B / Kubeflow
    "distributed systems",
]

# Lexical aliases per JD skill group, written in *normalized* form
# (lowercase, separators including '&' collapsed to single spaces — see
# _normalize). Matched with word boundaries, so e.g. "lora" does not fire
# inside "exploratory".
LEXICAL_ALIASES: dict[str, list[str]] = {
    "embedding models": [
        "embedding", "embeddings", "sentence transformer",
        "sentence transformers", "sbert", "openai embedding",
        "text embedding ada", "bge", "e5", "text encoder", "text encoders",
        "vector representation", "vector representations",
    ],
    "vector search & retrieval": [
        "pinecone", "weaviate", "qdrant", "milvus", "faiss",
        "elasticsearch", "elastic search", "opensearch", "open search",
        "pgvector", "bm25", "vector search", "vector database", "vector db",
        "semantic search", "hybrid search", "information retrieval",
        "indexing", "rag", "retrieval augmented generation", "haystack",
        "langchain", "llamaindex", "search infrastructure",
        "search backend", "search discovery",
    ],
    "Python": ["python"],
    "ranking & evaluation": [
        "ndcg", "mrr", "mean reciprocal rank", "mean average precision",
        "a b testing", "a b test", "ab testing", "ab test",
        "split testing", "ranking system", "ranking systems",
        "ranking metric", "ranking metrics", "search relevance",
    ],
    "parameter-efficient fine-tuning": [
        "lora", "qlora", "peft", "low rank adaptation",
        "parameter efficient fine tuning", "fine tuning llms",
        "model adaptation",
    ],
    "learning-to-rank": ["learning to rank", "lambdamart"],
    "NLP": [
        "nlp", "natural language processing", "llm", "llms",
        "hugging face transformers",
    ],
    "recommendation systems": [
        "recommendation", "recommender", "recsys", "rec sys",
        "content matching",
    ],
    "MLOps tooling": [
        "mlflow", "ml flow", "mlops", "weights biases", "kubeflow",
    ],
    "distributed systems": [
        "distributed system", "distributed systems",
        "distributed computing", "microservices", "kafka", "spark", "flink",
    ],
}

MODEL_NAME = "all-MiniLM-L6-v2"
SIM_THRESHOLD = 0.75

# Project layout is anchored to D:\H2S (parent of pipeline/), so the scripts
# work no matter which directory they are launched from.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODEL_CACHE_DIR = str(PROJECT_ROOT / "models")
DATA_DIR = PROJECT_ROOT / "data"
PRECOMPUTED_DIR = PROJECT_ROOT / "precomputed"

_SEPARATORS = re.compile(r"[-_/\\.,+&]+")
_MULTI_SPACE = re.compile(r"\s+")


def _normalize(name: str) -> str:
    """Lowercase and collapse separators so "A/B-Testing" -> "a b testing"."""
    name = _SEPARATORS.sub(" ", name.lower())
    return _MULTI_SPACE.sub(" ", name).strip()


def iter_candidates(path: str | Path) -> Iterator[dict[str, Any]]:
    """Yield candidate dicts from either a .jsonl file (one object per line)
    or a pretty-printed JSON array file (like sample_candidates.json).

    Streams .jsonl line-by-line so the 465 MB file is never fully in memory.
    Malformed lines are skipped, never raised.
    """
    path = Path(path)
    with open(path, "r", encoding="utf-8") as f:
        # Sniff the format: a JSON array file starts with '['.
        first_char = f.read(1)
        f.seek(0)
        if first_char == "[":
            try:
                records = json.load(f)
            except json.JSONDecodeError:
                return
            for record in records:
                if isinstance(record, dict):
                    yield record
        else:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(record, dict):
                    yield record


def collect_unique_skills(candidates_path: str | Path) -> list[str]:
    """Stream the candidate file and return every unique skill name string.

    Dedupes case-insensitively on the whitespace-stripped string; original
    casing of the first occurrence is preserved because canon values must be
    raw names as they appear in candidate records, so build_features.py can
    match them back (it matches case-insensitively too).
    """
    seen_lower: set[str] = set()
    unique: list[str] = []
    for candidate in tqdm(
        iter_candidates(candidates_path), desc="Collecting skills", unit=" cand"
    ):
        skills = candidate.get("skills")
        if not isinstance(skills, list):
            continue
        for skill in skills:
            if not isinstance(skill, dict):
                continue
            name = skill.get("name")
            if not isinstance(name, str):
                continue
            name = name.strip()
            if not name:
                continue
            key = name.lower()
            if key not in seen_lower:
                seen_lower.add(key)
                unique.append(name)
    return unique


def _lexical_match(jd_skill: str, normalized_name: str) -> bool:
    """True if any alias of jd_skill appears word-bounded in the name."""
    for alias in LEXICAL_ALIASES.get(jd_skill, []):
        if re.search(rf"\b{re.escape(alias)}\b", normalized_name):
            return True
    return False


def build_canon(
    unique_skills: list[str], threshold: float = SIM_THRESHOLD
) -> dict[str, list[str]]:
    """Return {jd_skill: [matching raw candidate skill names]}.

    Match = SBERT cosine >= threshold OR lexical alias hit.
    Embeddings are L2-normalized so cosine similarity is a plain dot product.
    """
    # Imported here so that `import build_skill_canon` (for the JD constants)
    # stays cheap in build_features.py — no model libraries pulled in.
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(MODEL_NAME, cache_folder=MODEL_CACHE_DIR)

    jd_skills = REQUIRED_SKILLS + NICETOHAVE_SKILLS
    jd_emb = model.encode(
        jd_skills, normalize_embeddings=True, show_progress_bar=False
    )
    skill_emb = model.encode(
        unique_skills,
        batch_size=256,
        normalize_embeddings=True,
        show_progress_bar=True,
    )

    # (n_jd, n_skills) cosine similarity matrix. 24 x ~50k floats is small.
    sims = np.asarray(jd_emb) @ np.asarray(skill_emb).T

    normalized = [_normalize(s) for s in unique_skills]
    canon: dict[str, list[str]] = {}
    for i, jd_skill in enumerate(jd_skills):
        matches = [
            unique_skills[j]
            for j in range(len(unique_skills))
            if sims[i, j] >= threshold or _lexical_match(jd_skill, normalized[j])
        ]
        canon[jd_skill] = matches
    return canon


def main() -> None:
    parser = argparse.ArgumentParser(description="Build skill_canon.pkl")
    parser.add_argument("--candidates", default=str(DATA_DIR / "candidates.jsonl"))
    parser.add_argument("--out", default=str(PRECOMPUTED_DIR / "skill_canon.pkl"))
    parser.add_argument("--threshold", type=float, default=SIM_THRESHOLD)
    args = parser.parse_args()

    unique_skills = collect_unique_skills(args.candidates)
    print(f"Unique skill names found: {len(unique_skills)}")

    canon = build_canon(unique_skills, threshold=args.threshold)

    payload = {
        "canon": canon,
        "threshold": args.threshold,
        "required_skills": REQUIRED_SKILLS,
        "nicetohave_skills": NICETOHAVE_SKILLS,
        "model_name": MODEL_NAME,
    }
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "wb") as f:
        pickle.dump(payload, f, protocol=pickle.HIGHEST_PROTOCOL)

    total_matches = sum(len(v) for v in canon.values())
    print(f"Saved {out_path} ({total_matches} skill matches across "
          f"{len(canon)} JD skills)")
    for jd_skill, matched in canon.items():
        preview = ", ".join(matched[:5]) + (" ..." if len(matched) > 5 else "")
        print(f"  {jd_skill:40s} -> {len(matched):4d}  [{preview}]")


if __name__ == "__main__":
    main()
