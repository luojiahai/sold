"""Session construction and pacing.

Deliberately thin now that the transport is the web API: there is no device to
emulate and no login flow to perform, because browser cookies *are* the
credential. The one job left is to build the client and let dead credentials
fail loudly and immediately — a run that dies at post 400 of 2000 with an opaque
redirect is the worst debugging experience the system can offer.
"""

from __future__ import annotations

import random
from typing import Any

from .web_client import RateLimited, SessionExpired, WebClient

__all__ = ["RateLimited", "SessionExpired", "build_client", "preflight", "jittered"]


def build_client(
    session_id: str,
    cookies: dict[str, str] | None,
    settings_path: str | None,  # retained for interface stability; unused
    delay_range: tuple[float, float],
) -> WebClient:
    return WebClient(session_id, cookies)


def preflight(client: WebClient) -> dict[str, Any]:
    return client.preflight()


def jittered(delay_range: tuple[float, float]) -> float:
    low, high = delay_range
    return random.uniform(float(low), float(high))
