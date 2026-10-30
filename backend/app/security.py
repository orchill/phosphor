"""Input validation and path containment helpers (security layer).

Everything the client can influence passes through here:
page selections, rotation values, output paths and media URLs.

Also hosts the ASGI request-security middleware (Origin / Sec-Fetch-Site /
Host validation and security headers) that protects the API from cross-site
requests (CSRF) and adds baseline browser hardening headers.
"""
from __future__ import annotations

import ipaddress
import json
import re
import socket
from pathlib import Path
from urllib.parse import urlparse

from starlette.types import ASGIApp, Receive, Scope, Send

_RANGE_RE = re.compile(r"^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$")


class ValidationError(ValueError):
    """Raised for any rejected user input -> HTTP 400."""


# ------------------------------------------------------------------ paths
def ensure_within(path: Path, base: Path, what: str = "path") -> Path:
    """Resolve `path` and guarantee it lives inside `base` (no traversal)."""
    base = base.resolve()
    resolved = path.resolve()
    if resolved != base and base not in resolved.parents:
        raise ValidationError(
            f"{what} is outside the permitted directory (path traversal blocked)")
    return resolved


# ---------------------------------------------------------- page selections
def _clamp(v: int, max_page: int, what: str) -> int:
    if v < 1 or v > max_page:
        raise ValidationError(f"Page {what} {v} is out of range (document has {max_page} pages)")
    return v


def parse_pages(spec: str | list | None, max_page: int) -> list[int]:
    """Parse '1-3,5' / [1,2,3] into a sorted, de-duplicated 1-based page list."""
    if spec is None or (isinstance(spec, str) and not spec.strip()):
        return list(range(1, max_page + 1))
    tokens: list[str]
    if isinstance(spec, str):
        tokens = [t for t in re.split(r"[,\s]+", spec.strip()) if t]
    elif isinstance(spec, list):
        tokens = [str(t) for t in spec if str(t).strip()]
    else:
        raise ValidationError("Invalid page selection")
    pages: set[int] = set()
    for tok in tokens:
        m = _RANGE_RE.match(tok)
        if not m:
            raise ValidationError(f"Invalid page token: '{tok}' (expected e.g. 1-3 or 5)")
        a = _clamp(int(m.group(1)), max_page, "number")
        b = _clamp(int(m.group(2)) if m.group(2) else a, max_page, "number")
        if b < a:
            a, b = b, a
        pages.update(range(a, b + 1))
    if not pages:
        raise ValidationError("Page selection is empty")
    return sorted(pages)


def parse_page_groups(spec: str, max_page: int) -> list[tuple[int, int]]:
    """Parse '1-3,5,8-10' into ordered (start, end) groups. Empty -> error."""
    if not spec or not str(spec).strip():
        raise ValidationError("Page ranges are empty")
    groups: list[tuple[int, int]] = []
    for tok in [t for t in re.split(r"[,\s]+", str(spec).strip()) if t]:
        m = _RANGE_RE.match(tok)
        if not m:
            raise ValidationError(f"Invalid range token: '{tok}' (expected e.g. 1-3 or 5)")
        a = _clamp(int(m.group(1)), max_page, "number")
        b = _clamp(int(m.group(2)) if m.group(2) else a, max_page, "number")
        if b < a:
            a, b = b, a
        groups.append((a, b))
    if not groups:
        raise ValidationError("Page ranges are empty")
    return groups


def validate_order(order: list, max_page: int) -> list[int]:
    """Validate a full page ordering (used by the Organize tool)."""
    if not isinstance(order, list) or not order:
        raise ValidationError("Page order is empty")
    seen: set[int] = set()
    result: list[int] = []
    for item in order:
        try:
            page = int(item)
        except (TypeError, ValueError):
            raise ValidationError(f"Invalid page in order: {item!r}")
        _clamp(page, max_page, "number")
        if page in seen:
            raise ValidationError(f"Page {page} appears more than once")
        seen.add(page)
        result.append(page)
    return result


def validate_rotation(deg: int) -> int:
    if int(deg) not in (0, 90, 180, 270):
        raise ValidationError("Rotation must be one of 0, 90, 180, 270 degrees")
    return int(deg)


# ------------------------------------------------------------------ URLs
def validate_media_url(url: str) -> str:
    """Validate a media URL before handing it to yt-dlp.

    Blocks non-http(s) schemes, embedded credentials, and any host that
    resolves to loopback/private/reserved address space (SSRF protection).
    """
    url = (url or "").strip()
    if not url or len(url) > 2048:
        raise ValidationError("URL is empty or too long")
    if any(ch in url for ch in "\r\n\t"):
        raise ValidationError("URL contains invalid characters")
    try:
        parts = urlparse(url)
    except ValueError:
        raise ValidationError("URL could not be parsed")
    if parts.scheme not in ("http", "https"):
        raise ValidationError("Only http:// and https:// URLs are supported")
    if not parts.hostname:
        raise ValidationError("URL has no hostname")
    if parts.username or parts.password:
        raise ValidationError("URLs with embedded credentials are not allowed")

    host = parts.hostname.lower().rstrip(".")
    if host == "localhost" or host.endswith((".local", ".internal", ".lan", ".home")):
        raise ValidationError("Access to local hostnames is blocked for security reasons")
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise ValidationError(f"Cannot resolve host '{host}' - check the URL and your connection")
    except OSError:
        raise ValidationError(f"Could not look up host '{host}'")
    if not infos:
        raise ValidationError(f"Host '{host}' has no usable addresses")
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            continue
        if not ip.is_global:
            raise ValidationError(
                "Access to private/loopback network addresses is blocked for security reasons")
    return url


# ============================================================ request middleware
# Baseline browser-facing hardening for a localhost app:
#
# 1. Origin guard (CSRF): browsers send Origin on every cross-site and
#    same-site POST/PUT/DELETE. Anything that is not this app's own origin or
#    the Vite dev server cannot invoke state-changing endpoints, and
#    cross-site requests without Origin (form/img GETs) are rejected via
#    Sec-Fetch-Site metadata. Non-browser clients (curl, tests) send neither
#    header and are unaffected.
# 2. Host guard (DNS rebinding): a rebound public domain must not reach the
#    API even when the check above is bypassed by an old browser. Public-IP
#    Host headers (port-forwarding footgun) are rejected too; private IP
#    literals and machine hostnames keep LAN usage working.
# 3. Security headers (CSP etc.) on every response; /api/docs gets a relaxed
#    script policy because Swagger UI ships inline bootstrap JSON.

_DEV_ORIGINS = ("http://localhost:5173", "http://127.0.0.1:5173")

_CSP_APP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; "
            "connect-src 'self'; object-src 'none'; base-uri 'self'; "
            "form-action 'self'; frame-ancestors 'none'")
_CSP_DOCS = ("default-src 'none'; script-src 'self' 'unsafe-inline'; "
             "style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
             "connect-src 'self'; frame-ancestors 'none'")

_SECURITY_HEADERS = (
    ("X-Content-Type-Options", "nosniff"),
    ("X-Frame-Options", "DENY"),
    ("Referrer-Policy", "no-referrer"),
    ("Permissions-Policy", "camera=(), microphone=(), geolocation=(), display-capture=()"),
    ("Cross-Origin-Opener-Policy", "same-origin"),
)


def _origin_allowed(origin: str, host_header: str) -> bool:
    """Same-origin (as addressed by the Host header) or an allowlisted dev origin."""
    if origin in _DEV_ORIGINS:
        return True
    try:
        o = urlparse(origin)
        h = urlparse(f"//{host_header}") if host_header else None
    except ValueError:
        return False
    if not o.hostname or h is None or not h.hostname:
        return False
    o_port = o.port or (443 if o.scheme == "https" else 80)
    h_port = h.port or 80
    return o.hostname == h.hostname and o_port == h_port


def _host_allowed(host_header: str) -> bool:
    """Reject public-IP hosts; allow loopback/private IPs and plain hostnames."""
    try:
        hostname = (urlparse(f"//{host_header}").hostname or "").lower().rstrip(".")
    except ValueError:
        return False
    if not hostname:
        return True  # HTTP/1.0-style missing Host; routes don't need it
    try:
        ip = ipaddress.ip_address(hostname)
    except ValueError:
        return True  # hostname (localhost, machine name, mDNS, ...) - fine locally
    return not ip.is_global  # loopback/private/link-local ok, public IP rejected


class SecurityMiddleware:
    """Pure-ASGI middleware applying the guards described at module top."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        headers = {k.decode("latin-1").lower(): v.decode("latin-1")
                   for k, v in scope.get("headers", [])}
        method = scope.get("method", "GET").upper()
        is_api = path.startswith("/api")

        if is_api and method != "OPTIONS":     # preflights are CORS-middleware territory
            origin = headers.get("origin", "")
            site = headers.get("sec-fetch-site", "")
            host = headers.get("host", "")
            if origin:
                if not _origin_allowed(origin, host):
                    await self._deny(send, "Cross-site requests are blocked "
                                           "(unexpected Origin)")
                    return
            elif site == "cross-site":
                await self._deny(send, "Cross-site requests are blocked "
                                       "(Sec-Fetch-Site: cross-site)")
                return
            if not _host_allowed(host):
                await self._deny(send, "This server is not reachable via that "
                                       "hostname (DNS-rebinding protection)")
                return

        csp = _CSP_DOCS if path.startswith(("/api/docs", "/api/redoc")) else _CSP_APP

        async def send_with_headers(message) -> None:
            if message["type"] == "http.response.start":
                raw = message.setdefault("headers", [])
                existing = {k.lower() for k, _ in raw}
                pairs = [(b"content-security-policy", csp.encode("latin-1"))]
                pairs += [(k.encode("latin-1"), v.encode("latin-1"))
                          for k, v in _SECURITY_HEADERS if k.lower() not in existing]
                raw.extend(pairs)
            await send(message)

        await self.app(scope, receive, send_with_headers)

    @staticmethod
    async def _deny(send: Send, detail: str) -> None:
        body = json.dumps({"detail": detail}).encode("utf-8")
        headers = [(b"content-type", b"application/json; charset=utf-8"),
                   (b"content-length", str(len(body)).encode("latin-1")),
                   (b"content-security-policy", _CSP_APP.encode("latin-1"))]
        headers += [(k.lower().encode("latin-1"), v.encode("latin-1"))
                    for k, v in _SECURITY_HEADERS]
        await send({"type": "http.response.start", "status": 403, "headers": headers})
        await send({"type": "http.response.body", "body": body})
