# Audit Report — PDF & Media Studio v1.1.0

**Date:** 2026-10-30 · **Branch:** `feature/ui-redesign-and-release` · **Verifier:** takeover audit + this release cycle
**Companion document:** [TAKEOVER_REPORT.md](TAKEOVER_REPORT.md) (claim-by-claim verification of the previous agent's handover)

---

## 1. Existing work verified (preserved, not rewritten)

- **PDF pipeline** (merge, images→PDF, organize, split, compress, extract-images, to-images):
  correct, validated outputs, tested end-to-end through the API.
- **Media pipeline**: yt-dlp subprocess with machine-readable progress templates,
  format whitelists, `.part` cleanup, cookie-log redaction, custom-path detection.
- **Cookie parser**: Netscape + header conversion, `#HttpOnly_` handling, malformed
  rejection, masked API (no values ever echoed).
- **Task manager**: queue + semaphore, cooperative/media cancellation, output
  validation, progress clamping, bounded history.
- **Upload/path safety**: content sniffing, containment checks, safe ids/filenames.

## 2. Handover claims vs reality (summary)

The previous agent's handover claimed substantial work that **did not exist in the
code** (verified with file:line evidence — see TAKEOVER_REPORT.md §5): the entire
security middleware suite, atomic config/history/sidecar writes, config boolean
validation, hash routing, breadcrumbs, reduced-motion, skip link, keyboard
reordering, shared API timeouts, output-name plumbing, the Vite 8 upgrade and the
"83 passing tests" (real baseline: 64). The take-over therefore treated *code* as
the baseline and implemented the missing pieces rather than re-doing what existed.

## 3. Work completed in this cycle

### Security (commit `e228433`, plus trimming in `3ea901b`)
- **CSRF guard**: Origin allowlist (own origin + Vite dev origins) +
  `Sec-Fetch-Site: cross-site` rejection for Origin-less cross-site GETs;
  non-browser clients unaffected.
- **DNS-rebinding / Host guard**: public-IP `Host` headers rejected; loopback,
  private IPs and LAN hostnames keep working.
- **Headers**: CSP (`script-src 'self'`), X-Frame-Options DENY, XCTO nosniff,
  Referrer-Policy, Permissions-Policy, COOP; relaxed script policy for Swagger UI.
- **CORS**: methods/headers narrowed from `*` to the real API surface.
- **Public API allowlist**: `/api/settings` and `/api/system/info` no longer
  expose `data_dir`, cookie preferences or the raw config blob.
- **LAN exposure**: opt-in via Settings → Network (host select + port) with
  restart-required labels, UI warning and startup log/banner warnings.

### Reliability (commit `3ea901b`)
- Atomic writes for config (with write-before-commit rollback), task history,
  upload sidecars and thumbnail cache (tmp + `os.replace`).
- Strict config booleans (`"yes"`, `1` → 400; `"true"/"false"` coerced);
  cookie_source/cookie_browser validated on load; invalid booleans fall back
  with a warning instead of `bool("false") == True`.
- Windows **process-tree termination** (`taskkill /T /F`) on cancel and shutdown —
  yt-dlp's ffmpeg children no longer survive; `shutdown()` awaits workers.
- Thumbnail rendering moved off the event loop (`asyncio.to_thread`).
- `DELETE /api/files/{id}` → 409 while a queued/running task holds the file
  (all 7 PDF ops record `meta.file_ids`); file listing skips lost content;
  >24 uploads → explicit 413.
- Cookie paste robustness: leading `Cookie:` prefix accepted, folded headers
  unfolded, one-pair-per-line joined; cookie-file writes serialized by a lock.
- Compress fallback made honest: when recompression cannot shrink the file, the
  untouched original is delivered and the larger rewrite is deleted.
- Media audio mode drops video-only fields server-side; the UI resets
  video-specific state on mode switch and sends mode-appropriate payloads only.

### UI/UX redesign (commits `5848306`, `520b603`, `1bfac33`, `d407d23`)
- **Phosphor terminal design system** (user-selected direction): dark-first
  carbon palette with near-neutral neutrals, phosphor-green accent, cyan info;
  Cascadia Mono identity on controls/labels/data, sans prose; semantic color
  tokens for both themes (no per-component `dark:` duplication; CSS bundle -20%).
- **Hash routing** with deep links and back/forward; PDF Tools landing page with
  categorized tools; collapsible sidebar; breadcrumb paths; grouped Settings
  (incl. previously-missing network controls); progressive disclosure for media
  advanced options; shared ToolCard/OptionCard components; skip link, global
  focus-visible rings, `prefers-reduced-motion` guard, `aria-current` fixes.

## 4. Test results

| Check | Result |
|---|---|
| Backend suite (pytest, Python 3.13.3, Windows) | **82 passed** / 0 failed / 0 skipped (13.2 s) |
| `pip check` | clean |
| `tsc --noEmit` + `vite build` | pass |
| Live security smoke (curl against running server) | evil Origin → 403; same-origin → route reached; cross-site GET → 403; all headers present |
| Browser verification | Dashboard/Settings/Media/PDF-landing/tool pages in both themes; zero CSP violations; deep-link + back-button verified |
| Media/FFmpeg tests | executed live (FFmpeg present); no external websites required by the suite |

## 5. Security findings & residual risks (honest)

1. **SSRF re-validation gap (documented residual)**: URLs are validated before
   yt-dlp runs (scheme, credentials, private-IP resolution). Redirects and DNS
   changes inside yt-dlp's own network stack are not re-validated. Mitigation
   context: yt-dlp only fetches media streams; a full fix would require proxying
   all traffic through the app. Not exploitable to *read* internal HTTP responses.
2. **Local network exposure is opt-in but real**: with `host: 0.0.0.0`, any LAN
   device reaches the API. The CSRF/Origin guard blocks *browser-based* cross-site
   attacks from the internet, but direct local access is inherently trusted.
   Default remains loopback-only.
3. **Cookies are plaintext** (`data/cookies.txt`, yt-dlp's required format).
   Best-effort permissions; never logged or echoed; one-click clearing. Windows
   Credential Manager was considered and deferred (would break the file-based
   yt-dlp workflow and import compatibility).
4. **Swagger UI** (`/api/docs`) ships inline bootstrap JSON → relaxed CSP for
   that page only; it exposes no sensitive data (no auth model in a local app).

## 6. Known limitations (product-level)

Inherited and documented in README: DRM never supported, private/members-only
media requires your own sign-in, image extraction is raster-only, compression
targets raster images, playlists limited to first entry, no OCR/annotations.

## 7. Recommended future improvements

- Python-side proxy for yt-dlp network traffic (closes the SSRF residual).
- Consider Windows Credential Manager / DPAPI for cookie at-rest protection.
- Keyboard-accessible page reordering (drag-and-drop currently mouse-only).
- Frontend type-safe API payloads (replace `Record<string, any>` op payloads).
- Optional Vite 6/7 upgrade (current: 5.4 — stable, zero known vulns).

## 8. Versioning

- Backend `__version__`: **1.1.0** · frontend `package.json`: **1.1.0** (synced)
- Release checklist: see PUBLISHING.md; push only with explicit owner approval.
