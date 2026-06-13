"""config_loader.py — loads config.yaml once at import time.

Provides the CONFIG singleton dict. Every pipeline module reads tunables
from here instead of hardcoding them.

Usage::

    from config_loader import CONFIG
    batch_size = CONFIG["pipeline"]["ce_batch_size"]
"""
from __future__ import annotations

from pathlib import Path

import yaml

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.yaml"


def load_config(path: Path | str | None = None) -> dict:
    """Load and return the pipeline configuration from config.yaml."""
    p = Path(path) if path else _CONFIG_PATH
    with open(p, encoding="utf-8") as f:
        return yaml.safe_load(f)


# Module-level singleton — import CONFIG from here
CONFIG = load_config()
