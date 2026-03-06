import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/public-sans/400.css';
import '@fontsource/public-sans/500.css';
import '@fontsource/public-sans/700.css';
import './styles.css';
import { GameController } from './game-controller.js';
import {
  AI_DIFFICULTY_OPTIONS,
  CLOCK_PRESETS,
  GAME_MODES,
  PLAYER_TYPES,
  colorName,
  createAiConfig,
  createClockConfig,
} from './game-types.js';
import { createChessFromFen } from './persistence.js';
import { BoardScene } from './scene.js';

const refs = {
  selectionLabel: document.querySelector('#selection-label'),
  turnIndicator: document.querySelector('#turn-indicator'),
  statusLine: document.querySelector('#status-line'),
  moveCount: document.querySelector('#move-count'),
  moveList: document.querySelector('#move-list'),
  lastMove: document.querySelector('#last-move'),
  positionMeta: document.querySelector('#position-meta'),
  engineStatus: document.querySelector('#engine-status'),
  thinkingIndicator: document.querySelector('#thinking-indicator'),
  whiteClock: document.querySelector('#white-clock'),
  blackClock: document.querySelector('#black-clock'),
  replayStatus: document.querySelector('#replay-status'),
  analysisStatus: document.querySelector('#analysis-status'),
  analysisEval: document.querySelector('#analysis-eval'),
  analysisBest: document.querySelector('#analysis-best'),
  analysisClassification: document.querySelector('#analysis-classification'),
  analysisLine: document.querySelector('#analysis-line'),
  analysisLines: document.querySelector('#analysis-lines'),
  fenInput: document.querySelector('#fen-input'),
  humanColor: document.querySelector('#human-color'),
  clockPreset: document.querySelector('#clock-preset'),
  customInitialMinutes: document.querySelector('#custom-initial-minutes'),
  customIncrementSeconds: document.querySelector('#custom-increment-seconds'),
  whiteDifficulty: document.querySelector('#white-difficulty'),
  whiteMoveTime: document.querySelector('#white-move-time'),
  whiteDepth: document.querySelector('#white-depth'),
  blackDifficulty: document.querySelector('#black-difficulty'),
  blackMoveTime: document.querySelector('#black-move-time'),
  blackDepth: document.querySelector('#black-depth'),
  autoplayDelay: document.querySelector('#autoplay-delay'),
  analysisEnabled: document.querySelector('#analysis-enabled'),
  newGame: document.querySelector('#new-game'),
  restartGame: document.querySelector('#restart-game'),
  pauseGame: document.querySelector('#pause-game'),
  flipBoard: document.querySelector('#flip-board'),
  undoMove: document.querySelector('#undo-move'),
  resignGame: document.querySelector('#resign-game'),
  saveGame: document.querySelector('#save-game'),
  loadGame: document.querySelector('#load-game'),
  replayFirst: document.querySelector('#replay-first'),
  replayPrev: document.querySelector('#replay-prev'),
  replayNext: document.querySelector('#replay-next'),
  replayLast: document.querySelector('#replay-last'),
  replayAutoplay: document.querySelector('#replay-autoplay'),
  exportPgn: document.querySelector('#export-pgn'),
  importPgn: document.querySelector('#import-pgn'),
  copyFen: document.querySelector('#copy-fen'),
  loadFen: document.querySelector('#load-fen'),
  modeButtons: [...document.querySelectorAll('.mode-button')],
};

let currentMode = GAME_MODES.HUMAN;
let currentSnapshot = null;
let boardQueue = Promise.resolve();
let appInitialized = false;

function boardFromFen(fen) {
  return createChessFromFen(fen).board();
}

function chessFromFen(fen) {
  return createChessFromFen(fen);
}

function formatClock(ms) {
  if (!ms) return 'Untimed';
  const safe = Math.max(0, ms);
  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (safe < 60_000) {
    const tenths = Math.floor((safe % 1000) / 100);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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

function moveDescriptor(move) {
  if (!move) return 'Opening position';
  const suffix = move.san.includes('#') ? ' checkmate' : move.san.includes('+') ? ' check' : '';
  return `${move.san} (${move.from} -> ${move.to})${suffix}`;
}

function describePosition(chess) {
  if (chess.isCheckmate()) return 'Final position';
  if (chess.isStalemate()) return 'Stalemate net';
  if (chess.isThreefoldRepetition()) return 'Repeated position';
  if (chess.isInsufficientMaterial()) return 'Insufficient material';
  if (chess.isDrawByFiftyMoves()) return 'Fifty-move draw';
  return chess.isCheck() ? 'Pressure on the king' : 'Strategic equilibrium';
}

function formatEvaluation(line) {
  if (!line) return '-';
  if (typeof line.scoreCp === 'number') return `${line.scoreCp > 0 ? '+' : ''}${(line.scoreCp / 100).toFixed(2)}`;
  if (typeof line.mate === 'number') return `Mate ${line.mate > 0 ? '+' : ''}${line.mate}`;
  return '-';
}

function formatClassification(classification) {
  if (!classification) return '-';
  return classification[0].toUpperCase() + classification.slice(1);
}

function reviewBadgeTone(classification) {
  if (classification === 'best' || classification === 'excellent') return 'move-review-badge--positive';
  if (classification === 'good') return 'move-review-badge--neutral';
  return 'move-review-badge--danger';
}

function populateDifficultySelect(select) {
  select.replaceChildren(
    ...AI_DIFFICULTY_OPTIONS.map((option) => {
      const element = document.createElement('option');
      element.value = option.id;
      element.textContent = option.label;
      return element;
    }),
  );
  select.value = '4';
}

function createTextNode(tagName, text, className = '') {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function createMoveListItem(move, plyIndex, isCurrent, review) {
  const item = document.createElement('li');
  item.className = `move-pill${isCurrent ? ' is-current' : ''}`;
  item.append(
    createTextNode('span', `${plyIndex}.`),
    createTextNode('strong', move.san),
    createTextNode('span', `${move.from} → ${move.to}`),
  );
  if (review) {
    const badge = createTextNode(
      'span',
      formatClassification(review.classification),
      `move-review-badge ${reviewBadgeTone(review.classification)}`,
    );
    item.append(badge);
  }
  return item;
}

function createAnalysisLineItem(line, index) {
  const item = document.createElement('li');
  item.className = 'line-pill';
  item.append(
    createTextNode('strong', `#${index + 1} ${formatEvaluation(line)}`),
    createTextNode('small', line.pv?.slice(0, 8).join(' ') ?? ''),
  );
  return item;
}

populateDifficultySelect(refs.whiteDifficulty);
populateDifficultySelect(refs.blackDifficulty);

const scene = new BoardScene(document.querySelector('#board-canvas'), {
  onSquareClick: (square) => controller.handleSquareClick(square),
});

const controller = new GameController({
  engineApi: window.chessBridge.engine,
  storageApi: window.chessBridge.storage,
});

function queueBoard(task) {
  boardQueue = boardQueue.then(task).catch((error) => {
    console.error(error);
  });
  return boardQueue;
}

function updateModeButtons() {
  refs.modeButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.mode === currentMode);
  });
}

function syncFormAvailability() {
  const preset = refs.clockPreset.value;
  const isCustomClock = preset === 'custom';
  refs.customInitialMinutes.disabled = !isCustomClock;
  refs.customIncrementSeconds.disabled = !isCustomClock;
  refs.humanColor.disabled = currentMode !== GAME_MODES.PLAY_AI;
}

function inferHumanColor(snapshot) {
  if (snapshot.mode !== GAME_MODES.PLAY_AI) return 'w';
  return snapshot.players.white.type === PLAYER_TYPES.HUMAN ? 'w' : 'b';
}

function applySnapshotToForm(snapshot) {
  currentMode = snapshot.mode;
  refs.humanColor.value = inferHumanColor(snapshot);
  refs.clockPreset.value = snapshot.clockConfig.preset;
  refs.customInitialMinutes.value = String(Math.max(1, Math.round(snapshot.clockConfig.initialMs / 60_000) || 5));
  refs.customIncrementSeconds.value = String(Math.round(snapshot.clockConfig.incrementMs / 1000));
  refs.whiteDifficulty.value = snapshot.players.white.ai.difficultyId;
  refs.whiteMoveTime.value = String(snapshot.players.white.ai.moveTimeMs ?? 900);
  refs.whiteDepth.value = String(snapshot.players.white.ai.depth ?? 14);
  refs.blackDifficulty.value = snapshot.players.black.ai.difficultyId;
  refs.blackMoveTime.value = String(snapshot.players.black.ai.moveTimeMs ?? 900);
  refs.blackDepth.value = String(snapshot.players.black.ai.depth ?? 14);
  refs.autoplayDelay.value = String(snapshot.autoplayDelayMs || 650);
  refs.analysisEnabled.checked = snapshot.analysis.enabled;
  updateModeButtons();
  syncFormAvailability();
}

function buildClockConfig() {
  if (refs.clockPreset.value === 'custom') {
    return createClockConfig({
      preset: 'custom',
      initialMs: Number(refs.customInitialMinutes.value || 5) * 60_000,
      incrementMs: Number(refs.customIncrementSeconds.value || 0) * 1_000,
    });
  }
  return createClockConfig({ preset: refs.clockPreset.value });
}

function buildAiConfig(side) {
  const difficulty = side === 'white' ? refs.whiteDifficulty.value : refs.blackDifficulty.value;
  const moveTime = side === 'white' ? refs.whiteMoveTime.value : refs.blackMoveTime.value;
  const depth = side === 'white' ? refs.whiteDepth.value : refs.blackDepth.value;
  return createAiConfig({
    enabled: true,
    difficultyId: difficulty,
    moveTimeMs: Number(moveTime),
    depth: Number(depth),
  });
}

function buildSetupFromForm() {
  const humanColor = refs.humanColor.value;
  const whiteAi = buildAiConfig('white');
  const blackAi = buildAiConfig('black');
  if (currentMode === GAME_MODES.HUMAN) {
    whiteAi.enabled = false;
    blackAi.enabled = false;
  }
  if (currentMode === GAME_MODES.PLAY_AI) {
    whiteAi.enabled = humanColor !== 'w';
    blackAi.enabled = humanColor !== 'b';
  }
  if (currentMode === GAME_MODES.AI_PLAY) {
    whiteAi.enabled = true;
    blackAi.enabled = true;
  }

  return {
    mode: currentMode,
    humanColor,
    players: {
      white: {
        type: whiteAi.enabled ? PLAYER_TYPES.AI : PLAYER_TYPES.HUMAN,
        ai: whiteAi,
      },
      black: {
        type: blackAi.enabled ? PLAYER_TYPES.AI : PLAYER_TYPES.HUMAN,
        ai: blackAi,
      },
    },
    clockConfig: buildClockConfig(),
    autoplayDelayMs: Number(refs.autoplayDelay.value || 650),
    analysisEnabled: refs.analysisEnabled.checked,
  };
}

function lastMoveForDisplay(snapshot) {
  if (snapshot.inReplay && snapshot.replayState.index > 0) {
    return snapshot.replayFrames[snapshot.replayState.index]?.move ?? null;
  }
  return snapshot.history.at(-1) ?? null;
}

function updateDebugSurface(snapshot) {
  const displayChess = chessFromFen(snapshot.displayFen);
  window.__chessDebug = {
    ready: appInitialized,
    getState: () => ({
      fen: snapshot.displayFen,
      liveFen: snapshot.fen,
      turn: displayChess.turn(),
      history: snapshot.history,
      selectedSquare: snapshot.selectedSquare,
      status: snapshot.status,
      checkmate: displayChess.isCheckmate(),
      mode: snapshot.mode,
      aiThinkingColor: snapshot.aiThinkingColor,
      inReplay: snapshot.inReplay,
      analysis: snapshot.analysis,
      replayState: snapshot.replayState,
    }),
    getSquareScreenPoint: (square) => scene.getSquareScreenPoint(square),
    pieceAt: (square) => displayChess.get(square) ?? null,
  };
  window.render_game_to_text = () =>
    JSON.stringify({
      mode: snapshot.mode,
      displayFen: snapshot.displayFen,
      turn: displayChess.turn(),
      result: snapshot.result,
      aiThinkingColor: snapshot.aiThinkingColor,
      replayIndex: snapshot.replayState.index,
      clocks: snapshot.clockState,
    });
  window.advanceTime = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
}

function renderMoveList(snapshot) {
  const currentIndex = snapshot.inReplay ? snapshot.replayState.index : snapshot.history.length;
  refs.moveList.replaceChildren(
    ...snapshot.history.map((move, index) => {
      const plyIndex = index + 1;
      return createMoveListItem(
        move,
        plyIndex,
        plyIndex === currentIndex,
        snapshot.analysis.reviewAnnotations?.[plyIndex] ?? null,
      );
    }),
  );
}

function renderAnalysis(snapshot) {
  const currentReview = snapshot.analysis.currentReview;
  const lines = snapshot.analysis.lastLive?.lines ?? [];
  refs.analysisStatus.textContent = snapshot.analysis.enabled
    ? snapshot.analysis.reviewStatus === 'loading'
      ? `Reviewing ${snapshot.analysis.reviewProgress.completed}/${snapshot.analysis.reviewProgress.total}`
      : snapshot.analysis.reviewStatus === 'error'
        ? 'Review error'
        : snapshot.analysis.status === 'ready'
          ? 'Live'
          : snapshot.analysis.status === 'loading'
            ? 'Analyzing'
            : snapshot.analysis.status
    : 'Disabled';
  refs.analysisEval.textContent = formatEvaluation(lines[0]);
  refs.analysisBest.textContent = lines[0]?.pv?.[0] ?? currentReview?.bestMove ?? '-';
  refs.analysisLine.textContent = lines[0]?.pv?.slice(0, 6).join(' ') ?? currentReview?.bestLine?.join(' ') ?? '-';
  refs.analysisClassification.textContent = currentReview
    ? `${formatClassification(currentReview.classification)} (${currentReview.swingCp} cp)`
    : snapshot.analysis.reviewStatus === 'loading'
      ? 'Pending full review'
      : '-';
  refs.analysisLines.replaceChildren(...lines.map((line, index) => createAnalysisLineItem(line, index)));
}

function renderSnapshot(snapshot) {
  currentSnapshot = snapshot;
  currentMode = snapshot.mode;
  const displayChess = chessFromFen(snapshot.displayFen);
  const selectedPiece = snapshot.selectedSquare ? displayChess.get(snapshot.selectedSquare) : null;
  const lastMove = lastMoveForDisplay(snapshot);
  const thinkingText = snapshot.pendingBoardSettle
    ? 'Pieces settling'
    : snapshot.aiThinkingColor
      ? `${colorName(snapshot.aiThinkingColor)} AI thinking`
      : snapshot.gamePaused
        ? 'Game paused'
        : snapshot.inReplay
          ? `Replay move ${snapshot.replayState.index}/${snapshot.history.length}`
          : 'Waiting for input';

  refs.turnIndicator.textContent = snapshot.result ?? `${colorName(displayChess.turn())} move`;
  refs.statusLine.textContent = snapshot.status;
  refs.selectionLabel.textContent = selectedPiece
    ? `${colorName(selectedPiece.color)} ${pieceName(selectedPiece.type)} on ${snapshot.selectedSquare}`
    : snapshot.inReplay
      ? `Reviewing ply ${snapshot.replayState.index}`
      : 'No piece selected';
  refs.moveCount.textContent = `${snapshot.history.length} plies`;
  refs.lastMove.textContent = moveDescriptor(lastMove);
  refs.positionMeta.textContent = describePosition(displayChess);
  refs.engineStatus.textContent = snapshot.engine.error
    ? `Engine ${snapshot.engine.phase} · ${snapshot.engine.error}`
    : `Engine ${snapshot.engine.phase}`;
  refs.thinkingIndicator.textContent = thinkingText;
  refs.whiteClock.textContent = formatClock(snapshot.clockState.whiteMs);
  refs.blackClock.textContent = formatClock(snapshot.clockState.blackMs);
  refs.replayStatus.textContent = snapshot.inReplay
    ? `Replay ${snapshot.replayState.index}/${snapshot.history.length}`
    : 'Live board';
  refs.pauseGame.textContent = snapshot.gamePaused ? 'Resume' : 'Pause';
  refs.replayAutoplay.textContent = snapshot.replayState.autoplay ? 'Stop replay' : 'Autoplay replay';
  refs.undoMove.disabled = snapshot.history.length === 0 || snapshot.pendingBoardSettle;
  refs.resignGame.disabled = Boolean(snapshot.result);
  refs.pauseGame.disabled = Boolean(snapshot.result);
  refs.replayFirst.disabled = snapshot.replayState.index === 0;
  refs.replayPrev.disabled = snapshot.replayState.index === 0;
  refs.replayNext.disabled = snapshot.replayState.index >= snapshot.history.length;
  refs.replayLast.disabled = snapshot.replayState.index >= snapshot.history.length && !snapshot.inReplay;

  renderMoveList(snapshot);
  renderAnalysis(snapshot);
  scene.setHighlights({
    selectedSquare: snapshot.selectedSquare,
    legalTargets: snapshot.legalTargets,
    lastMove,
  });
  updateModeButtons();
  syncFormAvailability();
  updateDebugSurface(snapshot);
}

async function syncBoardToFen(fen) {
  scene.syncBoard(boardFromFen(fen));
  await scene.waitForIdle();
  await controller.notifyBoardSettled();
}

async function animateBoardMove(detail) {
  scene.animateMove(detail.move, boardFromFen(detail.displayFen));
  await scene.waitForIdle();
  await controller.notifyBoardSettled();
}

controller.subscribe((event) => {
  renderSnapshot(event.snapshot);
  if (event.type === 'move') queueBoard(() => animateBoardMove(event.detail));
  if (event.type === 'board-sync') {
    applySnapshotToForm(event.snapshot);
    queueBoard(() => syncBoardToFen(event.detail.displayFen));
  }
});

await controller.restoreAutosave();
const initialSnapshot = controller.getSnapshot();
applySnapshotToForm(initialSnapshot);
await queueBoard(() => syncBoardToFen(initialSnapshot.displayFen));
appInitialized = true;
renderSnapshot(controller.getSnapshot());

refs.modeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    currentMode = button.dataset.mode;
    updateModeButtons();
    syncFormAvailability();
  });
});

refs.clockPreset.addEventListener('change', syncFormAvailability);
refs.analysisEnabled.addEventListener('change', () => controller.setAnalysisEnabled(refs.analysisEnabled.checked));
refs.newGame.addEventListener('click', () => controller.setModeSetup(buildSetupFromForm()));
refs.restartGame.addEventListener('click', () => controller.restart());
refs.pauseGame.addEventListener('click', () => controller.setPaused(!currentSnapshot?.gamePaused));
refs.flipBoard.addEventListener('click', () => scene.flipCamera());
refs.undoMove.addEventListener('click', () => controller.undo());
refs.resignGame.addEventListener('click', () => controller.resign());
refs.saveGame.addEventListener('click', () => controller.saveGame());
refs.loadGame.addEventListener('click', async () => {
  const loaded = await controller.loadGameFromDisk();
  if (loaded) applySnapshotToForm(controller.getSnapshot());
});
refs.replayFirst.addEventListener('click', () => controller.replayFirst());
refs.replayPrev.addEventListener('click', () => controller.replayPrevious());
refs.replayNext.addEventListener('click', () => controller.replayNext());
refs.replayLast.addEventListener('click', () => controller.replayLast());
refs.replayAutoplay.addEventListener('click', () => controller.toggleReplayAutoplay());
refs.exportPgn.addEventListener('click', () => controller.exportPgn());
refs.importPgn.addEventListener('click', async () => {
  const imported = await controller.importPgnFromDisk();
  if (imported) applySnapshotToForm(controller.getSnapshot());
});
refs.copyFen.addEventListener('click', () => controller.copyFen());
refs.loadFen.addEventListener('click', () => {
  if (!refs.fenInput.value.trim()) return;
  controller.loadFenFromPrompt(refs.fenInput.value.trim());
});
