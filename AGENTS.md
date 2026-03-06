# AGENTS.md

Guidance for agents working in this repository.

## Project Intent

- Keep a single canonical implementation.
- Preserve the direct integration model: Electron main process + Vite renderer + raw Three.js + `chess.js`.
- Do not introduce React, scene wrappers, chess UI libraries, or duplicate runtime paths unless explicitly requested.

## Architecture

- `electron/main.js`: owns desktop window creation, IPC, native dialogs, autosave persistence, and Stockfish process lifecycle.
- `electron/preload.js`: exposes the minimal safe renderer bridge for engine and storage APIs.
- `src/game-controller.js`: authoritative source of truth for chess state, AI turn flow, clocks, replay, persistence, and analysis coordination.
- `src/main.js`: renderer bootstrap, DOM wiring, and debug/test hooks.
- `src/scene.js`: source of truth for 3D board rendering, materials, lighting, animations, and click picking.
- `tests/electron.spec.mjs`: end-to-end regression coverage for gameplay, AI flows, replay, analysis, FEN load, and viewport fit.

## Commands

- Install: `npm install`
- Refresh bundled engine: `npm run prepare:stockfish`
- Dev loop: `npm run dev`
- Build: `npm run build`
- Unit + integration tests: `npm run test:unit`
- Full verification: `npm run check`
- Package macOS app dir: `npx electron-builder --mac dir`

Run `npm run test:unit` and `npm run test:e2e` after any gameplay, interaction, camera, layout, engine, or persistence change.

## Change Rules

- Keep chess rules and authoritative game flow in `src/game-controller.js` via `chess.js`; do not copy rule logic into the renderer or scene.
- Keep Stockfish launch/cancel/UCI logic in the Electron main process; the renderer must only talk through preload IPC.
- Keep square picking, piece animation, materials, and lighting in `src/scene.js`; do not create a parallel scene system.
- Maintain the debug surface on `window.__chessDebug` because the Playwright suite depends on it.
- Preserve the `scene.waitForIdle()` -> controller handoff so AI turns only start after the visible board animation settles.
- Prefer small, explicit APIs between modules.
- Preserve production behavior under `file://` builds; avoid assumptions that only work behind the dev server.
- Keep startup deterministic: autosave restoration must finish before `window.__chessDebug.ready` becomes `true`, otherwise desktop tests race the restored state.

## UI and Visual Quality

- The app should feel premium, not utilitarian.
- Changes to lighting, bloom, tone mapping, or materials require checking generated screenshots in `artifacts/qa/`.
- Treat startup clipping, unreadable HUD text, and overexposed board states as bugs.

## Testing Expectations

- Castling must continue to work.
- En passant must continue to work.
- A full checkmate flow must continue to work.
- Startup layout must keep the board shell and sidebar visible without clipping.
- Play against AI must produce a legal engine reply after the human move settles.
- AI Play must advance multiple plies, pause cleanly, and resume without stale moves.
- Analysis mode must produce a best move/eval payload without breaking live play.
- Loading a FEN must restore the exact board state.

## Safety

- Do not remove or bypass the Playwright regression coverage without replacing it with equivalent or stronger automated coverage.
- Do not expand the preload bridge unless the renderer truly needs it.
- Do not store secrets in the repo.

## Session Learnings

- The app now restores autosave on launch; tests and future changes should assume persisted state can exist from previous runs.
- A single shared Stockfish process is intentionally used for both gameplay and analysis; cancellation correctness matters more than parallel engine throughput here.
- Packaging currently includes both `darwin-arm64` and `darwin-x64` Stockfish binaries under `resources/stockfish/` and copies them into the app bundle via `electron-builder`.
