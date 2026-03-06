import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBestMoveLine, parseInfoLine, summarizeAnalysis } from '../../electron/stockfish-parser.js';

test('parseInfoLine extracts depth, score, and PV', () => {
  const parsed = parseInfoLine('info depth 18 seldepth 28 multipv 2 score cp 34 nodes 12345 nps 999 time 51 pv e2e4 e7e5 g1f3');
  assert.equal(parsed.depth, 18);
  assert.equal(parsed.selDepth, 28);
  assert.equal(parsed.multiPv, 2);
  assert.equal(parsed.scoreCp, 34);
  assert.deepEqual(parsed.pv, ['e2e4', 'e7e5', 'g1f3']);
});

test('parseBestMoveLine extracts bestmove and ponder', () => {
  assert.deepEqual(parseBestMoveLine('bestmove e2e4 ponder e7e5'), {
    bestMove: 'e2e4',
    ponder: 'e7e5',
  });
});

test('summarizeAnalysis keeps the deepest line per multipv', () => {
  const lines = summarizeAnalysis([
    parseInfoLine('info depth 14 multipv 1 score cp 24 pv e2e4 e7e5'),
    parseInfoLine('info depth 16 multipv 1 score cp 29 pv e2e4 e7e5 g1f3'),
    parseInfoLine('info depth 15 multipv 2 score cp 18 pv d2d4 d7d5'),
  ], 2);

  assert.equal(lines.length, 2);
  assert.equal(lines[0].depth, 16);
  assert.equal(lines[1].multiPv, 2);
});
