# End-to-end tests (Playwright)

Real-browser tests against the **real backend server**, bound to an isolated
config/data/output tree (`e2e/.run/`) — your own `data/` directory is never
touched.

## Prerequisites

| Requirement | Why | Check |
|---|---|---|
| Windows 10/11 | the media stub compiles via the .NET Framework compiler and the suite is tuned for Windows paths | — |
| Backend venv at `.venv/` with `requirements.txt` **and** `requirements-dev.txt` | tests start `run.py` with the venv Python | `.venv\Scripts\python.exe --version` |
| Node.js 20.19+ / 22.12+ | Playwright + Vite 8 | `node --version` |
| Playwright Chromium browser | the test browser | `npx playwright install chromium` (one-time, ~150 MB download) |
| **.NET Framework 4.x C# compiler** (`csc.exe`) | compiles the deterministic `stub-ytdlp.exe` media stub at test setup — a *native* exe is required because Python's `create_subprocess_exec` refuses `.cmd`/`.bat` wrappers, and `cmd.exe` would misinterpret the `|` characters inside yt-dlp's `--progress-template` arguments | `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe` exists (ships with every Windows 10/11 install; nothing to download) |

## Setup (once)

```bat
:: 1. backend environment (skip parts already done)
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-dev.txt

:: 2. frontend dependencies + test browser
cd frontend
npm install
npx playwright install chromium
```

## Run

```bat
cd frontend
npm run e2e
```

`global-setup.ts` then automatically: wipes and rebuilds `e2e/.run/` with an
isolated `config.json` (port 8799, isolated data/output dirs, `ytdlp_path`
pointing at the stub), compiles `e2e/.fixtures/stub-ytdlp.exe` from
`stub-ytdlp/stub.cs`, generates PDF/PNG fixtures via
`scripts/gen_e2e_fixtures.py`, starts the server, and waits for
`/api/health`. `global-teardown.ts` always stops the server.

The suite is **fully offline** — no external website is ever contacted.

## What is covered

| Spec | Workflows |
|---|---|
| `a-nav.spec.ts` | dashboard default route, hash deep-links, breadcrumbs, unknown-route fallback, PDF Tools landing categories, sidebar navigation, browser back/forward, sidebar collapse/auto-expand |
| `b-pdf.spec.ts` | merge (2 uploads → download byte-checked `%PDF-`), images→PDF, split by page selection → download, compress → download (the fallback path itself is asserted deterministically by the backend unit test `test_compress_fallback_delivers_original_when_not_smaller`) |
| `c-cookies.spec.ts` | cookie paste import → masked UI status, **values never appear in any API response**, generic settings API carries no cookie data, clear flow |
| `d-media.spec.ts` | metadata fetch, download task with live progress → output download (byte-checked), queued-task cancellation, running-task cancellation with `.part` cleanup |
| `e-appearance.spec.ts` | accent preset and CRT setting persist across reload, applied before paint |
| `e-organize.spec.ts` | Organize pages grid: reorder, rotate, delete, output |
| `e-polling.spec.ts` | polling stops on a vanished task and shows the "task gone" notice |
| `e-dashboard.spec.ts` | real output dir, clickable recent rows, diagnostics deep-link |
| `e-tray.spec.ts` | task tray badge, drawer, clear finished |
| `z-restart.spec.ts` | settings change survives a full server restart (real process kill + start) |

`screenshots.spec.ts` is a separate harness (`npm run shots`, own Playwright
config); it is excluded from `npm run e2e`.

## Notes

- Tests run serially (`workers: 1`) against one stateful server; the run dir
  is rebuilt on every run.
- The stub's "download" takes ~6 s with live progress-template lines, which
  gives the cancel tests a realistic window.
- `PMS_PYTHON=<path>` overrides the backend interpreter if your venv lives
  elsewhere.
- Test artifacts land in `frontend/test-results/` (failures keep a trace:
  `npx playwright show-trace <trace.zip>`); everything is gitignored.
