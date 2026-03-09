# Onyx Gambit

> A cinematic Electron chess app with a marble board, smoked-glass pieces, direct Three.js rendering, Stockfish-powered AI modes, clocks, replay, and analysis.

## Highlights

- Human vs Human, Play against AI, and AI Play from the same 3D board flow
- Stockfish 18 launched as a bundled native child process from the Electron main process
- `chess.js` remains the single rules authority for legal moves, FEN, PGN, game-end detection, and move history
- Analysis mode with live evaluation, best move, MultiPV candidate lines, and replay-time move review
- Untimed, Bullet, Blitz, Rapid, and Custom clocks
- Save/load game snapshots, PGN export/import, FEN copy/load, and replay stepping/autoplay
- Electron Playwright regression coverage plus unit/integration tests for parser, controller, clocks, and persistence

## Run

```bash
npm install
npm run dev
```

On first install, `postinstall` runs `npm run prepare:stockfish`, which validates the pinned bundled Stockfish binaries already committed under `resources/stockfish`. If a required asset is missing or invalid, the script re-downloads the pinned official release asset automatically.

Useful scripts:

```bash
npm run prepare:stockfish
npm run build
npm run package:mac:dir
npm run test:unit
npm run test:e2e
npm run test:packaged-smoke
npm run check
npm run package:mac
```

## Stockfish Packaging On macOS

`npm run prepare:stockfish` maintains the pinned Stockfish 18 release assets for:

- `resources/stockfish/darwin-arm64/stockfish`
- `resources/stockfish/darwin-x64/stockfish`

Packaged builds copy that folder into the app bundle with `electron-builder`:

- `Onyx Gambit.app/Contents/Resources/stockfish/darwin-arm64/stockfish`
- `Onyx Gambit.app/Contents/Resources/stockfish/darwin-x64/stockfish`

The Electron main process resolves the binary from `process.resourcesPath/stockfish/<platform>-<arch>/stockfish` in packaged builds and from `resources/stockfish/<platform>-<arch>/stockfish` in development.

To explicitly refresh the pinned assets even when the local bundle is already valid, run:

```bash
npm run prepare:stockfish -- --force
```

## AI, Analysis, And Replay

- `Human vs Human`: local board play with clocks, undo, replay, and analysis.
- `Play against AI`: choose human color, configure per-side AI difficulty/time/depth, then start a new game. Input locks while the engine is thinking.
- `AI Play`: both sides are AI. Use autoplay delay plus pause/resume to watch a self-play game.
- `Analysis mode`: toggle it on to show current evaluation, best move, and top candidate lines. Completed games now precompute full move-review annotations so replay scrubbing and the move ledger stay instant after the game ends.
- `Replay`: use First/Previous/Next/Last or Autoplay Replay. Stepping away from the final ply pauses live play until you return to the last position.

## How To Start And Play

1. Choose `Human vs Human`, `Play against AI`, or `AI Play` from the right-side mode panel.
2. Set clock preset, AI difficulty/time/depth, autoplay delay, and optional analysis mode.
3. Press `Start / New` to apply the setup and begin from the initial position.
4. Click a piece, then a destination square to move. In `Play against AI`, the board locks during engine thinking. In `AI Play`, use `Pause` and `Restart` to control autoplay.
5. Use `Undo`, `Resign`, `Flip view`, replay controls, PGN/FEN tools, and save/load controls from the sidebar as needed.

The app also keeps an autosave in Electron user data and restores it on launch before exposing the renderer as ready.

## Save, Load, PGN, FEN

- `Save game` and `Load game` use a JSON snapshot that preserves mode, players, clocks, current position, replay state, and analysis metadata.
- `Export PGN` writes move history in PGN format.
- `Import PGN` restores a game from PGN.
- `Copy FEN` copies the currently displayed board state.
- `Load FEN` restores an exact board position from the sidebar input.
- Replay/autoplay operate on the currently loaded game state, including imported PGN and loaded FEN positions.

## Architecture

A short implementation note lives in [docs/architecture.md](/Users/nizda/Dev/codex/chess/docs/architecture.md).

Current code layout:

```text
electron/
  main.js               BrowserWindow bootstrap, IPC, dialogs, autosave, Stockfish lifecycle
  preload.js            Safe contextBridge surface for engine/storage APIs
  stockfish-parser.js   UCI line parsing helpers
  stockfish-service.js  Native engine process manager
resources/
  stockfish/            Bundled Stockfish binaries and source/license pointers
scripts/
  fetch-stockfish.mjs   Official release downloader for bundled engine assets
src/
  main.js               Renderer bootstrap + DOM wiring
  game-controller.js    Authoritative gameplay, AI, clocks, replay, analysis state flow
  clock.js              Chess clock model
  persistence.js        Save/load, PGN/FEN, replay helpers
  scene.js              Three.js board rendering, picking, animation
tests/
  electron.spec.mjs     Desktop Playwright regression
  integration/          Controller integration tests
  unit/                 Parser, clock, persistence tests
```

## CI/CD

- `CI` runs `npm run test:unit` and `npm run test:e2e` on macOS for pushes, pull requests, and manual dispatches.
- `Release` builds and smoke-tests macOS packages on Intel and Apple Silicon, then publishes `.zip` and `.dmg` assets to a GitHub Release when a `v*` tag is pushed or when manually dispatched with a tag.

## Known Limitations

- Save/load snapshots are JSON files; PGN export/import is separate by design so clock and mode metadata are not pushed into PGN comments.
- Local packaging is covered by `npm run test:packaged-smoke`; notarization is not configured yet.
