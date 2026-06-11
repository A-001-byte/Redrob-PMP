"""build_embeddings.py — File A of the Phase-2 embedding/retrieval layer.

Produces, in --outdir (default precomputed\):
    candidate_ids.json      ordered candidate ids — THE row order for every
                            matrix and index built in Phase 2 (sorted by id)
    career_embeddings.npy   float32 (N, 384), L2-normalised SBERT embeddings
                            of career_text
    summary_embeddings.npy  float32 (N, 384), same for summary_text
    jd_embedding.npy        float32 (384,), embedding of the JD query string
    negative_anchors.npy    float32 (5, 384), anti-fit archetype embeddings

Also pre-caches cross-encoder/ms-marco-MiniLM-L-6-v2 into models\ so that
Phase 3 can run fully offline.

JD query construction: the JD docx is heading-structured, so we extract the
title plus the two sections that define fit — "Things you absolutely need"
(required skills) and "How to read between the lines" (ideal candidate) —
rather than embedding all 68 paragraphs, most of which are culture prose
that would dilute the query vector.

Usage:
    python build_embeddings.py [--texts ...texts.pkl] [--jd ...docx]
                               [--outdir ...precomputed]
"""
from __future__ import annotations

import argparse
import json
import pickle
import time
from pathlib import Path

import numpy as np

from build_skill_canon import (
    MODEL_CACHE_DIR,
    MODEL_NAME,
    PRECOMPUTED_DIR,
    PROJECT_ROOT,
)

CROSS_ENCODER_NAME = "cross-encoder/ms-marco-MiniLM-L-6-v2"
JD_PATH_DEFAULT = PROJECT_ROOT / "docs" / "job_description.docx"
BATCH_SIZE = 256

# Anti-fit archetypes: Phase 3 penalises candidates whose career embedding
# sits closer to one of these than to the JD.
NEGATIVE_ANCHORS: list[str] = [
    "HR Manager handling recruitment operations, employee onboarding, "
    "payroll and HR policy compliance",
    "Marketing Manager driving brand campaigns, social media strategy, "
    "content marketing and lead generation",
    "IT services consultant working on client projects, application "
    "maintenance and enterprise support at a large consulting firm",
    "Academic researcher publishing papers on theoretical machine learning "
    "with no production deployment experience",
    "Computer vision and robotics specialist working on image processing, "
    "object detection and autonomous systems",
]

# Headings of the JD sections that go into the query string. Matched
# case-insensitively on the heading text, so paragraph indices may shift.
JD_QUERY_SECTIONS = ("things you absolutely need", "how to read between the lines")


def extract_jd_query(jd_path: str | Path) -> str:
    """Title + required-skills section + ideal-candidate section of the JD."""
    import docx  # local import: only needed for this one step

    document = docx.Document(str(jd_path))
    parts: list[str] = []
    in_wanted_section = False

    for para in document.paragraphs:
        text = para.text.strip()
        if not text:
            continue
        style = (para.style.name if para.style else "").lower()
        if not parts:
            parts.append(text)  # first non-empty paragraph = title line
            continue
        if style.startswith("heading"):
            in_wanted_section = any(
                section in text.lower() for section in JD_QUERY_SECTIONS
            )
            continue
        if in_wanted_section:
            parts.append(text)

    query = " ".join(parts)
    if len(parts) < 3:  # title only -> extraction failed, fail loudly
        raise ValueError(
            f"JD section extraction found only {len(parts)} paragraphs — "
            f"check the headings in {jd_path}"
        )
    return query


def encode_normalized(model, texts: list[str], desc: str) -> np.ndarray:
    """Encode to a float32, L2-normalised matrix."""
    emb = model.encode(
        texts,
        batch_size=BATCH_SIZE,
        show_progress_bar=True,
        normalize_embeddings=True,
        convert_to_numpy=True,
    )
    print(f"  {desc}: {emb.shape}")
    return np.ascontiguousarray(emb, dtype=np.float32)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Phase-2 embeddings")
    parser.add_argument("--texts", default=str(PRECOMPUTED_DIR / "texts.pkl"))
    parser.add_argument("--jd", default=str(JD_PATH_DEFAULT))
    parser.add_argument("--outdir", default=str(PRECOMPUTED_DIR))
    args = parser.parse_args()
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(MODEL_NAME, cache_folder=MODEL_CACHE_DIR)

    print(f"Loading {args.texts} ...")
    with open(args.texts, "rb") as f:
        texts: dict[str, dict] = pickle.load(f)

    # Fixed row order: sorted candidate_ids, written before any matrix so
    # every later artifact provably follows it.
    candidate_ids = sorted(texts)
    with open(outdir / "candidate_ids.json", "w", encoding="utf-8") as f:
        json.dump(candidate_ids, f)
    print(f"candidate_ids.json: {len(candidate_ids)} ids (sorted)")

    # Career embeddings — encode, save, free before touching summaries so
    # we never hold two 100K matrices plus the text dict at once.
    t0 = time.time()
    career = encode_normalized(
        model, [texts[cid]["career_text"] for cid in candidate_ids],
        "career_embeddings")
    np.save(outdir / "career_embeddings.npy", career)
    del career
    print(f"  career done in {time.time() - t0:.0f}s")

    t0 = time.time()
    summary = encode_normalized(
        model, [texts[cid]["summary_text"] for cid in candidate_ids],
        "summary_embeddings")
    np.save(outdir / "summary_embeddings.npy", summary)
    del summary, texts
    print(f"  summary done in {time.time() - t0:.0f}s")

    # JD query embedding.
    jd_query = extract_jd_query(args.jd)
    print(f"JD query: {len(jd_query)} chars | starts: {jd_query[:100]!r}")
    jd_emb = encode_normalized(model, [jd_query], "jd_embedding")[0]
    np.save(outdir / "jd_embedding.npy", jd_emb)

    # Negative anchors.
    anchors = encode_normalized(model, NEGATIVE_ANCHORS, "negative_anchors")
    np.save(outdir / "negative_anchors.npy", anchors)

    # Pre-cache the Phase-3 cross-encoder so later phases run offline.
    print(f"Caching {CROSS_ENCODER_NAME} into {MODEL_CACHE_DIR} ...")
    from huggingface_hub import snapshot_download
    snapshot_download(CROSS_ENCODER_NAME, cache_dir=MODEL_CACHE_DIR)
    print("Phase-2 embedding artifacts complete.")


if __name__ == "__main__":
    main()
