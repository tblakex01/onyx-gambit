Original prompt: You are working on an existing macOS Electron 3D chess application. The initial game already exists. Your job is to ITERATE on the current codebase, not rebuild it from scratch.

- 2026-03-06: Inspected repo architecture. Current split is Electron main/preload, plain DOM renderer in `src/main.js`, and raw Three.js board in `src/scene.js`.
- 2026-03-06: User requested `$playwright-interactive` for verification. Added it to the QA plan.
- 2026-03-06: Added controller-driven state model, Stockfish main-process service, preload IPC bridge, clocks, persistence helpers, analysis/replay flow, and packaged Stockfish binaries.
- 2026-03-06: Added unit/integration tests plus Electron regression coverage for AI modes, replay, analysis, and FEN load. `npm run test:unit` and `npm run test:e2e` are green.
- 2026-03-06: Replaced replay-time single-move review with cached full post-game review annotations, surfaced classification badges in the move ledger, and persisted review annotations in saved games.
- 2026-03-06: Added `npm run package:mac:dir` plus `npm run test:packaged-smoke` to validate the packaged `.app` launch path, preload bridge, and bundled Stockfish search.
- 2026-03-06: Added Vite manual chunking for `three`, postprocessing, and `chess.js`; the renderer entry is now ~45 kB minified and the heavy Three.js vendor code is isolated to its own chunk.
- 2026-03-06: Hardened Stockfish cancellation sequencing and split the long Electron regression into two app launches to avoid stale process/test-state interference. `npm run test:unit`, `npm run test:e2e`, and `npm run test:packaged-smoke` are green.
- Note: `$playwright-interactive`'s `js_repl` workflow is not available in this session, so Electron Playwright verification used the standard Playwright runner instead.
