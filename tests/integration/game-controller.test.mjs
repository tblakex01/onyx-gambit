import test from 'node:test';
import assert from 'node:assert/strict';
import { GameController } from '../../src/game-controller.js';
import { GAME_MODES, PLAYER_TYPES, createAiConfig, createClockConfig } from '../../src/game-types.js';

class FakeEngine {
  constructor() {
    this.statusListeners = new Set();
    this.bestMoveQueue = [];
  }

  onStatus(listener) {
    this.statusListeners.add(listener);
    listener({ phase: 'ready', error: null });
    return () => this.statusListeners.delete(listener);
  }

  emit(status) {
    this.statusListeners.forEach((listener) => listener(status));
  }

  async ensureReady() {
    this.emit({ phase: 'ready', error: null });
  }

  async newGame() {}

  async cancel() {
    if (this.pendingReject) {
      this.pendingReject(new Error('Engine request canceled.'));
      this.pendingReject = null;
      this.pendingResolve = null;
    }
  }

  enqueueBestMove(move, delayMs = 0) {
    this.bestMoveQueue.push({ move, delayMs });
  }

  async bestMove() {
    const next = this.bestMoveQueue.shift();
    if (!next) throw new Error('No queued engine move.');
    return new Promise((resolve, reject) => {
      this.pendingReject = reject;
      this.pendingResolve = resolve;
      setTimeout(() => {
        if (!this.pendingResolve) return;
        this.pendingReject = null;
        this.pendingResolve = null;
        resolve({ bestMove: next.move, ponder: null, lines: [] });
      }, next.delayMs);
    });
  }

  async analyze({ fen }) {
    return {
      fen,
      lines: [
        { multiPv: 1, scoreCp: 28, mate: null, pv: ['e2e4', 'e7e5', 'g1f3'] },
        { multiPv: 2, scoreCp: 18, mate: null, pv: ['d2d4', 'd7d5'] },
        { multiPv: 3, scoreCp: 11, mate: null, pv: ['c2c4', 'e7e5'] },
      ],
    };
  }
}

function createController(engine = new FakeEngine()) {
  const controller = new GameController({
    engineApi: engine,
    storageApi: {
      saveAutosave: async () => true,
      loadAutosave: async () => null,
      saveTextFile: async () => ({ canceled: false }),
      openTextFile: async () => ({ canceled: true, content: null }),
      copyText: async () => true,
    },
  });
  return { controller, engine };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('game mode transitions set the expected player types', async () => {
  const { controller } = createController();
  controller.setModeSetup({
    mode: GAME_MODES.PLAY_AI,
    humanColor: 'w',
    players: {
      white: { type: PLAYER_TYPES.HUMAN, ai: createAiConfig({ enabled: false }) },
      black: { type: PLAYER_TYPES.AI, ai: createAiConfig({ enabled: true }) },
    },
    clockConfig: createClockConfig({ preset: 'blitz' }),
  });

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.mode, GAME_MODES.PLAY_AI);
  assert.equal(snapshot.players.white.type, PLAYER_TYPES.HUMAN);
  assert.equal(snapshot.players.black.type, PLAYER_TYPES.AI);
  controller.destroy();
});

test('human move triggers AI response after board settle', async () => {
  const { controller, engine } = createController();
  engine.enqueueBestMove('e7e5');

  controller.setModeSetup({
    mode: GAME_MODES.PLAY_AI,
    humanColor: 'w',
    players: {
      white: { type: PLAYER_TYPES.HUMAN, ai: createAiConfig({ enabled: false }) },
      black: { type: PLAYER_TYPES.AI, ai: createAiConfig({ enabled: true, moveTimeMs: 100, depth: 8 }) },
    },
    autoplayDelayMs: 0,
  });

  controller.handleSquareClick('e2');
  controller.handleSquareClick('e4');
  assert.equal(controller.getSnapshot().history.length, 1);
  await controller.notifyBoardSettled();
  await delay(250);
  assert.equal(controller.getSnapshot().history.length, 2);
  assert.equal(controller.getSnapshot().history[1].san, 'e5');
  controller.destroy();
});

test('ai vs ai sequences moves and stale responses do not land after reset', async () => {
  const { controller, engine } = createController();
  const seenMoves = [];
  controller.subscribe((event) => {
    if (event.type === 'move') {
      seenMoves.push(event.detail.move.san);
      queueMicrotask(() => controller.notifyBoardSettled());
    }
  });

  engine.enqueueBestMove('e2e4');
  engine.enqueueBestMove('e7e5');
  engine.enqueueBestMove('g1f3');
  engine.enqueueBestMove('b8c6');

  controller.setModeSetup({
    mode: GAME_MODES.AI_PLAY,
    players: {
      white: { type: PLAYER_TYPES.AI, ai: createAiConfig({ enabled: true, moveTimeMs: 100, depth: 8 }) },
      black: { type: PLAYER_TYPES.AI, ai: createAiConfig({ enabled: true, moveTimeMs: 100, depth: 8 }) },
    },
    autoplayDelayMs: 0,
  });

  await controller.notifyBoardSettled();
  await delay(900);
  assert.equal(controller.getSnapshot().history.length >= 4, true);
  assert.deepEqual(seenMoves.slice(0, 4), ['e4', 'e5', 'Nf3', 'Nc6']);

  engine.enqueueBestMove('e7e5', 300);
  controller.setModeSetup({
    mode: GAME_MODES.PLAY_AI,
    humanColor: 'w',
    players: {
      white: { type: PLAYER_TYPES.HUMAN, ai: createAiConfig({ enabled: false }) },
      black: { type: PLAYER_TYPES.AI, ai: createAiConfig({ enabled: true, moveTimeMs: 100, depth: 8 }) },
    },
  });
  controller.handleSquareClick('d2');
  controller.handleSquareClick('d4');
  await controller.notifyBoardSettled();
  controller.restart();
  await delay(400);
  assert.equal(controller.getSnapshot().history.length, 0);
  controller.destroy();
});

test('completed games precompute full review annotations once analysis is enabled', async () => {
  const { controller } = createController();
  controller.setModeSetup({
    mode: GAME_MODES.HUMAN,
    players: {
      white: { type: PLAYER_TYPES.HUMAN, ai: createAiConfig({ enabled: false }) },
      black: { type: PLAYER_TYPES.HUMAN, ai: createAiConfig({ enabled: false }) },
    },
    analysisEnabled: true,
  });

  controller.handleSquareClick('f2');
  controller.handleSquareClick('f3');
  await controller.notifyBoardSettled();
  controller.handleSquareClick('e7');
  controller.handleSquareClick('e5');
  await controller.notifyBoardSettled();
  controller.handleSquareClick('g2');
  controller.handleSquareClick('g4');
  await controller.notifyBoardSettled();
  controller.handleSquareClick('d8');
  controller.handleSquareClick('h4');
  await controller.notifyBoardSettled();

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (controller.getSnapshot().analysis.reviewStatus === 'ready') break;
    await delay(50);
  }

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.result, 'Black wins');
  assert.equal(snapshot.analysis.reviewStatus, 'ready');
  assert.equal(snapshot.analysis.reviewProgress.completed, snapshot.history.length);
  assert.equal(snapshot.analysis.reviewAnnotations.length, snapshot.history.length + 1);
  assert.equal(snapshot.analysis.reviewAnnotations.slice(1).every(Boolean), true);
  assert.equal(snapshot.analysis.currentReview.moveIndex, snapshot.history.length);
  controller.destroy();
});

test('replay autoplay advances through recorded frames', async () => {
  const { controller } = createController();
  controller.setModeSetup({
    mode: GAME_MODES.HUMAN,
    autoplayDelayMs: 10,
  });

  controller.handleSquareClick('e2');
  controller.handleSquareClick('e4');
  await controller.notifyBoardSettled();
  controller.handleSquareClick('e7');
  controller.handleSquareClick('e5');
  await controller.notifyBoardSettled();

  controller.toggleReplayAutoplay();
  await delay(80);

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.replayState.index, snapshot.history.length);
  assert.equal(snapshot.replayState.autoplay, false);
  assert.equal(snapshot.inReplay, false);
  controller.destroy();
});

test('restoreAutosave falls back to a fresh game when the save is invalid', async () => {
  const controller = new GameController({
    engineApi: new FakeEngine(),
    storageApi: {
      saveAutosave: async () => true,
      loadAutosave: async () => '{',
      saveTextFile: async () => ({ canceled: false }),
      openTextFile: async () => ({ canceled: true, content: null }),
      copyText: async () => true,
    },
  });

  const originalWarn = console.warn;
  let restored;
  console.warn = () => {};
  try {
    restored = await controller.restoreAutosave();
  } finally {
    console.warn = originalWarn;
  }
  const snapshot = controller.getSnapshot();
  assert.equal(restored, false);
  assert.equal(snapshot.history.length, 0);
  assert.equal(snapshot.fen, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  controller.destroy();
});

test('loading finished FEN and PGN positions leaves the clock stopped', () => {
  const { controller } = createController();
  controller.setModeSetup({
    mode: GAME_MODES.HUMAN,
    clockConfig: createClockConfig({ preset: 'blitz' }),
  });

  controller.loadFen('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1');
  let snapshot = controller.getSnapshot();
  assert.match(snapshot.status, /Checkmate\./);
  assert.equal(snapshot.clockState.running, false);
  assert.equal(snapshot.clockState.activeColor, null);

  controller.importPgn('1. f3 e5 2. g4 Qh4#');
  snapshot = controller.getSnapshot();
  assert.match(snapshot.status, /Checkmate\./);
  assert.equal(snapshot.clockState.running, false);
  assert.equal(snapshot.clockState.activeColor, null);
  controller.destroy();
});
