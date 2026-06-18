"""Smoke test: verify pipeline imports and config load without precomputed artifacts."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "pipeline"))

from config_loader import CONFIG  # noqa: E402
from scorer import composite_score  # noqa: E402
from honeypot import is_honeypot  # noqa: E402
from reasoning import generate_reasoning  # noqa: E402

assert CONFIG["scoring"]["w_career"] == 0.30, f"w_career unexpected: {CONFIG['scoring']['w_career']}"
print("Pipeline imports and config: OK")
