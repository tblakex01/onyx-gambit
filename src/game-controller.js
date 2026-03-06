import { Chess } from 'chess.js';
import { ChessClock } from './clock.js';
import {
  DEFAULT_ANALYSIS_TIME_MS,
  DEFAULT_AUTOPLAY_DELAY_MS,
  DEFAULT_REVIEW_TIME_MS,
  ENGINE_PHASES,
  GAME_MODES,
  PLAYER_TYPES,
  cloneJson,
  colorName,
  createClockConfig,
  createDefaultSetup,
  playerSideKey,
} from './game-types.js';
import {
  createChessFromFen,
  createReplayFramesFromHistory,
  deserializeSavedGame,
  parseFenText,
  parsePgnText,
  serializeSavedGame,
} from './persistence.js';
import { buildReviewAnnotation, createReviewCache } from './review.js';

function describeStatus(chess, resultOverride, clockFlaggedColor) {
  if (resultOverride) return resultOverride;
  if (clockFlaggedColor) {
    return `${colorName(clockFlaggedColor === 'w' ? 'b' : 'w')} wins on time.`;
  }
  if (chess.isCheckmate()) {
    return `Checkmate. ${colorName(chess.turn() === 'w' ? 'b' : 'w')} wins.`;
  }
  if (chess.isStalemate()) return 'Draw by stalemate.';
  if (chess.isInsufficientMaterial()) return 'Draw by insufficient material.';
  if (chess.isThreefoldRepetition()) return 'Draw by repetition.';
  if (chess.isDrawByFiftyMoves()) return 'Draw by the fifty-move rule.';
  return `${colorName(chess.turn())} to move${chess.isCheck() ? '. King is in check.' : '.'}`;
}

function describeResult(chess, resultOverride, clockFlaggedColor) {
  if (resultOverride) return resultOverride;
  if (clockFlaggedColor) return `${colorName(clockFlaggedColor === 'w' ? 'b' : 'w')} wins on time`;
  if (chess.isCheckmate()) return `${colorName(chess.turn() === 'w' ? 'b' : 'w')} wins`;
  if (chess.isDraw()) return 'Draw';
  return null;
}

export class GameController {
  constructor({ engineApi, storageApi }) {
    this.engineApi = engineApi;
    this.storageApi = storageApi;
    this.listeners = new Set();
    this.clock = new ChessClock();
    this.analysisToken = 0;
    this.reviewToken = 0;
    this.aiToken = 0;
    this.sessionId = 0;
    this.enginePhase = ENGINE_PHASES.IDLE;
    this.engineError = null;
    this.aiTimer = null;
    this.replayTimer = null;
    this.tickTimer = globalThis.setInterval(() => this.onTick(), 200);
    this.startNewGame(createDefaultSetup());
    this.attachEngineStatus();
  }

  destroy() {
    this.cancelAi();
    this.stopReplayAutoplay();
    globalThis.clearInterval(this.tickTimer);
  }

  attachEngineStatus() {
    if (!this.engineApi?.onStatus) return;
    this.engineApi.onStatus((status) => {
      this.enginePhase = status.phase ?? ENGINE_PHASES.IDLE;
      this.engineError = status.error ?? null;
      this.emit('state');
    });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener({ type: 'state', snapshot: this.getSnapshot() });
    return () => this.listeners.delete(listener);
  }

  emit(type, detail = null) {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener({ type, detail, snapshot }));
  }

  onTick() {
    const flagged = this.clock.tick();
    if (flagged) {
      this.cancelAi();
      this.stopReplayAutoplay();
      this.emit('state');
      void this.runAnalysisForCurrentPosition();
      this.persistAutosave();
      return;
    }
    if (this.clock.isEnabled() && this.clock.running) this.emit('state');
  }

  startNewGame(setupOverrides = {}) {
    this.sessionId += 1;
    this.cancelAi();
    this.stopReplayAutoplay();
    this.analysisToken += 1;
    this.reviewToken += 1;
    this.engineApi?.cancel?.().catch(() => {});
    this.pendingBoardSettle = false;
    this.chess = new Chess();
    this.setup = createDefaultSetup(setupOverrides);
    this.mode = this.setup.mode;
    this.players = cloneJson(this.setup.players);
    this.autoplayDelayMs = this.setup.autoplayDelayMs ?? DEFAULT_AUTOPLAY_DELAY_MS;
    this.selectedSquare = null;
    this.legalMoves = [];
    this.manualResult = null;
    this.gamePaused = false;
    this.analysis = {
      enabled: this.setup.analysisEnabled,
      status: 'idle',
      live: null,
      review: createReviewCache(),
    };
    this.rebuildReplay(false, this.autoplayDelayMs);
    this.clock.configure(createClockConfig(this.setup.clockConfig));
    this.clock.start(this.chess.turn());
    this.emit('board-sync', { displayFen: this.getDisplayFen() });
    this.persistAutosave();
  }

  restart() {
    this.startNewGame(this.setup);
  }

  createAnalysisState(enabled, reviewAnnotations = []) {
    return {
      enabled,
      status: 'idle',
      live: null,
      review: createReviewCache(this.chess.history().length, reviewAnnotations),
    };
  }

  getDisplayFrameIndex() {
    return this.replay.active ? this.replay.index : this.chess.history().length;
  }

  getCurrentReviewAnnotation() {
    const frameIndex = this.getDisplayFrameIndex();
    if (frameIndex <= 0) return null;
    return this.analysis.review.annotations[frameIndex] ?? null;
  }

  canRunPostGameReview() {
    return this.analysis.enabled && this.isGameOver() && this.chess.history().length > 0;
  }

  cancelReview({ preserveComputed = true, cancelEngine = false } = {}) {
    this.reviewToken += 1;
    const totalMoves = this.chess.history().length;
    const cache = createReviewCache(totalMoves, preserveComputed ? this.analysis?.review?.annotations ?? [] : []);
    if (preserveComputed) {
      cache.positionAnalyses = Array.from(
        { length: totalMoves + 1 },
        (_, index) => this.analysis?.review?.positionAnalyses?.[index] ?? null,
      );
    }
    this.analysis.review = cache;
    if (cancelEngine) this.engineApi?.cancel?.().catch(() => {});
  }

  async restoreAutosave() {
    if (!this.storageApi?.loadAutosave) return false;
    const raw = await this.storageApi.loadAutosave();
    if (!raw) return false;
    try {
      this.loadSavedGame(raw);
      return true;
    } catch (error) {
      console.warn('Failed to restore autosave, starting a fresh game instead.', error);
      return false;
    }
  }

  getCurrentPlayer(color = this.chess.turn()) {
    return this.players[playerSideKey(color)];
  }

  isGameOver() {
    return Boolean(this.manualResult || this.clock.snapshot().flaggedColor || this.chess.isGameOver());
  }

  canInteract() {
    return !this.isGameOver() && !this.gamePaused && !this.replay.active && !this.pendingBoardSettle && !this.aiThinkingColor;
  }

  clearSelection() {
    this.selectedSquare = null;
    this.legalMoves = [];
  }

  selectSquare(square) {
    this.selectedSquare = square;
    this.legalMoves = this.chess.moves({ square, verbose: true });
    this.emit('state');
  }

  handleSquareClick(square) {
    if (!this.canInteract()) return null;

    const occupant = this.chess.get(square);
    const matchingMove = this.legalMoves.find((move) => move.to === square);
    if (matchingMove) return this.commitMove(matchingMove, 'human');

    if (occupant && occupant.color === this.chess.turn() && this.getCurrentPlayer().type === PLAYER_TYPES.HUMAN) {
      this.selectSquare(square);
      return null;
    }

    this.clearSelection();
    this.emit('state');
    return null;
  }

  commitMove(move, actor) {
    if (this.replay.active) return null;
    const applied = this.chess.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion ?? 'q',
    });
    if (!applied) return null;

    const previousColor = applied.color;
    this.clearSelection();
    if (this.isGameOver()) {
      this.clock.stop();
    } else {
      this.clock.switchTurn(this.chess.turn(), previousColor);
    }

    this.pendingBoardSettle = true;
    this.rebuildReplay(false, this.autoplayDelayMs);
    this.analysisToken += 1;
    this.cancelReview({ preserveComputed: false, cancelEngine: true });
    this.analysis.live = null;
    this.analysis.status = 'idle';
    this.emit('move', {
      move: applied,
      actor,
      displayFen: this.getDisplayFen(),
    });
    this.persistAutosave();
    return applied;
  }

  async notifyBoardSettled() {
    this.pendingBoardSettle = false;
    this.emit('state');
    if (this.replay.active || this.gamePaused || this.isGameOver()) {
      this.runAnalysisForCurrentPosition();
      return;
    }
    await this.maybeRequestAiMove();
    this.runAnalysisForCurrentPosition();
  }

  async maybeRequestAiMove() {
    const side = this.chess.turn();
    if (this.pendingBoardSettle || this.gamePaused || this.replay.active || this.isGameOver()) return;
    const player = this.getCurrentPlayer(side);
    if (!player || player.type !== PLAYER_TYPES.AI) return;
    const requestSession = this.sessionId;
    const requestToken = ++this.aiToken;
    const fen = this.chess.fen();
    const delay = this.mode === GAME_MODES.AI_PLAY ? this.autoplayDelayMs : 180;
    this.aiThinkingColor = side;
    this.emit('state');
    globalThis.clearTimeout(this.aiTimer);
    this.aiTimer = globalThis.setTimeout(async () => {
      try {
        await this.engineApi.ensureReady();
        if (requestSession !== this.sessionId || requestToken !== this.aiToken || this.gamePaused || this.replay.active) return;
        const result = await this.engineApi.bestMove({
          fen,
          skillLevel: player.ai.skillLevel,
          moveTimeMs: player.ai.moveTimeMs,
          depth: player.ai.depth,
        });
        if (requestSession !== this.sessionId || requestToken !== this.aiToken) return;
        const move = this.findMoveFromUci(result?.bestMove);
        if (!move) throw new Error(`Engine returned illegal move: ${result?.bestMove ?? 'unknown'}`);
        this.aiThinkingColor = null;
        this.commitMove(move, 'ai');
      } catch (error) {
        if (!/cancel/i.test(String(error?.message ?? ''))) {
          this.engineError = error.message;
        }
        this.aiThinkingColor = null;
        this.emit('state');
      }
    }, delay);
  }

  findMoveFromUci(uciMove) {
    if (!uciMove || uciMove === '(none)') return null;
    const verboseMoves = this.chess.moves({ verbose: true });
    return (
      verboseMoves.find((move) => `${move.from}${move.to}${move.promotion ?? ''}` === uciMove.toLowerCase()) ?? null
    );
  }

  cancelAi() {
    this.aiToken += 1;
    this.aiThinkingColor = null;
    globalThis.clearTimeout(this.aiTimer);
    this.engineApi?.cancel?.().catch(() => {});
  }

  undo() {
    this.cancelAi();
    this.stopReplayAutoplay();
    const plies = this.mode === GAME_MODES.HUMAN ? 1 : Math.min(2, this.chess.history().length);
    if (!plies) return;
    for (let index = 0; index < plies; index += 1) this.chess.undo();
    this.clearSelection();
    this.manualResult = null;
    this.pendingBoardSettle = false;
    this.clock.configure(this.setup.clockConfig);
    this.clock.start(this.chess.turn());
    this.analysisToken += 1;
    this.cancelReview({ preserveComputed: false, cancelEngine: true });
    this.analysis.live = null;
    this.analysis.status = 'idle';
    this.rebuildReplay(false);
    this.emit('board-sync', { displayFen: this.getDisplayFen() });
    this.persistAutosave();
  }

  syncClockToCurrentPosition() {
    this.clock.configure(this.setup.clockConfig);
    if (this.isGameOver()) {
      this.clock.stop();
      return;
    }
    this.clock.start(this.chess.turn());
  }

  resign(color = this.chess.turn()) {
    if (this.isGameOver()) return;
    this.manualResult = `${colorName(color === 'w' ? 'b' : 'w')} wins by resignation.`;
    this.cancelAi();
    this.clock.stop();
    this.emit('state');
    void this.runAnalysisForCurrentPosition();
    this.persistAutosave();
  }

  setPaused(paused) {
    this.gamePaused = paused;
    if (paused) {
      this.cancelAi();
      this.clock.pause();
    } else if (!this.replay.active && !this.isGameOver()) {
      this.clock.resume();
      this.notifyBoardSettled();
    }
    this.emit('state');
  }

  setModeSetup(setupOverrides) {
    this.startNewGame(setupOverrides);
  }

  setAnalysisEnabled(enabled) {
    this.analysis.enabled = enabled;
    this.analysisToken += 1;
    if (!enabled) {
      this.analysis.status = 'idle';
      this.analysis.live = null;
      this.cancelReview({ preserveComputed: true, cancelEngine: true });
    } else {
      void this.runAnalysisForCurrentPosition();
    }
    this.emit('state');
  }

  async runAnalysisForCurrentPosition() {
    if (!this.analysis.enabled || this.aiThinkingColor || this.pendingBoardSettle) return;
    const frameIndex = this.getDisplayFrameIndex();
    const cachedLive = this.analysis.review.positionAnalyses[frameIndex] ?? null;
    if (cachedLive) {
      this.analysis.live = cachedLive;
      this.analysis.status = 'ready';
      this.emit('state');
      if (this.canRunPostGameReview()) void this.ensurePostGameReview();
      return;
    }
    if (this.canRunPostGameReview() && this.analysis.review.status === 'loading') {
      this.analysis.status = 'loading';
      this.emit('state');
      return;
    }

    const token = ++this.analysisToken;
    this.analysis.status = 'loading';
    this.emit('state');

    try {
      const live = await this.engineApi.analyze({
        fen: this.getDisplayFen(),
        moveTimeMs: DEFAULT_ANALYSIS_TIME_MS,
        multiPv: 3,
      });
      if (token !== this.analysisToken) return;
      this.analysis.live = live;
      this.analysis.status = 'ready';
      this.emit('state');
      if (this.canRunPostGameReview()) void this.ensurePostGameReview();
    } catch (error) {
      if (token !== this.analysisToken || /cancel/i.test(String(error?.message ?? ''))) return;
      this.analysis.status = 'error';
      this.engineError = error.message;
      this.emit('state');
    }
  }

  async ensurePostGameReview() {
    if (!this.canRunPostGameReview()) return;
    const totalMoves = this.chess.history().length;
    if (this.analysis.review.status === 'loading') return;
    if (
      this.analysis.review.status === 'ready' &&
      this.analysis.review.progress.total === totalMoves &&
      this.analysis.review.progress.completed === totalMoves
    ) {
      return;
    }

    const token = ++this.reviewToken;
    const annotations = Array.from({ length: totalMoves + 1 }, () => null);
    const positionAnalyses = Array.from({ length: totalMoves + 1 }, () => null);
    this.analysis.review = {
      status: 'loading',
      progress: { completed: 0, total: totalMoves },
      error: null,
      annotations,
      positionAnalyses,
    };
    this.emit('state');

    try {
      let previousAnalysis = await this.engineApi.analyze({
        fen: this.replay.frames[0].fen,
        moveTimeMs: DEFAULT_REVIEW_TIME_MS,
        multiPv: totalMoves > 1 ? 3 : 1,
      });
      if (token !== this.reviewToken) return;
      positionAnalyses[0] = previousAnalysis;
      if (this.getDisplayFrameIndex() === 0) {
        this.analysis.live = previousAnalysis;
        this.analysis.status = 'ready';
        this.emit('state');
      }

      for (let reviewIndex = 1; reviewIndex <= totalMoves; reviewIndex += 1) {
        const currentAnalysis = await this.engineApi.analyze({
          fen: this.replay.frames[reviewIndex].fen,
          moveTimeMs: DEFAULT_REVIEW_TIME_MS,
          multiPv: reviewIndex < totalMoves ? 3 : 1,
        });
        if (token !== this.reviewToken) return;
        positionAnalyses[reviewIndex] = currentAnalysis;
        annotations[reviewIndex] = buildReviewAnnotation({
          beforeAnalysis: previousAnalysis,
          afterAnalysis: currentAnalysis,
          playedFrame: this.replay.frames[reviewIndex],
        });
        this.analysis.review.progress = { completed: reviewIndex, total: totalMoves };
        if (this.getDisplayFrameIndex() === reviewIndex) {
          this.analysis.live = currentAnalysis;
          this.analysis.status = 'ready';
        }
        previousAnalysis = currentAnalysis;
        this.emit('state');
      }

      if (token !== this.reviewToken) return;
      this.analysis.review.status = 'ready';
      this.analysis.review.error = null;
      this.emit('state');
      await this.persistAutosave();
    } catch (error) {
      if (token !== this.reviewToken || /cancel/i.test(String(error?.message ?? ''))) return;
      this.analysis.review.status = 'error';
      this.analysis.review.error = error.message;
      this.emit('state');
    }
  }

  rebuildReplay(active, delayMs = this.replay?.delayMs ?? this.autoplayDelayMs ?? 900) {
    this.replay = {
      active,
      index: this.chess.history().length,
      autoplay: false,
      delayMs,
      frames: createReplayFramesFromHistory(this.chess.history({ verbose: true })),
    };
  }

  getDisplayFen() {
    return this.replay.active ? this.replay.frames[this.replay.index].fen : this.chess.fen();
  }

  jumpToReplay(index, { preserveAutoplay = false } = {}) {
    const nextIndex = Math.max(0, Math.min(index, this.replay.frames.length - 1));
    this.cancelAi();
    if (!preserveAutoplay) this.stopReplayAutoplay();
    this.analysisToken += 1;
    this.replay.index = nextIndex;
    this.replay.active = nextIndex < this.replay.frames.length - 1;
    if (this.replay.active) {
      this.clock.pause();
    } else if (!this.gamePaused && !this.isGameOver()) {
      this.clock.resume();
    }
    this.clearSelection();
    this.emit('board-sync', { displayFen: this.getDisplayFen() });
    void this.runAnalysisForCurrentPosition();
  }

  replayFirst() {
    this.jumpToReplay(0);
  }

  replayPrevious() {
    this.jumpToReplay(this.replay.index - 1);
  }

  replayNext() {
    this.jumpToReplay(this.replay.index + 1);
  }

  replayLast() {
    this.jumpToReplay(this.replay.frames.length - 1);
  }

  toggleReplayAutoplay() {
    if (this.replay.autoplay) {
      this.stopReplayAutoplay();
      this.emit('state');
      return;
    }
    this.replay.autoplay = true;
    this.jumpToReplay(this.replay.active ? this.replay.index : 0, { preserveAutoplay: true });
    this.scheduleReplayTick();
    this.emit('state');
  }

  scheduleReplayTick() {
    if (!this.replay.autoplay) return;
    globalThis.clearTimeout(this.replayTimer);
    this.replayTimer = globalThis.setTimeout(() => {
      if (this.replay.index >= this.replay.frames.length - 1) {
        this.stopReplayAutoplay();
        this.emit('state');
        return;
      }
      this.replay.index += 1;
      this.replay.active = this.replay.index < this.replay.frames.length - 1;
      this.emit('board-sync', { displayFen: this.getDisplayFen() });
      void this.runAnalysisForCurrentPosition();
      this.scheduleReplayTick();
    }, this.replay.delayMs);
  }

  stopReplayAutoplay() {
    this.replay = this.replay ?? { active: false, index: 0, autoplay: false, delayMs: 900, frames: [] };
    this.replay.autoplay = false;
    globalThis.clearTimeout(this.replayTimer);
  }

  async saveGame() {
    const payload = serializeSavedGame(this.getSnapshot());
    const content = JSON.stringify(payload, null, 2);
    await this.storageApi.saveTextFile({
      title: 'Save Chess Game',
      defaultPath: 'onyx-gambit.game.json',
      filters: [{ name: 'Onyx Gambit Save', extensions: ['json'] }],
      content,
    });
    await this.persistAutosave();
  }

  async loadGameFromDisk() {
    const loaded = await this.storageApi.openTextFile({
      title: 'Load Chess Game',
      filters: [{ name: 'Glass Chess Save', extensions: ['json'] }],
    });
    if (!loaded?.content) return false;
    this.loadSavedGame(loaded.content);
    return true;
  }

  loadSavedGame(raw) {
    this.cancelAi();
    this.stopReplayAutoplay();
    this.analysisToken += 1;
    this.reviewToken += 1;
    this.engineApi?.cancel?.().catch(() => {});
    const saved = deserializeSavedGame(raw);
    this.sessionId += 1;
    this.setup = createDefaultSetup({
      mode: saved.mode,
      players: saved.players,
      clockConfig: saved.clockConfig,
      analysisEnabled: saved.analysis.enabled,
      autoplayDelayMs: saved.replayState.delayMs,
    });
    this.mode = saved.mode;
    this.players = cloneJson(saved.players);
    this.autoplayDelayMs = saved.replayState.delayMs;
    this.chess = new Chess();
    this.chess.loadPgn(saved.pgn);
    this.selectedSquare = null;
    this.legalMoves = [];
    this.manualResult = saved.result?.includes('wins by resignation') ? saved.result : null;
    this.gamePaused = false;
    this.analysis = this.createAnalysisState(saved.analysis.enabled, saved.analysis.reviewAnnotations ?? []);
    this.analysis.live = saved.analysis.lastLive ?? null;
    this.rebuildReplay(saved.replayState.active, saved.replayState.delayMs);
    this.replay.index = Math.max(0, Math.min(saved.replayState.index, this.replay.frames.length - 1));
    this.replay.delayMs = saved.replayState.delayMs;
    this.replay.autoplay = false;
    this.clock.hydrate(saved.clockConfig, saved.clockState);
    this.pendingBoardSettle = false;
    this.emit('board-sync', { displayFen: this.getDisplayFen() });
    this.persistAutosave();
  }

  async exportPgn() {
    await this.storageApi.saveTextFile({
      title: 'Export PGN',
      defaultPath: 'onyx-gambit.pgn',
      filters: [{ name: 'PGN', extensions: ['pgn'] }],
      content: this.chess.pgn(),
    });
  }

  async importPgnFromDisk() {
    const loaded = await this.storageApi.openTextFile({
      title: 'Import PGN',
      filters: [{ name: 'PGN', extensions: ['pgn', 'txt'] }],
    });
    if (!loaded?.content) return false;
    this.importPgn(loaded.content);
    return true;
  }

  importPgn(content) {
    const parsed = parsePgnText(content);
    this.sessionId += 1;
    this.cancelAi();
    this.stopReplayAutoplay();
    this.chess = parsed.chess;
    this.clearSelection();
    this.manualResult = null;
    this.pendingBoardSettle = false;
    this.rebuildReplay(false, this.autoplayDelayMs);
    this.syncClockToCurrentPosition();
    this.analysisToken += 1;
    this.cancelReview({ preserveComputed: false, cancelEngine: true });
    this.analysis.live = null;
    this.analysis.status = 'idle';
    this.emit('board-sync', { displayFen: this.getDisplayFen() });
    this.persistAutosave();
  }

  copyFen() {
    return this.storageApi.copyText(this.getDisplayFen());
  }

  loadFen(fenText) {
    const parsed = parseFenText(fenText);
    this.sessionId += 1;
    this.cancelAi();
    this.stopReplayAutoplay();
    this.chess = parsed.chess;
    this.clearSelection();
    this.manualResult = null;
    this.pendingBoardSettle = false;
    this.rebuildReplay(false, this.autoplayDelayMs);
    this.syncClockToCurrentPosition();
    this.analysisToken += 1;
    this.cancelReview({ preserveComputed: false, cancelEngine: true });
    this.analysis.live = null;
    this.analysis.status = 'idle';
    this.emit('board-sync', { displayFen: this.getDisplayFen() });
    this.persistAutosave();
  }

  async loadFenFromPrompt(fenText) {
    this.loadFen(fenText);
  }

  persistAutosave() {
    if (!this.storageApi?.saveAutosave) return Promise.resolve();
    return this.storageApi.saveAutosave(JSON.stringify(serializeSavedGame(this.getSnapshot()), null, 2));
  }

  getSnapshot() {
    const history = this.chess.history({ verbose: true });
    return {
      mode: this.mode,
      players: cloneJson(this.players),
      fen: this.chess.fen(),
      displayFen: this.getDisplayFen(),
      pgn: this.chess.pgn(),
      history,
      selectedSquare: this.selectedSquare,
      legalTargets: this.legalMoves.map((move) => move.to),
      turn: this.chess.turn(),
      status: describeStatus(this.chess, this.manualResult, this.clock.snapshot().flaggedColor),
      result: describeResult(this.chess, this.manualResult, this.clock.snapshot().flaggedColor),
      checkmate: this.chess.isCheckmate(),
      draw: this.chess.isDraw(),
      inReplay: this.replay.active,
      gamePaused: this.gamePaused,
      pendingBoardSettle: this.pendingBoardSettle,
      aiThinkingColor: this.aiThinkingColor ?? null,
      engine: {
        phase: this.enginePhase,
        error: this.engineError,
      },
      clockConfig: cloneJson(this.clock.config),
      clockState: this.clock.snapshot(),
      replayState: {
        active: this.replay.active,
        index: this.replay.index,
        autoplay: this.replay.autoplay,
        delayMs: this.replay.delayMs,
      },
      autoplayDelayMs: this.autoplayDelayMs,
      replayFrames: this.replay.frames,
      analysis: {
        enabled: this.analysis.enabled,
        status: this.analysis.status,
        lastLive: this.analysis.live,
        reviewStatus: this.analysis.review.status,
        reviewProgress: cloneJson(this.analysis.review.progress),
        reviewError: this.analysis.review.error,
        reviewAnnotations: cloneJson(this.analysis.review.annotations),
        currentReview: this.getCurrentReviewAnnotation(),
      },
    };
  }
}
