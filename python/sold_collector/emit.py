"""NDJSON event emission.

One JSON object per line on stdout. Anything the sidecar wants to say to Node
goes through here, so stdout stays machine-parseable even when instagrapi's own
logging is chattering on stderr.
"""

from __future__ import annotations

import json
import sys
from typing import Any


def emit(event: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(event, default=str, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def log(message: str, level: str = "info") -> None:
    emit({"type": "log", "level": level, "message": message})


def fatal(message: str, kind: str = "error") -> None:
    """`kind` is 'session_expired' when credentials are dead, else 'error'."""
    emit({"type": kind, "message": message})
    sys.stdout.flush()
