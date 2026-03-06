import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/public-sans/400.css';
import '@fontsource/public-sans/500.css';
import '@fontsource/public-sans/700.css';
import { Chess } from 'chess.js';
import './styles.css';
import { BoardScene } from './scene.js';

const chess = new Chess();
const selectionLabel = document.querySelector('#selection-label');
const turnIndicator = document.querySelector('#turn-indicator');
const statusLine = document.querySelector('#status-line');
const moveCount = document.querySelector('#move-count');
const moveList = document.querySelector('#move-list');
const lastMove = document.querySelector('#last-move');
const positionMeta = document.querySelector('#position-meta');

let selectedSquare = null;
let legalMoves = [];

const scene = new BoardScene(document.querySelector('#board-canvas'), {
  onSquareClick: handleSquareClick,
});

document.querySelector('#new-game').addEventListener('click', () => {
  chess.reset();
  clearSelection();
  scene.syncBoard(chess.board());
  syncUi();
});

document.querySelector('#undo-move').addEventListener('click', () => {
  if (!chess.history().length) return;
  chess.undo();
  clearSelection();
  scene.syncBoard(chess.board());
  syncUi();
});

document.querySelector('#flip-board').addEventListener('click', () => {
  scene.flipCamera();
});

function colorName(color) {
  return color === 'w' ? 'White' : 'Black';
}

function pieceName(type) {
  return ({
    p: 'Pawn',
    n: 'Knight',
    b: 'Bishop',
    r: 'Rook',
    q: 'Queen',
    k: 'King',
  })[type];
}

function clearSelection() {
  selectedSquare = null;
  legalMoves = [];
  scene.setHighlights({ selectedSquare, legalTargets: [], lastMove: chess.history({ verbose: true }).at(-1) });
}

function selectSquare(square) {
  selectedSquare = square;
  legalMoves = chess.moves({ square, verbose: true });
  scene.setHighlights({
    selectedSquare,
    legalTargets: legalMoves.map((move) => move.to),
    lastMove: chess.history({ verbose: true }).at(-1),
  });
}

function moveDescriptor(move) {
  if (!move) return 'Opening position';
  const suffix = move.san.includes('#') ? ' checkmate' : move.san.includes('+') ? ' check' : '';
  return `${move.san} (${move.from} -> ${move.to})${suffix}`;
}

function describePosition() {
  if (chess.isCheckmate()) return 'Final position';
  if (chess.isStalemate()) return 'Stalemate net';
  if (chess.isThreefoldRepetition()) return 'Repeated position';
  if (chess.isInsufficientMaterial()) return 'Insufficient material';
  if (chess.isDrawByFiftyMoves()) return 'Fifty-move draw';
  return chess.isCheck() ? 'Pressure on the king' : 'Strategic equilibrium';
}

function describeStatus() {
  if (chess.isCheckmate()) {
    return `Checkmate. ${colorName(chess.turn() === 'w' ? 'b' : 'w')} wins.`;
  }
  if (chess.isStalemate()) return 'Draw by stalemate.';
  if (chess.isInsufficientMaterial()) return 'Draw by insufficient material.';
  if (chess.isThreefoldRepetition()) return 'Draw by repetition.';
  if (chess.isDrawByFiftyMoves()) return 'Draw by the fifty-move rule.';
  return `${colorName(chess.turn())} to move${chess.isCheck() ? '. King is in check.' : '.'}`;
}

function syncUi() {
  const history = chess.history({ verbose: true });
  const currentPiece = selectedSquare ? chess.get(selectedSquare) : null;

  turnIndicator.textContent = chess.isGameOver()
    ? chess.isDraw()
      ? 'Drawn game'
      : `${colorName(chess.turn() === 'w' ? 'b' : 'w')} wins`
    : `${colorName(chess.turn())} move`;
  statusLine.textContent = describeStatus();
  selectionLabel.textContent = currentPiece
    ? `${colorName(currentPiece.color)} ${pieceName(currentPiece.type)} on ${selectedSquare}`
    : 'No piece selected';
  moveCount.textContent = `${history.length} plies`;
  lastMove.textContent = moveDescriptor(history.at(-1));
  positionMeta.textContent = describePosition();
  moveList.innerHTML = history
    .map(
      (move, index) => `
        <li class="move-pill">
          <span>${index + 1}.</span>
          <strong>${move.san}</strong>
          <span>${move.from} → ${move.to}</span>
        </li>
      `,
    )
    .join('');

  scene.setHighlights({
    selectedSquare,
    legalTargets: legalMoves.map((move) => move.to),
    lastMove: history.at(-1),
  });

  window.__chessDebug = {
    ready: true,
    getState: () => ({
      fen: chess.fen(),
      turn: chess.turn(),
      history,
      selectedSquare,
      status: describeStatus(),
      checkmate: chess.isCheckmate(),
    }),
    getSquareScreenPoint: (square) => scene.getSquareScreenPoint(square),
    pieceAt: (square) => chess.get(square) ?? null,
  };
}

function commitMove(move) {
  clearSelection();
  const result = chess.move({
    from: move.from,
    to: move.to,
    promotion: move.promotion ?? 'q',
  });
  scene.animateMove(result, chess.board());
  syncUi();
}

function handleSquareClick(square) {
  if (chess.isGameOver()) return;

  const occupant = chess.get(square);
  const matchingMove = legalMoves.find((move) => move.to === square);

  if (matchingMove) {
    commitMove(matchingMove);
    return;
  }

  if (occupant && occupant.color === chess.turn()) {
    selectSquare(square);
    syncUi();
    return;
  }

  clearSelection();
  syncUi();
}

scene.syncBoard(chess.board());
syncUi();
