# Redrob Ranker — Stage 3 Docker reproduction.
# Build context must contain the precomputed/ artifacts and cached models/
# (regenerate via the offline scripts or download from the GitHub release —
# see README "Offline Pre-computation").
FROM python:3.11-slim

WORKDIR /app

# Belt-and-braces: rank.py also sets these, but enforce zero-network here too.
ENV HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    PYTHONUNBUFFERED=1

# Install pipeline-only dependencies (no web stack).
# torch comes from the CPU-only wheel index first: the default Linux wheel
# drags in ~7 GB of CUDA libraries the CPU-only ranker never uses (and the
# resulting layer crashed Docker Desktop's VM during snapshotting).
COPY requirements-pipeline.txt .
RUN pip install --no-cache-dir torch==2.12.0 --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements-pipeline.txt

# Copy project — rank time needs only code, artifacts, cached models,
# and the validator script. data/ and docs/ are offline-phase inputs.
COPY pipeline/ ./pipeline/
COPY precomputed/ ./precomputed/
COPY models/ ./models/
COPY submission/validate_submission.py ./submission/validate_submission.py

# Default command — the exact reproduce command
CMD ["python", "pipeline/rank.py", \
     "--precomputed", "precomputed/", \
     "--out", "submission/submission.csv"]
