import { Chess } from 'chess.js';
import { SAVE_FILE_VERSION, cloneJson, createAiConfig, createClockConfig, createDefaultPlayers, GAME_MODES } from './game-types.js';
import { normalizeReviewAnnotations } from './review.js';
import { MAX_TEXT_FILE_LENGTH, assertInteger, assertText, normalizeFenText, normalizePgnText } from './security-policy.js';

const VALID_GAME_MODES = new Set(Object.values(GAME_MODES));
const MAX_REPLAY_DELAY_MS = 10_000;

function normalizeGameMode(value) {
  if (!VALID_GAME_MODES.has(value)) {
    throw new Error('Save file has an invalid game mode.');
  }
  return value;
}

function normalizeReplayDelay(value) {
  return assertInteger(value ?? 900, 'replay delay', { min: 0, max: MAX_REPLAY_DELAY_MS });
}

export function createChessFromFen(fen) {
  const chess = new Chess();
  if (fen) chess.load(normalizeFenText(fen));
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
  loaded.loadPgn(normalizePgnText(pgn));
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
  const payload = typeof raw === 'string' ? JSON.parse(assertText(raw, 'save payload', {
    maxLength: MAX_TEXT_FILE_LENGTH,
  })) : raw;
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid save payload.');
  }

  if (!payload.fen || !payload.pgn || !payload.mode) {
    throw new Error('Save file is missing required chess state.');
  }

  const chess = new Chess();
  const mode = normalizeGameMode(payload.mode);
  const fen = normalizeFenText(payload.fen);
  const pgn = normalizePgnText(payload.pgn);
  chess.loadPgn(pgn);
  if (fen !== chess.fen()) {
    throw new Error('Save file FEN does not match PGN history.');
  }

  return {
    version: payload.version ?? SAVE_FILE_VERSION,
    savedAt: payload.savedAt ?? new Date().toISOString(),
    fen,
    pgn,
    result: payload.result ?? null,
    mode,
    players: normalizePlayers(payload.players, mode),
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
      delayMs: normalizeReplayDelay(payload.replayState?.delayMs),
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
  chess.loadPgn(normalizePgnText(pgnText), { strict: false });
  return {
    chess,
    pgn: chess.pgn(),
    fen: chess.fen(),
    history: chess.history({ verbose: true }),
  };
}

export function parseFenText(fenText) {
  const chess = createChessFromFen(fenText);
  return {
    chess,
    fen: chess.fen(),
  };
}
