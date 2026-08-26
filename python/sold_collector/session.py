"""Burner session handling.

Two things matter more than anything else here:

1. `load_settings`/`dump_settings` persist the emulated device fingerprint.
   Presenting the same device across runs is a bigger factor in staying
   unchallenged than request pacing is — a fresh device on every run looks
   exactly like the automation it is.
2. Dead credentials must fail loudly and immediately. A run that dies at post
   400 of 2000 with an opaque redirect is the worst debugging experience the
   system can offer, so we surface `session_expired` as its own event type.
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any

from instagrapi import Client
from instagrapi.exceptions import (
    ChallengeRequired,
    LoginRequired,
    PleaseWaitFewMinutes,
)

from .emit import log


class SessionExpired(Exception):
    """Credentials are dead — abort the run rather than limping on."""


class RateLimited(Exception):
    """Instagram asked us to back off."""


def build_client(
    session_id: str,
    cookies: dict[str, str] | None,
    settings_path: str | None,
    delay_range: tuple[float, float],
) -> Client:
    client = Client()
    # instagrapi sleeps a uniform random interval between private requests.
    client.delay_range = [float(delay_range[0]), float(delay_range[1])]

    if settings_path:
        path = Path(settings_path)
        if path.exists():
            try:
                client.load_settings(path)
                log(f"restored device fingerprint from {path.name}")
            except Exception as exc:  # noqa: BLE001 - a corrupt dump must not be fatal
                log(f"could not restore settings ({exc}); using a fresh device", "warn")

    try:
        client.login_by_sessionid(session_id)
    except (LoginRequired, ChallengeRequired) as exc:
        raise SessionExpired(f"sessionid rejected by Instagram: {exc}") from exc
    except PleaseWaitFewMinutes as exc:
        raise RateLimited(str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise SessionExpired(f"login_by_sessionid failed: {exc}") from exc

    for name, value in (cookies or {}).items():
        if name and value:
            client.private.cookies.set(name, value, domain=".instagram.com")

    if settings_path:
        try:
            Path(settings_path).parent.mkdir(parents=True, exist_ok=True)
            client.dump_settings(Path(settings_path))
        except Exception as exc:  # noqa: BLE001
            log(f"could not persist settings: {exc}", "warn")

    return client


def preflight(client: Client) -> dict[str, Any]:
    """Cheap authenticated call, so a doomed run fails in seconds not minutes."""
    try:
        info = client.account_info()
    except (LoginRequired, ChallengeRequired) as exc:
        raise SessionExpired(str(exc)) from exc
    return {
        "username": getattr(info, "username", None),
        "pk": str(getattr(info, "pk", "") or ""),
    }


def jittered(delay_range: tuple[float, float]) -> float:
    low, high = delay_range
    return random.uniform(float(low), float(high))
