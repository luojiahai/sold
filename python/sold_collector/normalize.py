"""Maps instagrapi's Media model onto SOLD's platform-agnostic post shape.

This is the seam that makes the Collector interface meaningful: every field the
rest of the system sees is produced here, so a future X or TikTok collector has
an explicit contract to satisfy rather than a vague convention.
"""

from __future__ import annotations

import re
from typing import Any

HASHTAG_RE = re.compile(r"#([A-Za-z0-9_]+)")
MENTION_RE = re.compile(r"@([A-Za-z0-9_.]+)")

# instagrapi's media_type/product_type encoding
_MEDIA_TYPES = {1: "image", 2: "video", 8: "carousel"}


def _media_type(media: Any) -> str:
    return _MEDIA_TYPES.get(getattr(media, "media_type", None), "unknown")


def _thumbnail_url(media: Any) -> str | None:
    thumb = getattr(media, "thumbnail_url", None)
    if thumb:
        return str(thumb)
    # Carousels carry their cover image on the first resource instead.
    for resource in getattr(media, "resources", None) or []:
        candidate = getattr(resource, "thumbnail_url", None)
        if candidate:
            return str(candidate)
    return None


def normalize(media: Any, *, source_term: str, source_strategy: str) -> dict[str, Any]:
    caption = getattr(media, "caption_text", None) or ""
    user = getattr(media, "user", None)
    location = getattr(media, "location", None)
    taken_at = getattr(media, "taken_at", None)
    code = getattr(media, "code", None)

    # Usertags are structured mentions; caption @handles are the rest.
    tagged = []
    for tag in getattr(media, "usertags", None) or []:
        tagged_user = getattr(tag, "user", None)
        username = getattr(tagged_user, "username", None)
        if username:
            tagged.append(username)

    mentions = sorted({*tagged, *MENTION_RE.findall(caption)})

    return {
        "platform": "instagram",
        "platformPostId": str(getattr(media, "pk", "") or getattr(media, "id", "")),
        "url": f"https://www.instagram.com/p/{code}/" if code else "",
        "authorHandle": getattr(user, "username", None) if user else None,
        "authorName": getattr(user, "full_name", None) if user else None,
        "text": caption,
        "postedAt": taken_at.isoformat() if taken_at else None,
        "mediaType": _media_type(media),
        "thumbnailUrl": _thumbnail_url(media),
        "likeCount": getattr(media, "like_count", None),
        "commentCount": getattr(media, "comment_count", None),
        "hashtags": sorted({h.lower() for h in HASHTAG_RE.findall(caption)}),
        "mentions": mentions,
        "locationName": getattr(location, "name", None) if location else None,
        "raw": media.model_dump(mode="json") if hasattr(media, "model_dump") else None,
        "sourceTerm": source_term,
        "sourceStrategy": source_strategy,
    }
