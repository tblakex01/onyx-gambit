# Architecture Note

## Stockfish Launch

- Stockfish is launched in the Electron main process by [`electron/stockfish-service.js`](/Users/nizda/Dev/codex/chess/electron/stockfish-service.js).
- The service resolves the bundled native binary from `resources/stockfish/<platform>-<arch>/stockfish` in development and `process.resourcesPath/stockfish/<platform>-<arch>/stockfish` in packaged builds.
- The engine is managed as a single long-lived child process with explicit `ensureReady`, `newGame`, `bestMove`, `analyze`, `cancel`, and `destroy` operations.

## IPC Structure

- [`electron/preload.js`](/Users/nizda/Dev/codex/chess/electron/preload.js) exposes a narrow `window.chessBridge` API through `contextBridge`.
- Engine IPC:
  - `chess:engine:ensure-ready`
  - `chess:engine:new-game`
  - `chess:engine:best-move`
  - `chess:engine:analyze`
  - `chess:engine:cancel`
- Storage IPC:
  - `chess:file:save-text`
  - `chess:file:open-text`
  - `chess:autosave:save`
  - `chess:autosave:load`
  - `chess:clipboard:write-text`
- Engine status is pushed from main to renderer on `chess:engine-status`.

## Game State Flow

- [`src/game-controller.js`](/Users/nizda/Dev/codex/chess/src/game-controller.js) is the authoritative gameplay model.
- `chess.js` remains the source of truth for rules, legal moves, PGN, FEN, draw detection, promotion, castling, and en passant.
- The controller owns:
  - mode/player configuration
  - AI turn scheduling and cancellation tokens
  - clocks
  - replay state
  - analysis state
  - save/load serialization hooks
- [`src/main.js`](/Users/nizda/Dev/codex/chess/src/main.js) is now a renderer bootstrap layer:
  - reads form inputs
  - renders HUD/panels from controller snapshots
  - sends safe engine/storage requests through `window.chessBridge`
  - hands board updates to [`src/scene.js`](/Users/nizda/Dev/codex/chess/src/scene.js)
- [`src/scene.js`](/Users/nizda/Dev/codex/chess/src/scene.js) stays focused on rendering, picking, and animation. The controller waits for `scene.waitForIdle()` before triggering the next AI step so engine turns track the real visual board state.
