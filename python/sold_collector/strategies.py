"""The two Instagram collection strategies, and their different guarantees.

`hashtag_recent` and `keyword_serp` are NOT interchangeable, and the difference
is the most important thing to understand about this collector:

- hashtag_recent walks `/api/v1/tags/{tag}/sections/` with the recency tab.
  Results are approximately reverse-chronological, so once posts fall before the
  start date we can stop and claim reasonable coverage of the window.

- keyword_serp walks `/api/v1/fbsearch/web/top_serp/`, which is algorithmically
  ranked. Page 5 may be older *or* newer than page 2, so there is no valid
  stopping condition and no coverage guarantee. It gets a fixed budget and a
  client-side date filter, and reports `budget_exhausted` — never `date_cutoff`
  — so nobody downstream mistakes it for exhaustive.

Both report a termination reason. Without it, a quiet week and a truncated crawl
produce identical numbers.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Iterator

from instagrapi.extractors import extract_media_v1

from .emit import emit
from .normalize import normalize
from .session import jittered
from .web_client import RateLimited, SessionExpired, WebClient

# How many consecutive out-of-range posts before we believe the ordering has
# genuinely passed our start date. The recency surface is approximate, so a
# single old post pinned high must not end the crawl.
OUT_OF_RANGE_TOLERANCE = 12


def _as_utc(value: Any) -> datetime | None:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc)
    if isinstance(value, datetime):
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
    return None


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


def _medias_from_sections(sections: list[dict[str, Any]]) -> Iterator[dict[str, Any]]:
    """Both surfaces nest media the same way: sections → layout_content → medias."""
    for section in sections or []:
        content = section.get("layout_content") or {}
        entries = (
            content.get("medias")
            or content.get("one_by_two_item", {}).get("clips", {}).get("items")
            or content.get("fill_items")
            or []
        )
        for entry in entries:
            media = entry.get("media") if isinstance(entry, dict) else None
            if media:
                yield media


def _emit_term(
    kind: str,
    term: str,
    strategy: str,
    seen: int,
    in_range: int,
    pages: int,
    reason: str,
    error: str | None,
) -> None:
    emit(
        {
            "type": "term_complete",
            "kind": kind,
            "term": term,
            "strategy": strategy,
            "postsSeen": seen,
            "postsInRange": in_range,
            "pagesFetched": pages,
            "terminationReason": reason,
            **({"error": error} if error else {}),
        }
    )


def collect_hashtag(
    client: WebClient,
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
    page_token: Any = None
    reason = "source_exhausted"
    error: str | None = None

    while pages < max_pages and in_range < max_posts:
        payload: dict[str, Any] = {
            "include_persistent": "0",
            "surface": "grid",
            "tab": "recent",
        }
        if max_id:
            payload["max_id"] = max_id
        if page_token is not None:
            payload["page"] = page_token

        try:
            result = client.request(
                f"/api/v1/tags/{term}/sections/", method="POST", data=payload
            )
        except (SessionExpired, RateLimited):
            raise
        except Exception as exc:  # noqa: BLE001
            error, reason = f"{type(exc).__name__}: {exc}", "error"
            break

        pages += 1
        medias = list(_medias_from_sections(result.get("sections") or []))
        if not medias:
            reason = "source_exhausted"
            break

        for media in medias:
            seen += 1
            bucket = _classify(media.get("taken_at"), since, until)
            if bucket == "too_old":
                consecutive_old += 1
                continue
            consecutive_old = 0
            if bucket == "too_new":
                continue
            try:
                parsed = extract_media_v1(media)
            except (KeyError, AttributeError, TypeError):
                continue
            in_range += 1
            yield {
                "type": "post",
                "post": normalize(parsed, source_term=term, source_strategy=strategy),
            }
            if in_range >= max_posts:
                break

        if consecutive_old >= OUT_OF_RANGE_TOLERANCE:
            reason = "date_cutoff"
            break
        if not result.get("more_available"):
            reason = "source_exhausted"
            break
        max_id = result.get("next_max_id")
        page_token = result.get("next_page")
        if not max_id:
            reason = "source_exhausted"
            break
        if in_range >= max_posts:
            reason = "budget_exhausted"
            break
        time.sleep(jittered(delay_range))
    else:
        reason = "budget_exhausted"

    _emit_term("hashtag", term, strategy, seen, in_range, pages, reason, error)


def collect_keyword(
    client: WebClient,
    term: str,
    since: datetime,
    until: datetime,
    max_pages: int,
    max_posts: int,
    delay_range: tuple[float, float],
) -> Iterator[dict[str, Any]]:
    """Ranked surface. Best-effort within a fixed budget; never exhaustive."""
    strategy = "keyword_serp"
    seen = in_range = pages = 0
    next_max_id: str | None = None
    reason = "source_exhausted"
    error: str | None = None

    while pages < max_pages and in_range < max_posts:
        params: dict[str, Any] = {"query": term, "enable_metadata": "true"}
        if next_max_id:
            params["next_max_id"] = next_max_id

        try:
            result = client.request("/api/v1/fbsearch/web/top_serp/", params=params)
        except (SessionExpired, RateLimited):
            raise
        except Exception as exc:  # noqa: BLE001
            error, reason = f"{type(exc).__name__}: {exc}", "error"
            break

        pages += 1
        grid = result.get("media_grid") or {}
        medias = list(_medias_from_sections(grid.get("sections") or []))
        if not medias:
            reason = "source_exhausted"
            break

        for media in medias:
            seen += 1
            if _classify(media.get("taken_at"), since, until) != "in_range":
                continue
            try:
                parsed = extract_media_v1(media)
            except (KeyError, AttributeError, TypeError):
                continue
            in_range += 1
            yield {
                "type": "post",
                "post": normalize(parsed, source_term=term, source_strategy=strategy),
            }
            if in_range >= max_posts:
                break

        next_max_id = grid.get("next_max_id") or result.get("next_max_id")
        if not grid.get("has_more") or not next_max_id:
            reason = "source_exhausted"
            break
        if in_range >= max_posts:
            reason = "budget_exhausted"
            break
        time.sleep(jittered(delay_range))
    else:
        reason = "budget_exhausted"

    # Ranked results can never justify a date-cutoff claim.
    if reason == "date_cutoff":
        reason = "budget_exhausted"

    _emit_term("keyword", term, strategy, seen, in_range, pages, reason, error)
