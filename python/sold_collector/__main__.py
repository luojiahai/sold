"""CLI entrypoint.

Reads a JSON request on stdin, streams NDJSON events on stdout. stdin rather
than argv because seed term lists get long and credentials should not appear in
the process table.

Modes:
  preflight  -- validate credentials, emit one result event, exit
  collect    -- run the requested strategies over the requested terms
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, time as dtime, timezone

from .emit import emit, fatal, log
from .session import RateLimited, SessionExpired, build_client, preflight
from .strategies import collect_hashtag, collect_keyword

# instagrapi logs to stderr; keep stdout clean for NDJSON.
logging.basicConfig(stream=sys.stderr, level=logging.WARNING)

STRATEGIES = {"hashtag_recent": collect_hashtag, "keyword_serp": collect_keyword}
KIND_FOR_STRATEGY = {"hashtag_recent": "hashtag", "keyword_serp": "keyword"}


def _bounds(since: str, until: str) -> tuple[datetime, datetime]:
    start = datetime.combine(
        datetime.fromisoformat(since).date(), dtime.min, tzinfo=timezone.utc
    )
    end = datetime.combine(
        datetime.fromisoformat(until).date(), dtime.max, tzinfo=timezone.utc
    )
    return start, end


def main() -> int:
    try:
        request = json.loads(sys.stdin.read())
    except json.JSONDecodeError as exc:
        fatal(f"malformed request on stdin: {exc}")
        return 2

    mode = request.get("mode", "collect")
    delay_range = tuple(request.get("delayRange") or (3.0, 8.0))

    try:
        client = build_client(
            session_id=request["sessionId"],
            cookies=request.get("cookies"),
            settings_path=request.get("settingsPath"),
            delay_range=delay_range,
        )
    except SessionExpired as exc:
        fatal(str(exc), kind="session_expired")
        return 3
    except RateLimited as exc:
        fatal(f"rate limited during login: {exc}")
        return 4

    if mode == "preflight":
        try:
            emit({"type": "preflight", "ok": True, **preflight(client)})
        except SessionExpired as exc:
            fatal(str(exc), kind="session_expired")
            return 3
        return 0

    since, until = _bounds(request["since"], request["until"])
    max_pages = int(request.get("maxPagesPerTerm", 5))
    max_posts = int(request.get("maxPostsPerTerm", 200))
    enabled = request.get("strategies") or list(STRATEGIES)

    for entry in request.get("terms", []):
        kind, term = entry.get("kind"), entry.get("term")
        strategy = next(
            (s for s in enabled if KIND_FOR_STRATEGY.get(s) == kind), None
        )
        if not strategy:
            continue

        log(f"[{strategy}] {term}")
        try:
            for event in STRATEGIES[strategy](
                client, term, since, until, max_pages, max_posts, delay_range
            ):
                emit(event)
        except SessionExpired as exc:
            fatal(str(exc), kind="session_expired")
            return 3
        except RateLimited as exc:
            # Back off from the whole run, not just this term: pressing on after
            # a throttle is how a burner session becomes a challenged one.
            fatal(f"rate limited on '{term}': {exc}")
            return 4

    emit({"type": "done"})
    return 0


if __name__ == "__main__":
    sys.exit(main())
