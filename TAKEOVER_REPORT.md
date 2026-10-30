# PDF & Media Studio — Takeover Report (Phase 1)

**Date:** 2026-10-30 · **Environment:** Windows, Python 3.13.3, Node (Vite 5.4.21) · **Inspector:** new coding agent (GLM)

---

## 1. Executive summary

The repository contains a **working, coherent v1.0.4 application**: a FastAPI backend
(7 PDF operations, yt-dlp/FFmpeg media pipeline, cookie sign-in, task manager with
history) and a React/TypeScript/Tailwind frontend (11 pages, hash-free state routing,
dark/light themes). **All 64 backend tests pass** in the real Windows environment;
TypeScript checks and the production build pass.

However, **a large portion of the handover document's "previously implemented" claims
(Part 3) do not exist in this codebase.** Verified against actual code with file:line
evidence, the following claimed systems are absent or materially different: strict
config boolean validation, atomic config writes, public/private settings separation,
security middleware (CSP, security headers, Origin/Sec-Fetch-Site/Host validation,
DNS-rebinding checks), process-tree termination, atomic history writes, cookie expiry
detection, `Cookie:`-prefix stripping, header unfolding, frontend hash routing,
breadcrumbs, reduced-motion support, skip link, keyboard reordering, shared API
timeouts, output-name inputs for Merge/Images-to-PDF/Split, and the Vite 8 upgrade
(actual: Vite 5.4.10). The claims align with what a previous agent *reported*; the
last two commits (`75a2b24`, `561c4f4`) touched the backend media service only, and
the frontend was last touched at `edfdaac` (v1.0.2).

**Consequence for this takeover:** per the handover's own rule ("inspect and verify
first; code is the baseline"), work is planned against the *actual* code, not the
document's claims. Verified-absent items are treated as outstanding work; verified-
present items are preserved, not rewritten.

---

## 2. Repository & git state

- Branch `main`, working tree **clean**, synced with `origin/main`
  (https://github.com/orchill/pdf-media-studio). Only 4 commits exist:
  `edfdaac` v1.0.2 → `dab1688` NameError fix → `75a2b24` audit fixes (backend only)
  → `561c4f4` YouTube sign-in resilience + v1.0.4 (backend + 1 README line).
- Layout: `backend/` (FastAPI app + tests), `frontend/` (React SPA, prebuilt `dist/`
  is shipped), `scripts/` (start/stop/setup for Windows + POSIX, e2e smoke),
  `run.py` launcher with dependency pre-flight, `config.example.json`.
- Runtime dirs `data/`, `outputs/`, `config.json` correctly gitignored
  (`data/cookies.txt` holds real user cookies — never read, never committed).
- Environments created during this inspection: `.venv/` (Python 3.13.3, requirements
  + dev requirements; `pip check` clean) and `frontend/node_modules/`. Both gitignored.

## 3. Backend architecture (verified)

| Module | Role | State |
|---|---|---|
| `app/config.py` | JSON config, thread lock, host whitelist, restart-key detection | Works; gaps below |
| `app/tasks.py` | Task manager: semaphore queue, progress, cancel, JSON history | Works; gaps below |
| `app/security.py` | Path/safe-id/page validation + `validate_media_url` (SSRF) | One-shot SSRF check only |
| `app/main.py` | FastAPI app, lifespan (boot cleanup, shutdown), CORS, static mount | **No security headers/middleware** |
| `routers/` | files, pdf (7 ops), media, system, tasks_api | Contracts match frontend |
| `services/pdf_service.py` | PyMuPDF + pypdf + Pillow implementations | Core ops verified by tests |
| `services/media_service.py` | yt-dlp subprocess + FFmpeg, progress templates, cookie args | Most advanced module (recently reworked) |
| `services/cookie_store.py` | Netscape/header parsing, validation, masking | Solid parser; gaps below |
| `services/depsinfo.py` | Dependency/system diagnostics | Leaks absolute paths (see §8) |

**API contracts** (all frontend calls verified against routers): upload/list/delete
files, thumbnails, 7 PDF ops (merge, images-to-pdf, pages, split, compress,
extract-images, to-images), media info/download/cookies CRUD+test, tasks list/detail/
log/cancel/delete, system info/settings/clear-workspace/open-output-folder.

## 4. Frontend architecture (verified)

- React 18 + TypeScript + Tailwind 3 + `lucide-react`. **No router library** —
  navigation is `useState<Route>` over 11 routes (state lost on reload; no URL deep-
  links). No breadcrumbs. Sidebar (11 items, grouped) + mobile chip strip + header.
- High component reuse: `FileDrop` (7 pages), `TaskPanel`/`StatusBadge` (8),
  `PageGrid` (3), shared class constants in `ui.ts` used by 16/17 files.
- Theme: `useTheme` hook toggling `dark` class + localStorage (works, not a context).
- Current look: utilitarian light-mode-first slate+violet; `CARD`/button constants;
  Segoe UI stack; compact type scale (`text-sm` workhorse); single violet gradient
  hero on Dashboard. Competent but generic — matches the handover's own admission
  that the visual redesign is still required.

## 5. Claim-by-claim verification (handover Part 3 vs code)

Legend: ✅ verified complete · 🟡 partial/different · ❌ not implemented · ⚠️ needs correction

### 5.1 Configuration
| Claim | Verdict | Evidence |
|---|---|---|
| Strict config validation | 🟡 | Int clamps + host whitelist only; `cookie_source`/booleans unvalidated on load |
| Boolean handling / reject string booleans | ❌ | `update()` does `bool(value)` — `bool("false")` → `True` (config.py:172) |
| Atomic config writes | ❌ | `save()` = plain `write_text`, exceptions swallowed (config.py:216–222) |
| Rollback-safe updates | 🟡 | Patch applied to copy, invalid → raise before swap; but `save()` failure unreported |
| Configuration locking | ✅ | `threading.Lock` in `update()`/`set_cookie_prefs()` |
| Public/internal separation + allowlist | ❌ | `public_dict()` returns **everything** (config.py:152–154) |
| Browser-profile config | 🟡 | Browser *name* validated; no `browser:Profile` form |
| Restart-required detection | ✅ | `RESTART_KEYS` + returned by `PUT /api/settings` (dead entry: `data_dir`) |
| Wildcard/LAN binding warnings | ❌ | `0.0.0.0` silently accepted (config.py:94) |

### 5.2 Task management
| Claim | Verdict | Evidence |
|---|---|---|
| Cooperative cancellation (PDF) | ✅ | Cancel-event checks at 10 sites in pdf_service |
| Interrupt-based media cancellation | ✅ | `CancelledError` → kill/reap; tested |
| Process-tree termination | ❌ | Single `proc.kill()` only; yt-dlp's ffmpeg child survives on Windows |
| Output validation | ✅ | Non-empty file check in `_wrap` |
| Atomic task-history writes | ❌ | `_archive`/`remove` use plain `write_text` (tasks.py:122–129, 216–221) |
| Shutdown waiting | ❌ | `shutdown()` never awaits workers; logs "complete" immediately |
| Progress clamping | ✅ | `report()` clamps to [0,1] |
| Idempotent queued-task archiving | ✅ | Archived exactly once in `finally`; tested |
| Safer task deletion | ✅ | Refuses non-terminal tasks → 409 |

### 5.3 PDF processing
| Claim | Verdict | Evidence |
|---|---|---|
| PDF content validation | ✅ | Rejects unreadable/encrypted; outputs re-opened |
| Page-count validation | 🟡 | For images→PDF, edit-pages, split parts; **not** merge |
| Image-count limits | ✅ | ≤200 items, ≤24 uploads (router level) |
| Pixel-count limits | ❌ | No `MAX_IMAGE_PIXELS` handling anywhere |
| GIF/TIFF first-frame handling | ❌ | No `is_animated`/`seek(0)` logic |
| EXIF orientation normalization | ✅ | `ImageOps.exif_transpose` |
| Compression fallback when larger | ⚠️ | Message says "original is kept" but the **larger output is still produced and returned** (pdf_service.py:428–432) |
| Rendering limits | 🟡 | DPI clamped; no pixmap dimension cap |
| Extraction limits | ❌ | No cap on extracted image count/size |
| Atomic output-path reservation | ❌ | `unique_path()` is check-then-act (TOCTOU) |
| Output-name wired into merge/images/split/edit | ⚠️ | Field accepted by 3 routers then **silently ignored**; only edit-pages uses it |

### 5.4 Cookie authentication
| Claim | Verdict | Evidence |
|---|---|---|
| Netscape import / dedupe | ✅ | Robust parser + tests |
| Pasted Cookie-header support | ✅ | Header→Netscape conversion works |
| Leading `Cookie:` prefix removal | ❌ | Pasting `Cookie: SID=…` → 400 (name becomes "Cookie: SID") |
| Header unfolding | ❌ | Folded headers **rejected** (control-char check) |
| Atomic cookie writes | ✅ | tmp + `os.replace` — the only atomic write in the backend |
| Locked cookie operations | ❌ | No lock; fixed tmp name → concurrent PUT race |
| Expiry detection | ❌ | Only integer validation; no expired-cookie reporting |
| Malformed-cookie detection | ✅ | Control chars, sizes, counts; tested |
| Session-cookie counting | ❌ | Not implemented |
| Browser-cookie extraction | ✅ | `--cookies-from-browser <name>` |
| Browser-profile selection | 🟡 | Name only, no profile suffix |
| Status reporting / file-missing | 🟡 | Status reports `file_present:false`, but downloads silently proceed without cookies |
| `#HttpOnly_` handling | ✅ | Stripped and parsed; tested |
| Plaintext storage | ✅ (documented) | `data/cookies.txt`; `chmod(0o600)` is a **no-op on Windows**; no ACL hardening exists |
| Values in logs/API | ✅ (safe) | Never echoed; command log truncated before cookie args; only *names* can appear in 400 messages |

### 5.5 Media downloader
| Claim | Verdict | Evidence |
|---|---|---|
| yt-dlp integration, arg-array exec, custom path detection | ✅ | |
| FFmpeg detection + pre-flight error | ✅ | Actionable `ValidationError` when required |
| FFprobe duration verification | ❌ | Diagnostics only |
| Post-download size checks | 🟡 | Generic non-empty check only |
| Per-task media temp dirs | ❌ | Downloads write into `out_dir` with `.part` cleanup |
| Final-output detection | 🟡 | mtime-window heuristic; can catch unrelated files |
| Format validation | ✅ | Whitelists + format-id regex |
| Progress reporting (machine-readable) | ✅ | `--newline` + `--progress-template` parsers (the accurate version of the claim) |
| Cookie-log redaction | ✅ | Command line truncated before cookie args |
| `.part` cleanup on cancel | ✅ | With Windows PermissionError retry; tested |

### 5.6 File management
| Claim | Verdict | Evidence |
|---|---|---|
| Safe identifiers/paths/filenames | ✅ | Id regex, containment checks; tested |
| Upload limits + content sniffing | ✅ | Chunk-wise cap, magic-byte probe; tested |
| Atomic sidecar operations | ❌ | Plain `write_text`/`unlink` (files.py:145–175) |
| Orphaned-file cleanup | 🟡 | Boot-time blanket cleanup only |
| Task-aware deletion restrictions | 🟡 | `clear-workspace` checks tasks; **`DELETE /api/files/{id}` does not** |
| Non-blocking thumbnail generation | ❌ | Renders **synchronously on the event loop** (files.py:213–220) |
| Filtering of missing content | ❌ | Sidecars without `.bin` are listed |

### 5.7 Security middleware — **largest gap between claims and reality**
| Claim | Verdict | Evidence |
|---|---|---|
| Host validation (inbound) | ❌ | Any `Host` header accepted |
| DNS-rebinding checks (inbound) | ❌ | None |
| Origin validation | ❌ | Only CORS origin list (dev-server origins) |
| Sec-Fetch-Site checks | ❌ | Zero references |
| CSP headers | ❌ | None |
| Security headers (X-Frame-Options, XCTO, …) | ❌ | None |
| Docs-specific CSP | ❌ | `/api/docs` always on, no special handling |
| Restricted CORS methods/headers | ❌ | `allow_methods=["*"]`, `allow_headers=["*"]` (main.py:80–81) |
| Media URL validation (SSRF, one-shot) | ✅ | Scheme/credentials/private-IP checks; tested with 12 unsafe cases |
| Warnings for non-loopback binding | ❌ | None |

### 5.8 Frontend claims
| Claim | Verdict | Evidence |
|---|---|---|
| Hash-based routing | ❌ | `useState` routing only (App.tsx:177) |
| Nav = Home/PDF Tools/Media/Settings + nested + breadcrumbs | ❌ | Flat 11-item sidebar, no breadcrumbs |
| Home dashboard (quick actions, recent, status) | ✅ | Dashboard.tsx |
| PDF tools landing page | ❌ | No hub route; "Organize" is the page editor |
| Theme context | 🟡 | Hook, not context; works |
| Reduced-motion CSS | ❌ | No `prefers-reduced-motion` anywhere |
| Skip navigation link | ❌ | None |
| Focus rings | 🟡 | On shared button/input constants only; nav/grid/history controls fall back to UA default |
| Keyboard-based reordering | ❌ | Drag-only (`useReorder`) |
| Selected-page checkmarks | ✅ | `✓` glyph badge + aria-pressed |
| Output-name inputs (Merge, Images→PDF, Split, Edit) | 🟡 | **Only** Edit pages; other three silently ignore the backend field (which itself ignores it) |
| Audio payload handling | ⚠️ | `video_format:"mp4"` sent unconditionally; stale `format_ids`/`height` can persist in audio mode (Media.tsx:71–83) |
| Cookie browser-profile UI | ✅ | CookiesPanel three-mode radio + browser select |
| Cookie expiry/malformed warnings in UI | ❌ | Not implemented |
| Settings: host/port/history-limit + restart + LAN warnings | 🟡 | Host/port/history inputs absent (backend supports host/port); restart toast ✅; LAN warning N/A |
| History timestamp parsing | ✅ | Naive-UTC → `Z` append |
| "Dashboard component removed" | ❌ (false) | `Dashboard.tsx` **is** the home page, imported at App.tsx:11 |
| Shared API timeouts/abort handling | ❌ | Bare `fetch` wrapper, no signal/timeout (api.ts:3–17) |
| Vite 8.3.5 / plugin-react 6.1.2 | ❌ (false) | Vite **5.4.10** / plugin-react **4.3.3** |
| npm audit zero vulns / tsc pass / build pass | ✅ (reproducible) | Verified this session (Vite 5.4.21 toolchain) |

### 5.9 Test status
| Source | Claim | Reality (this machine) |
|---|---|---|
| Handover §4.1 | "83 passing" | **64 collected, 64 passed** (pytest 8.4.2, Python 3.13.3, 12.7 s) |
| Independent review | "75 + 8 network" | Not reproducible against this tree |
| README | "62 tests" | Stale |
| Static count | 53 test functions | Parametrization (esp. 12 unsafe-URL cases) → 64 items |
- `pip check`: clean. `tsc --noEmit`: pass. `vite build`: pass (239 kB JS / 27.8 kB CSS).
- Media/FFmpeg tests **executed** (not skipped) → FFmpeg present on this machine.
- Network-dependent tests: `test_media_url_validation_accepts_public` (DNS), two
  yt-dlp-vs-local-HTTP suites (localhost only, no external internet required).
- `scripts/e2e_smoke.py` exists for live-server smoke testing.

## 6. Current UI shortcomings (for Phases 3–7)

1. No URL routing/deep links; no breadcrumbs; 11 flat nav items instead of the
   4-area structure (Home / PDF Tools / Media / Settings).
2. Generic "component library default" look: default Tailwind palette, one gradient
   hero, `CARD` constants bypassed in 4 pages, 3 destructive-button styles,
   3 near-identical selector implementations, hand-rolled select in History.
3. A11y: no skip link, no reduced-motion guard, drag-only reordering, missing
   focus-visible on nav/grid/history controls, native `confirm()` dialogs.
4. No API timeouts/abort; type-unsafe op payloads (`Record<string, any>`).
5. Minor dead code (`EmptyGridHint`, `ImageItem`, hidden Loader2), off-palette
   favicon color, invalid `<ul><div><li>` nesting in drag lists.

## 7. Outstanding issues (new work list, in priority order)

**P0 — correctness bugs**
1. CSRF exposure: CORS-simple endpoints (`/api/upload`, `/api/system/clear-workspace`,
   `/api/system/open-output-folder`) fire from any website while the app runs;
   no Origin/Sec-Fetch-Site validation exists.
2. No security headers/CSP anywhere; CORS methods/headers wildcarded.
3. `bool("false")` → `True` config bug; config/history writes non-atomic.
4. Compress "fallback" is cosmetic — larger output still returned as the deliverable.
5. Media audio mode can send stale video `format_ids`/`height`.
6. `output_name` silently ignored by merge/images-to-pdf/split (frontend *and* backend).

**P1 — robustness/security**
7. SSRF: no redirect or DNS-rebinding mitigation after initial validation (document
   limits; add practical mitigations that don't break yt-dlp).
8. `0.0.0.0` binding silently allowed while `/api/system/info` leaks absolute paths;
   add LAN warning + trim public info.
9. Thumbnails block the event loop; `DELETE /api/files/{id}` lacks running-task check;
   missing-content filtering; cookie write race; process-tree kill on Windows.
10. Cookie UX: `Cookie:`-prefix paste fails; no expiry warnings in UI.

**P2 — product (the handover's actual main priority)**
11. Full UI/UX redesign per Part 5–7 (design system → shell → pages).
12. Documentation refresh (README test count/structure, AUDIT_REPORT, versions:
    backend 1.0.4 vs frontend package 1.0.0).

## 8. Recommended execution order

Unchanged from the handover's plan, with scope corrections:
1. **Phase 2** — baseline (✅ done this session: tests/tsc/build), branch
   `feature/ui-redesign-and-release`, checkpoint commit.
2. **Phase 3** — design system + one representative page for user assessment.
3. **Phases 4–7** — shell/Home → PDF tools → Media downloader → Settings.
4. **Phase 8** — security & reliability: P0/P1 list above (CSRF/headers, atomic
   writes, config booleans, SSRF review, Windows process-tree kill, cookie hardening).
5. **Phases 9–11** — docs (README, AUDIT_REPORT.md, version sync), final test pass,
   release readiness. No push without explicit authorization.

## 9. Classification summary

- **Verified complete (preserve, do not rewrite):** config locking, restart detection,
  cooperative/media cancellation core, output validation, progress clamping,
  PDF core operations, cookie parsing/#HttpOnly_/masking, atomic cookie write,
  media pipeline (args/progress/redaction/.part cleanup), upload safety, path safety,
  dashboard structure, browser-profile UI, history timestamps, high component reuse.
- **Partially implemented (finish):** output-name plumbing, validation coverage,
  focus rings, theme context, file deletion guards, binding warnings.
- **Needs correction:** compress fallback lie, audio payload, ignored output_name,
  `bool("false")`, wildcard CORS, stale README counts/versions.
- **Not implemented (build if in scope):** security middleware suite, atomic
  config/history/sidecar writes, process-tree termination, shutdown wait,
  expiry/session-cookie reporting, hash routing, breadcrumbs, reduced motion,
  skip link, keyboard reordering, API timeouts, Vite 8 upgrade (optional).
- **Unable to verify:** prior agent's claimed live-YouTube test executions and
  "automated browser" UI verification (no artifacts in repo).
