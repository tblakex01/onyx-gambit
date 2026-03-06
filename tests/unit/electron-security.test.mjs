import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedRendererNavigation,
  isSafeExternalUrl,
  validateEnginePayload,
  validateSaveTextPayload,
} from '../../electron/security.js';

test('external URL policy only allows explicit safe protocols', () => {
  assert.equal(isSafeExternalUrl('https://example.com/docs'), true);
  assert.equal(isSafeExternalUrl('mailto:support@example.com'), true);
  assert.equal(isSafeExternalUrl('javascript:alert(1)'), false);
  assert.equal(isSafeExternalUrl('file:///etc/passwd'), false);
});

test('renderer navigation is restricted to the configured dev origin', () => {
  assert.equal(
    isAllowedRendererNavigation('http://127.0.0.1:4173/src/main.js', 'http://127.0.0.1:4173'),
    true,
  );
  assert.equal(
    isAllowedRendererNavigation('https://example.com', 'http://127.0.0.1:4173'),
    false,
  );
  assert.equal(
    isAllowedRendererNavigation('http://127.0.0.1:5000', 'http://127.0.0.1:4173'),
    false,
  );
});

test('engine payload validation rejects control characters in fen input', () => {
  assert.throws(
    () =>
      validateEnginePayload({
        fen: '8/8/8/8/8/8/8/8 w - - 0 1\nquit',
        moveTimeMs: 500,
        depth: 8,
      }),
    /line breaks/,
  );
});

test('save payload validation normalizes filters and enforces extension format', () => {
  const payload = validateSaveTextPayload({
    title: 'Export PGN',
    defaultPath: 'onyx-gambit.pgn',
    filters: [{ name: 'PGN', extensions: ['PGN', 'txt'] }],
    content: '1. e4 e5',
  });

  assert.deepEqual(payload.filters, [{ name: 'PGN', extensions: ['pgn', 'txt'] }]);
  assert.throws(
    () =>
      validateSaveTextPayload({
        title: 'Bad',
        defaultPath: 'bad.txt',
        filters: [{ name: 'Bad', extensions: ['../txt'] }],
        content: 'x',
      }),
    /alphanumeric/,
  );
});
