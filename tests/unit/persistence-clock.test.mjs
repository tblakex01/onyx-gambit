import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { ChessClock } from '../../src/clock.js';
import { createClockConfig } from '../../src/game-types.js';
import {
  buildReplayFramesFromPgn,
  deserializeSavedGame,
  parseFenText,
  parsePgnText,
  serializeSavedGame,
} from '../../src/persistence.js';

test('clock switches turns, applies increment, and flags on zero', () => {
  const clock = new ChessClock(createClockConfig({ preset: 'custom', initialMs: 5_000, incrementMs: 1_000 }));
  clock.start('w', 0);
  clock.tick(2_000);
  assert.equal(clock.snapshot().whiteMs, 3_000);
  clock.switchTurn('b', 'w', 2_000);
  assert.equal(clock.snapshot().whiteMs, 4_000);
  clock.tick(7_000);
  assert.equal(clock.snapshot().flaggedColor, 'b');
});

test('pgn and fen helpers restore exact positions', () => {
  const parsedPgn = parsePgnText('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6');
  assert.equal(parsedPgn.fen, 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4');

  const parsedFen = parseFenText(parsedPgn.fen);
  assert.equal(parsedFen.fen, parsedPgn.fen);

  const frames = buildReplayFramesFromPgn(parsedPgn.pgn);
  assert.equal(frames.length, 7);
  assert.equal(frames.at(-1).fen, parsedPgn.fen);
});

test('saved games round-trip through serialization', () => {
  const chess = new Chess();
  chess.move('e4');
  chess.move('e5');
  const payload = serializeSavedGame({
    fen: chess.fen(),
    pgn: chess.pgn(),
    result: null,
    mode: 'play-against-ai',
    players: {
      white: { type: 'human', ai: { enabled: false, difficultyId: '4', skillLevel: 11, moveTimeMs: 900, depth: 14 } },
      black: { type: 'ai', ai: { enabled: true, difficultyId: '4', skillLevel: 11, moveTimeMs: 900, depth: 14 } },
    },
    clockConfig: { preset: 'blitz', initialMs: 180_000, incrementMs: 2_000 },
    clockState: { whiteMs: 179_000, blackMs: 178_000, activeColor: 'w', running: true, paused: false, flaggedColor: null },
    replayState: { active: false, index: 2, autoplay: false, delayMs: 650 },
    analysis: { enabled: true, lastLive: null, reviewAnnotations: [null, { moveIndex: 1, classification: 'best' }, null] },
  });

  const restored = deserializeSavedGame(JSON.stringify(payload));
  assert.equal(restored.fen, chess.fen());
  assert.equal(restored.players.black.type, 'ai');
  assert.equal(restored.clockConfig.incrementMs, 2_000);
  assert.equal(restored.analysis.reviewAnnotations[1].classification, 'best');
});
