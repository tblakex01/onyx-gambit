# Security Best Practices Report

## Executive Summary

Completed a repository-wide security scan for the Electron desktop app, renderer input paths, and the bundled Stockfish downloader. I found and fixed four concrete issues: unvalidated IPC senders, packaged `file://` rendering, unbounded file reads for imports/autosave restore, and unsafe archive handling in the Stockfish fetch script. After the fixes, `npm run test:unit`, `npm run test:e2e`, and `npm run test:packaged-smoke` all passed.

## Scope

- Electron main/preload/security boundary
- Renderer persistence and untrusted chess text inputs
- Stockfish download/extraction script
- Existing HTML/CSS renderer shell changes

## Findings And Fixes

### High

#### SBP-001: Privileged IPC handlers trusted any renderer sender

Impact: any unintended frame that gained access to the preload bridge could reach filesystem, clipboard, and engine IPC without an origin or frame check.

- Location:
  `[electron/main.js](/Users/nizda/Dev/codex/chess/electron/main.js):69`
  `[electron/security.js](/Users/nizda/Dev/codex/chess/electron/security.js):79`
- Evidence:
  The main-process handlers now call `assertTrustedEvent(event)` before serving every `ipcMain.handle(...)` route, and the shared validator enforces both main-frame identity and an allowlisted origin.
- Fix:
  Added canonical trust policy in `[electron/security.js](/Users/nizda/Dev/codex/chess/electron/security.js):69-100` and applied it to every IPC entrypoint in `[electron/main.js](/Users/nizda/Dev/codex/chess/electron/main.js):69-145`.

#### SBP-002: Packaged app used `file://` instead of a constrained custom protocol

Impact: if a renderer compromise ever occurred, `file://` semantics would make local-file abuse easier than under an app-scoped protocol.

- Location:
  `[electron/main.js](/Users/nizda/Dev/codex/chess/electron/main.js):27`
  `[electron/main.js](/Users/nizda/Dev/codex/chess/electron/main.js):47`
  `[electron/main.js](/Users/nizda/Dev/codex/chess/electron/main.js):190`
- Evidence:
  The app now registers a privileged `app://` protocol, validates requested asset paths stay under `dist/`, and loads the packaged renderer through `APP_ENTRYPOINT`.
- Fix:
  Replaced packaged `loadFile(...)` behavior with a validated custom protocol handler and aligned navigation/IPC trust checks with that protocol.

### Medium

#### SBP-003: File import and autosave restore paths could read arbitrarily large files

Impact: selecting a very large local file could force excessive memory use in the main process and renderer, resulting in a local denial of service.

- Location:
  `[electron/main.js](/Users/nizda/Dev/codex/chess/electron/main.js):105`
  `[electron/main.js](/Users/nizda/Dev/codex/chess/electron/main.js):133`
  `[src/persistence.js](/Users/nizda/Dev/codex/chess/src/persistence.js):92`
- Evidence:
  The open-file and autosave load paths now `stat()` files before reading them, and the renderer-side chess parsers now enforce bounded text/FEN/PGN input.
- Fix:
  Added size validation in the main process and centralized bounded input rules in `[src/security-policy.js](/Users/nizda/Dev/codex/chess/src/security-policy.js)`, then applied them in `[src/persistence.js](/Users/nizda/Dev/codex/chess/src/persistence.js):20-23`, `[src/persistence.js](/Users/nizda/Dev/codex/chess/src/persistence.js):92-145`, and `[src/persistence.js](/Users/nizda/Dev/codex/chess/src/persistence.js):147-163`.

#### SBP-004: Stockfish download/extraction trusted the latest release tarball too broadly

Impact: a compromised or malformed archive could previously exploit tar extraction behavior or silently replace the expected engine binary.

- Location:
  `[scripts/fetch-stockfish.mjs](/Users/nizda/Dev/codex/chess/scripts/fetch-stockfish.mjs):10`
  `[scripts/fetch-stockfish.mjs](/Users/nizda/Dev/codex/chess/scripts/fetch-stockfish.mjs):37`
  `[scripts/fetch-stockfish.mjs](/Users/nizda/Dev/codex/chess/scripts/fetch-stockfish.mjs):55`
  `[scripts/fetch-stockfish.mjs](/Users/nizda/Dev/codex/chess/scripts/fetch-stockfish.mjs):81`
- Evidence:
  The downloader now pins the expected Stockfish release, verifies SHA-256 digests, rejects unsafe archive entries, and extracts only the selected binary member instead of unpacking the full tarball to disk.
- Fix:
  Hardened the fetch script and added regression tests in `[tests/unit/fetch-stockfish.test.mjs](/Users/nizda/Dev/codex/chess/tests/unit/fetch-stockfish.test.mjs)`.

## Additional Notes

- The renderer session now denies permission checks and permission requests by default in `[electron/main.js](/Users/nizda/Dev/codex/chess/electron/main.js):147-153`.
- The HTML entrypoint still uses a meta-delivered CSP in `[index.html](/Users/nizda/Dev/codex/chess/index.html):9-12`. That remains acceptable for this app’s current architecture, but it is weaker than a header-delivered CSP and should be revisited if the app ever starts loading additional remote content.

## Verification

- `npm run test:unit`
- `npm run test:e2e`
- `npm run test:packaged-smoke`

## Conclusion

The concrete security issues found in this scan have been fixed in the current worktree and validated through unit, Electron end-to-end, and packaged smoke coverage.
