# Redrob Ranker — Stage 3 Docker reproduction.
# Build context must contain the precomputed/ artifacts and cached models/
# (regenerate via the offline scripts or download from the GitHub release —
# see README "Offline Pre-computation").
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY pipeline/ ./pipeline/
COPY precomputed/ ./precomputed/
COPY models/ ./models/
COPY data/candidates.jsonl ./data/candidates.jsonl
COPY docs/ ./docs/
COPY submission/ ./submission/

# Default command — the exact reproduce command
CMD ["python", "pipeline/rank.py", \
     "--precomputed", "precomputed/", \
     "--out", "submission/submission.csv"]
