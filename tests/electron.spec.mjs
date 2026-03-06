import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const appRoot = '/Users/nizda/Dev/codex/chess';
const artifactDir = path.join(appRoot, 'artifacts', 'qa');
const qaInventory = [
  'Claim: The app launches with a visible full board, readable HUD, and marble/glass styling.',
  'Claim: Clicking pieces and destination squares performs legal moves and rejects illegal ones.',
  'Claim: Castling works and animates into the expected king/rook arrangement.',
  'Claim: En passant works and removes the captured pawn from the board.',
  'Claim: A game can finish in checkmate with a final winner state.',
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

async function play(window, moves) {
  for (const [from, to] of moves) {
    const before = await getState(window);
    await clickSquare(window, from);
    await window.waitForTimeout(120);
    await clickSquare(window, to);
    await window.waitForFunction(
      ({ count }) => window.__chessDebug.getState().history.length > count,
      { count: before.history.length },
    );
  }
  await window.waitForTimeout(450);
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

async function main() {
  console.log(qaInventory.join('\n'));
  await fs.mkdir(artifactDir, { recursive: true });

  const app = await electron.launch({ args: ['.'], cwd: appRoot });
  const window = await app.firstWindow();
  await waitForReady(window);
  await ensureViewportFit(window);

  await window.screenshot({ path: path.join(artifactDir, 'initial-view.png') });

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
  state = await getState(window);
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
  state = await getState(window);
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

  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
