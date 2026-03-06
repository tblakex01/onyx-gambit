import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const artifactDir = path.join(appRoot, 'artifacts', 'qa');
const qaInventory = [
  'Claim: The app launches with a visible full board, readable HUD, and marble/glass styling.',
  'Claim: Human vs Human legal move flow, castling, en passant, and checkmate continue to work.',
  'Claim: Analysis mode evaluates the current board and exposes a best move suggestion.',
  'Claim: Play against AI triggers a Stockfish reply after the human move settles.',
  'Claim: AI Play can autoplay multiple turns and pause/resume without race conditions.',
  'Claim: Replay controls can step away from live play and return to the latest position.',
  'Claim: Loading a FEN restores the exact board position.',
  'Control: New game resets state.',
  'Control: Undo reverts the latest ply.',
  'Control: Flip view changes the camera without clipping the layout.',
  'Exploratory: Selection can be cleared by clicking an invalid square.',
  'Exploratory: Layout remains fully visible at startup with no clipped board shell or status pane.',
];

async function waitForReady(window) {
  await window.waitForFunction(() => Boolean(window.__chessDebug?.ready));
}

async function getState(window) {
  return window.evaluate(() => window.__chessDebug.getState());
}

async function pieceAt(window, square) {
  return window.evaluate((value) => window.__chessDebug.pieceAt(value), square);
}

async function clickSquare(window, square) {
  const point = await window.evaluate((value) => window.__chessDebug.getSquareScreenPoint(value), square);
  await window.mouse.click(point.x, point.y);
}

async function waitForHistory(window, count, timeout = 30_000) {
  await window.waitForFunction((target) => window.__chessDebug.getState().history.length >= target, count, { timeout });
}

async function waitForAnalysisReady(window, timeout = 60_000) {
  await window.waitForFunction(
    () => {
      const state = window.__chessDebug.getState();
      return state.analysis.status === 'ready' && Boolean(state.analysis.lastLive);
    },
    undefined,
    { timeout },
  );
}

async function play(window, moves) {
  for (const [from, to] of moves) {
    const before = await getState(window);
    await clickSquare(window, from);
    await window.waitForTimeout(120);
    await clickSquare(window, to);
    await waitForHistory(window, before.history.length + 1);
    await window.waitForTimeout(500);
  }
}

async function ensureViewportFit(window) {
  const diagnostics = await window.evaluate(() => {
    const board = document.querySelector('[data-testid="board-stage"]').getBoundingClientRect();
    const sidebar = document.querySelector('.sidebar').getBoundingClientRect();
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      canScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      canScrollY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      board,
      sidebar,
    };
  });

  assert.equal(diagnostics.canScrollX, false, 'unexpected horizontal clipping');
  assert.equal(diagnostics.board.left >= 0, true, 'board starts clipped on the left');
  assert.equal(diagnostics.board.bottom <= diagnostics.innerHeight, true, 'board extends below viewport');
  assert.equal(diagnostics.sidebar.right <= diagnostics.innerWidth, true, 'sidebar extends beyond viewport');
}

async function reset(window) {
  await window.getByTestId('new-game').click();
  await window.waitForFunction(() => window.__chessDebug.getState().history.length === 0);
}

async function setMode(window, modeLabel) {
  await window.getByRole('button', { name: modeLabel }).click();
}

async function fillValue(window, selector, value) {
  await window.locator(selector).fill(String(value));
}

async function launchAppWindow() {
  const app = await electron.launch({ args: ['.'], cwd: appRoot });
  const window = await app.firstWindow();
  await waitForReady(window);
  await ensureViewportFit(window);
  return { app, window };
}

async function main() {
  console.log(qaInventory.join('\n'));
  await fs.mkdir(artifactDir, { recursive: true });

  let { app, window } = await launchAppWindow();

  await window.screenshot({ path: path.join(artifactDir, 'initial-view.png') });
  await setMode(window, 'Human vs Human');
  await window.getByTestId('new-game').click();
  await window.waitForFunction(() => window.__chessDebug.getState().history.length === 0);

  await clickSquare(window, 'e2');
  let state = await getState(window);
  assert.equal(state.selectedSquare, 'e2', 'selecting a piece should expose a selection state');
  await window.waitForTimeout(120);
  await clickSquare(window, 'e5');
  state = await getState(window);
  assert.equal(state.history.length, 0, 'illegal move target should not change history');
  assert.equal(state.selectedSquare, null, 'illegal target should clear selection');

  await play(window, [
    ['e2', 'e4'],
    ['e7', 'e5'],
  ]);
  await window.getByTestId('undo-move').click();
  state = await getState(window);
  assert.equal(state.history.length, 1, 'undo should revert the latest ply');

  await reset(window);
  await window.getByTestId('flip-board').click();
  await window.waitForTimeout(250);

  await play(window, [
    ['e2', 'e4'],
    ['e7', 'e5'],
    ['g1', 'f3'],
    ['b8', 'c6'],
    ['f1', 'c4'],
    ['g8', 'f6'],
    ['e1', 'g1'],
  ]);
  assert.deepEqual(await pieceAt(window, 'g1'), { type: 'k', color: 'w' }, 'white king should land on g1 after castling');
  assert.deepEqual(await pieceAt(window, 'f1'), { type: 'r', color: 'w' }, 'white rook should land on f1 after castling');
  await window.screenshot({ path: path.join(artifactDir, 'castling.png') });

  await reset(window);
  await play(window, [
    ['e2', 'e4'],
    ['a7', 'a6'],
    ['e4', 'e5'],
    ['d7', 'd5'],
    ['e5', 'd6'],
  ]);
  assert.deepEqual(await pieceAt(window, 'd6'), { type: 'p', color: 'w' }, 'white pawn should land on d6 after en passant');
  assert.equal(await pieceAt(window, 'd5'), null, 'captured pawn should be removed after en passant');
  await window.screenshot({ path: path.join(artifactDir, 'en-passant.png') });

  await reset(window);
  await play(window, [
    ['f2', 'f3'],
    ['e7', 'e5'],
    ['g2', 'g4'],
    ['d8', 'h4'],
  ]);
  state = await getState(window);
  assert.equal(state.checkmate, true, 'fools mate should reach checkmate');
  assert.match(state.status, /Checkmate\./, 'status line should announce checkmate');
  await window.screenshot({ path: path.join(artifactDir, 'checkmate.png') });

  await reset(window);
  await window.locator('#analysis-enabled').check();
  await waitForAnalysisReady(window);
  await window.screenshot({ path: path.join(artifactDir, 'analysis.png') });

  await setMode(window, 'Play against AI');
  await window.selectOption('#human-color', 'w');
  await fillValue(window, '#black-move-time', 120);
  await fillValue(window, '#black-depth', 8);
  await window.getByTestId('new-game').click();
  await waitForHistory(window, 0);
  await clickSquare(window, 'e2');
  await clickSquare(window, 'e4');
  await waitForHistory(window, 2);
  state = await getState(window);
  assert.equal(state.history[1].color, 'b', 'AI should answer with a black move');
  assert.equal(state.history[1].from.length, 2, 'AI move should include a valid origin square');
  await window.screenshot({ path: path.join(artifactDir, 'play-against-ai.png') });

  await app.close();
  ({ app, window } = await launchAppWindow());

  await setMode(window, 'AI Play');
  await fillValue(window, '#autoplay-delay', 0);
  await fillValue(window, '#white-move-time', 120);
  await fillValue(window, '#black-move-time', 120);
  await fillValue(window, '#white-depth', 8);
  await fillValue(window, '#black-depth', 8);
  await window.getByTestId('new-game').click();
  await waitForHistory(window, 4, 45_000);
  const beforePause = await getState(window);
  await window.locator('#pause-game').click();
  await window.waitForTimeout(500);
  const paused = await getState(window);
  assert.equal(paused.history.length, beforePause.history.length, 'pause should stop AI vs AI progression');
  await window.locator('#pause-game').click();
  await waitForHistory(window, beforePause.history.length + 1, 45_000);
  await window.screenshot({ path: path.join(artifactDir, 'ai-play.png') });

  await window.locator('#replay-prev').click();
  await window.waitForFunction(() => window.__chessDebug.getState().inReplay === true);
  await window.locator('#replay-last').click();
  await window.waitForFunction(() => window.__chessDebug.getState().inReplay === false);

  await setMode(window, 'Human vs Human');
  await window.getByTestId('new-game').click();
  await window.locator('#fen-input').fill('4k3/8/8/8/8/8/4Q3/4K3 b - - 0 1');
  await window.locator('#load-fen').click();
  assert.deepEqual(await pieceAt(window, 'e2'), { type: 'q', color: 'w' }, 'FEN load should restore the white queen on e2');

  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
