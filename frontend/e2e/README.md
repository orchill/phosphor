# End-to-end tests (Playwright)

Real-browser tests against the **real backend server**, bound to an isolated
config/data/output tree (`e2e/.run/`) — your own `data/` directory is never
touched.

## Run

```bat
cd frontend
npm run e2e
```

Requirements: the backend venv (`.venv`, via `scripts\setup.bat`) and Chromium
(`npx playwright install chromium`, done once). The suite is **fully offline**:
media workflows run through a deterministic native `stub-ytdlp.exe` (compiled
at setup from `stub-ytdlp/stub.cs` with the .NET compiler that ships with
Windows), selected via the test config's `ytdlp_path`. No external websites
are contacted.

## What is covered

| Spec | Workflows |
|---|---|
| `a-nav.spec.ts` | dashboard default route, hash deep-links, breadcrumbs, unknown-route fallback, PDF Tools landing categories, sidebar navigation, browser back/forward, sidebar collapse/auto-expand |
| `b-pdf.spec.ts` | merge (2 uploads → download `%PDF-`), images→PDF, split by page selection → download, compress → download (fallback behavior asserted deterministically by a backend unit test) |
| `c-cookies.spec.ts` | cookie paste import → masked UI status, **values never appear in any API response**, generic settings API carries no cookie data, clear flow |
| `d-media.spec.ts` | metadata fetch, download task with progress → output download (byte-checked), queued-task cancellation, running-task cancellation with `.part` cleanup |
| `z-restart.spec.ts` | settings change survives a full server restart (real process kill + start) |

## Notes

- Tests run serially (`workers: 1`) against one stateful server; the run dir
  is wiped and rebuilt by `global-setup.ts` on every run.
- The stub's "download" takes ~6 s with live progress-template lines, which
  gives the cancel tests a realistic window.
- `PMS_PYTHON=<path>` overrides the backend interpreter if needed.
