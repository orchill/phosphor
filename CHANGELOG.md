# Changelog

## 1.3.0

Bug-fix and visual-overhaul release. Item IDs (B*, V*, F*) refer to the handoff
document; each has its own commit.

### Fixed

- **Tasks / backend**
  - B1 `kill_process_tree` works for asyncio subprocesses.
  - B2, B4 running tasks stay registered; PDF thread tasks cancel cooperatively.
  - B3 concurrent media downloads use per-task temp dirs.
  - B5, B10 blocking probes moved off the event loop; honest yt-dlp diagnostics.
  - B6, B7 readable download stage text; progress is monotonic across multi-stream downloads.
  - B9, B11 concurrency/history settings apply live; task memory is bounded (`MEMORY_KEEP`).
  - B12 yt-dlp is killed and reaped when `fetch_info` times out or is cancelled.
- **PDF**
  - B8 JPEG thumbnails; B13 consistent PDF opening; B14 EXIF orientation; B15 honest split labels.
- **Frontend**
  - B16 no theme flash on load.
  - B17 Organize grid: rotation overflow, thumbnail flicker, layout shift, blur.
  - B18 cookie-banner error matcher is word-bound.
  - B19 polling stops after repeated 404s, with back-off and a "task gone" notice.
  - B20 `<ul>` children are real `<li>` elements.
  - B21 dashboard counters are labelled "last 50".
  - B22 history flags outputs whose file no longer exists.

### Changed (visual)

- V1 JetBrains Mono is the single typeface.
- V2 lowercase voice for navigation, labels, buttons and titles.
- V3 shared primitives: `Tabs`, `PageHeader`, `Kbd`, `Stat`, `EmptyState`, `Field`.
- V4 phosphor identity: glow, accent presets (green / amber / ice), optional CRT overlay.
- V5 wider overview pages, command index with number-key shortcuts, 12-column dashboard.
- V6 dashboard shows the real output dir, clickable recent rows, "how to fix" links to diagnostics.
- V7 header search-box palette trigger and copyable, truncated output path.
- V8 task panel: terminal stage line, glowing 2px bar, output file rows.
- V9 media page: 16:9 preview with duration badge, paste-to-fetch, table-style formats.
- V10 paper-terminal light theme with AA-checked tokens and card depth.
- V11 terminal-style toasts, thin scrollbars, prompt-style empty states.

### Added

- F1 global task tray (header badge + drawer), page-title progress prefix, and a
  one-time desktop notification when a task finishes while the tab is hidden.
- `npm run shots` screenshot harness (separate from `npm run e2e`).
- `npm run format` / `format:check` (Prettier).
- New backend and e2e tests covering the above.

### Housekeeping

- Finished the rename to "phosphor". Legacy identifiers are intentionally kept
  for compatibility with existing installs: `PDFMEDIA_CONFIG`, `pms.*` logger
  names and `pms-*` localStorage keys.
