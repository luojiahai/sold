"""Authenticated client for Instagram's **web** private API.

Why not instagrapi's client: instagrapi speaks to `i.instagram.com`, the private
*mobile* API, which does not accept a browser `sessionid` — it wants the bearer
token a real app login issues. Worse, hitting it with a fabricated device
fingerprint is itself a security signal, and Instagram responds by invalidating
the web session you authenticated with. The first burner session this project
tested died exactly that way.

The web API (`www.instagram.com/api/v1/...`) is what browser cookies actually
authenticate against, and it is the surface gallery-dl has kept working for
years. This client mirrors its request signature.

instagrapi remains a dependency for `extract_media_v1`: the media payloads on
this surface have the same shape, so normalisation is still worth reusing even
though the transport is not.
"""

from __future__ import annotations

import secrets
import urllib.parse
from typing import Any

import requests

from .emit import log

BASE = "https://www.instagram.com"

# The web app's public application id, and the ASBD id that accompanies it.
# Stable for years; both gallery-dl and the site itself send these.
IG_APP_ID = "936619743392459"
ASBD_ID = "129477"

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)


class SessionExpired(Exception):
    """Credentials are dead — abort rather than limping on."""


class RateLimited(Exception):
    """Instagram asked us to back off."""


class WebClient:
    def __init__(self, session_id: str, cookies: dict[str, str] | None = None):
        cookies = dict(cookies or {})
        self.csrf_token = cookies.get("csrftoken") or secrets.token_hex(16)
        self.www_claim = "0"

        # The sessionid is "<user_id>:<token>:..." URL-encoded. Instagram expects
        # a matching `ds_user_id` cookie, and when it is missing it answers the
        # first request with a redirect *to the same URL* whose only purpose is
        # to set that cookie. Deriving it up front skips the extra round trip.
        self.user_id = cookies.get("ds_user_id") or ""
        if not self.user_id:
            decoded = urllib.parse.unquote(session_id)
            head = decoded.split(":", 1)[0]
            if head.isdigit():
                self.user_id = head

        self.http = requests.Session()
        self.http.cookies.set("sessionid", session_id, domain=".instagram.com")
        self.http.cookies.set("csrftoken", self.csrf_token, domain=".instagram.com")
        if self.user_id:
            self.http.cookies.set("ds_user_id", self.user_id, domain=".instagram.com")
        for name, value in cookies.items():
            if name and value and name not in ("sessionid", "csrftoken", "ds_user_id"):
                self.http.cookies.set(name, value, domain=".instagram.com")

        self.http.headers.update(
            {
                "User-Agent": UA,
                "Accept": "*/*",
                "Accept-Language": "en-AU,en;q=0.9",
                "X-IG-App-ID": IG_APP_ID,
                "X-ASBD-ID": ASBD_ID,
                "X-Requested-With": "XMLHttpRequest",
                "Referer": f"{BASE}/",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin",
            }
        )

    def _headers(self) -> dict[str, str]:
        return {"X-CSRFToken": self.csrf_token, "X-IG-WWW-Claim": self.www_claim}

    def request(
        self,
        path: str,
        *,
        method: str = "GET",
        params: dict[str, Any] | None = None,
        data: dict[str, Any] | None = None,
        timeout: int = 30,
    ) -> dict[str, Any]:
        response = self.http.request(
            method,
            f"{BASE}{path}",
            params=params,
            data=data,
            headers=self._headers(),
            allow_redirects=True,
            timeout=timeout,
        )

        # Judge liveness by where we ended up, not by whether a redirect
        # happened. Instagram uses same-URL redirects to prime cookies, and
        # treating those as fatal kills a perfectly good session. Only the login
        # and challenge pages mean the credentials are actually gone.
        final = response.url
        if "/accounts/login" in final:
            raise SessionExpired(
                "Instagram redirected to the login page — the session cookie is no "
                "longer valid. Log in again in the browser and paste fresh cookies."
            )
        if "/challenge" in final:
            raise SessionExpired(
                "Instagram redirected to a challenge — the account must be verified "
                "in the browser before it can be used again."
            )

        if response.status_code == 429:
            raise RateLimited("Instagram returned 429 Too Many Requests.")
        if response.status_code == 401:
            raise SessionExpired("Instagram returned 401 Unauthorized.")
        if response.status_code == 403:
            raise SessionExpired(
                "Instagram returned 403 Forbidden — the session is not authorised "
                "for this endpoint."
            )

        # Refresh the rolling anti-abuse claim and CSRF token when offered.
        claim = response.headers.get("x-ig-set-www-claim")
        if claim:
            self.www_claim = claim
        refreshed = response.cookies.get("csrftoken")
        if refreshed:
            self.csrf_token = refreshed

        response.raise_for_status()

        try:
            return response.json()
        except ValueError as exc:
            raise SessionExpired(
                f"expected JSON from {path}, got {response.headers.get('content-type')} "
                f"— usually means an HTML login page"
            ) from exc

    def preflight(self) -> dict[str, Any]:
        """
        Cheap, genuinely auth-gated call.

        Endpoint choice matters here: `users/web_profile_info/` answers 200 for
        an unauthenticated caller, so using it would pass preflight on a dead
        session — worse than having no check at all. `accounts/edit/web_form_data/`
        redirects to the login page without a live session, and returns the
        viewer's own handle when there is one.
        """
        data = self.request("/api/v1/accounts/edit/web_form_data/")
        form = (data or {}).get("form_data") or {}
        username = form.get("username")
        if not username:
            raise SessionExpired(
                "Authenticated endpoint returned no account — session rejected."
            )
        return {"username": username, "user_id": self.http.cookies.get("ds_user_id") or ""}
