import { Chess } from 'chess.js';
import { SAVE_FILE_VERSION, cloneJson, createAiConfig, createClockConfig, createDefaultPlayers, GAME_MODES } from './game-types.js';
import { normalizeReviewAnnotations } from './review.js';

export function createChessFromFen(fen) {
  const chess = new Chess();
  if (fen) chess.load(fen);
  return chess;
}

export function createReplayFramesFromHistory(verboseHistory = []) {
  const chess = new Chess();
  const frames = [
    {
      index: 0,
      fen: chess.fen(),
      move: null,
      san: null,
      turn: chess.turn(),
    },
  ];

  verboseHistory.forEach((move, moveIndex) => {
    chess.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion ?? 'q',
    });
    frames.push({
      index: moveIndex + 1,
      fen: chess.fen(),
      move,
      san: move.san,
      turn: chess.turn(),
    });
  });

  return frames;
}

export function buildReplayFramesFromPgn(pgn) {
  const loaded = new Chess();
  loaded.loadPgn(pgn);
  return createReplayFramesFromHistory(loaded.history({ verbose: true }));
}

export function serializeSavedGame(snapshot) {
  return {
    version: SAVE_FILE_VERSION,
    savedAt: new Date().toISOString(),
    fen: snapshot.fen,
    pgn: snapshot.pgn,
    result: snapshot.result,
    mode: snapshot.mode,
    players: cloneJson(snapshot.players),
    clockConfig: cloneJson(snapshot.clockConfig),
    clockState: cloneJson(snapshot.clockState),
    replayState: cloneJson(snapshot.replayState),
    analysis: cloneJson(snapshot.analysis),
  };
}

function normalizePlayers(input, mode = GAME_MODES.HUMAN) {
  const fallback = createDefaultPlayers(mode);
  return {
    white: {
      type: input?.white?.type ?? fallback.white.type,
      ai: createAiConfig(input?.white?.ai),
    },
    black: {
      type: input?.black?.type ?? fallback.black.type,
      ai: createAiConfig(input?.black?.ai),
    },
  };
}

export function deserializeSavedGame(raw) {
  const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid save payload.');
  }

  if (!payload.fen || !payload.pgn || !payload.mode) {
    throw new Error('Save file is missing required chess state.');
  }

  const chess = new Chess();
  chess.loadPgn(payload.pgn);
  if (payload.fen !== chess.fen()) {
    throw new Error('Save file FEN does not match PGN history.');
  }

  return {
    version: payload.version ?? SAVE_FILE_VERSION,
    savedAt: payload.savedAt ?? new Date().toISOString(),
    fen: payload.fen,
    pgn: payload.pgn,
    result: payload.result ?? null,
    mode: payload.mode,
    players: normalizePlayers(payload.players, payload.mode),
    clockConfig: createClockConfig(payload.clockConfig),
    clockState: {
      whiteMs: Number(payload.clockState?.whiteMs ?? payload.clockConfig?.initialMs ?? 0),
      blackMs: Number(payload.clockState?.blackMs ?? payload.clockConfig?.initialMs ?? 0),
      activeColor: payload.clockState?.activeColor ?? null,
      running: Boolean(payload.clockState?.running),
      paused: Boolean(payload.clockState?.paused),
      flaggedColor: payload.clockState?.flaggedColor ?? null,
    },
    replayState: {
      active: Boolean(payload.replayState?.active),
      index: Number(payload.replayState?.index ?? 0),
      autoplay: Boolean(payload.replayState?.autoplay),
      delayMs: Number(payload.replayState?.delayMs ?? 900),
    },
    analysis: {
      enabled: Boolean(payload.analysis?.enabled),
      lastLive: payload.analysis?.lastLive ?? null,
      reviewAnnotations: normalizeReviewAnnotations(
        payload.analysis?.reviewAnnotations ?? payload.analysis?.review?.annotations ?? [],
        chess.history().length,
      ),
    },
  };
}

export function parsePgnText(pgnText) {
  const chess = new Chess();
  chess.loadPgn(pgnText, { strict: false });
  return {
    chess,
    pgn: chess.pgn(),
    fen: chess.fen(),
    history: chess.history({ verbose: true }),
  };
}

export function parseFenText(fenText) {
  const chess = createChessFromFen(fenText.trim());
  return {
    chess,
    fen: chess.fen(),
  };
}
