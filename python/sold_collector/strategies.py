"""The two Instagram collection strategies, and their different guarantees.

`hashtag_recent` and `keyword_serp` are NOT interchangeable, and the difference
is the single most important thing to understand about this collector:

- hashtag_recent walks `tags/{tag}/sections/` with the recency filter. Results
  are approximately reverse-chronological, so once posts fall before the start
  date we can stop and claim reasonable coverage of the window.

- keyword_serp walks `fbsearch/top_serp/`, which is algorithmically ranked.
  Page 5 may be older *or* newer than page 2, so there is no valid stopping
  condition and no coverage guarantee. It gets a fixed budget and a client-side
  date filter, and reports `budget_exhausted` — never `date_cutoff` — so nobody
  downstream mistakes it for exhaustive.

Both report a termination reason. Without it, a quiet week and a truncated
crawl produce identical numbers.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Iterator

from instagrapi.exceptions import (
    ChallengeRequired,
    ClientError,
    LoginRequired,
    PleaseWaitFewMinutes,
)

from .emit import emit, log
from .normalize import normalize
from .session import RateLimited, SessionExpired, jittered

# How many consecutive out-of-range posts before we believe the chronological
# ordering has genuinely passed our start date. Instagram's "recent" ordering
# is approximate, so a single old post pinned high must not end the crawl.
OUT_OF_RANGE_TOLERANCE = 12


def _as_utc(value: Any) -> datetime | None:
    if not isinstance(value, datetime):
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def _classify(taken_at: Any, since: datetime, until: datetime) -> str:
    """'in_range' | 'too_new' | 'too_old' | 'unknown'"""
    stamp = _as_utc(taken_at)
    if stamp is None:
        return "unknown"
    if stamp < since:
        return "too_old"
    if stamp > until:
        return "too_new"
    return "in_range"


def _handle_client_error(exc: Exception) -> None:
    if isinstance(exc, (LoginRequired, ChallengeRequired)):
        raise SessionExpired(str(exc)) from exc
    if isinstance(exc, PleaseWaitFewMinutes):
        raise RateLimited(str(exc)) from exc


def collect_hashtag(
    client: Any,
    term: str,
    since: datetime,
    until: datetime,
    max_pages: int,
    max_posts: int,
    delay_range: tuple[float, float],
) -> Iterator[dict[str, Any]]:
    """Chronological-ish surface. Can honour a date cutoff."""
    strategy = "hashtag_recent"
    seen = in_range = pages = 0
    consecutive_old = 0
    max_id: str | None = None
    reason = "source_exhausted"
    error: str | None = None

    while pages < max_pages and in_range < max_posts:
        try:
            medias, max_id = client.hashtag_medias_v1_chunk(
                term, max_amount=0, tab_key="recent", max_id=max_id
            )
        except (LoginRequired, ChallengeRequired, PleaseWaitFewMinutes) as exc:
            _handle_client_error(exc)
        except ClientError as exc:
            error, reason = str(exc), "error"
            break
        except Exception as exc:  # noqa: BLE001
            error, reason = f"{type(exc).__name__}: {exc}", "error"
            break

        pages += 1
        if not medias:
            reason = "source_exhausted"
            break

        for media in medias:
            seen += 1
            bucket = _classify(getattr(media, "taken_at", None), since, until)
            if bucket == "too_old":
                consecutive_old += 1
                continue
            consecutive_old = 0
            if bucket == "too_new":
                continue
            in_range += 1
            yield {
                "type": "post",
                "post": normalize(media, source_term=term, source_strategy=strategy),
            }
            if in_range >= max_posts:
                break

        if consecutive_old >= OUT_OF_RANGE_TOLERANCE:
            reason = "date_cutoff"
            break
        if not max_id:
            reason = "source_exhausted"
            break
        if in_range >= max_posts:
            reason = "budget_exhausted"
            break
        time.sleep(jittered(delay_range))
    else:
        reason = "budget_exhausted"

    emit(
        {
            "type": "term_complete",
            "kind": "hashtag",
            "term": term,
            "strategy": strategy,
            "postsSeen": seen,
            "postsInRange": in_range,
            "pagesFetched": pages,
            "terminationReason": reason,
            **({"error": error} if error else {}),
        }
    )


def collect_keyword(
    client: Any,
    term: str,
    since: datetime,
    until: datetime,
    max_pages: int,
    max_posts: int,
    delay_range: tuple[float, float],
) -> Iterator[dict[str, Any]]:
    """Ranked surface. Best-effort within a fixed budget; never exhaustive."""
    from instagrapi.extractors import extract_media_v1

    strategy = "keyword_serp"
    seen = in_range = pages = 0
    next_max_id = reels_max_id = rank_token = None
    reason = "source_exhausted"
    error: str | None = None

    while pages < max_pages and in_range < max_posts:
        kwargs: dict[str, str] = {}
        if next_max_id:
            kwargs["next_max_id"] = next_max_id
        if reels_max_id:
            kwargs["reels_max_id"] = reels_max_id
        if rank_token:
            kwargs["rank_token"] = rank_token

        try:
            result = client.fbsearch_topsearch_v2(term, **kwargs)
        except (LoginRequired, ChallengeRequired, PleaseWaitFewMinutes) as exc:
            _handle_client_error(exc)
        except Exception as exc:  # noqa: BLE001
            error, reason = f"{type(exc).__name__}: {exc}", "error"
            break

        pages += 1
        grid = result.get("media_grid") or {}
        nodes = list(client._fbsearch_media_grid_nodes(grid))
        if not nodes:
            reason = "source_exhausted"
            break

        for node in nodes:
            seen += 1
            try:
                media = extract_media_v1(node)
            except (KeyError, AttributeError, TypeError):
                continue
            if _classify(getattr(media, "taken_at", None), since, until) != "in_range":
                continue
            in_range += 1
            yield {
                "type": "post",
                "post": normalize(media, source_term=term, source_strategy=strategy),
            }
            if in_range >= max_posts:
                break

        next_max_id = grid.get("next_max_id") or result.get("next_max_id")
        if not grid.get("has_more") or not next_max_id:
            reason = "source_exhausted"
            break
        reels_max_id = grid.get("reels_max_id") or result.get("reels_max_id")
        rank_token = grid.get("rank_token") or result.get("rank_token")
        if in_range >= max_posts:
            reason = "budget_exhausted"
            break
        time.sleep(jittered(delay_range))
    else:
        reason = "budget_exhausted"

    if reason == "date_cutoff":  # defensive: ranked results cannot justify this
        reason = "budget_exhausted"

    emit(
        {
            "type": "term_complete",
            "kind": "keyword",
            "term": term,
            "strategy": strategy,
            "postsSeen": seen,
            "postsInRange": in_range,
            "pagesFetched": pages,
            "terminationReason": reason,
            **({"error": error} if error else {}),
        }
    )
