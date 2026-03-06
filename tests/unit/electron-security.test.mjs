import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_PROTOCOL_HOST } from '../../src/security-policy.js';
import {
  assertTrustedIpcSender,
  isAllowedRendererNavigation,
  isSafeExternalUrl,
  isTrustedRendererUrl,
  validateAutosaveFileSize,
  validateDevServerUrl,
  validateEnginePayload,
  validateOpenedTextFileSize,
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
    isAllowedRendererNavigation('http://localhost:4173/src/main.js', 'http://localhost:4173'),
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

test('trusted renderer URLs include the packaged app protocol', () => {
  assert.equal(isTrustedRendererUrl(`app://${APP_PROTOCOL_HOST}/index.html`, 'http://127.0.0.1:4173'), true);
  assert.equal(isTrustedRendererUrl('app://evil/index.html', 'http://127.0.0.1:4173'), false);
});

test('dev server URLs must stay on loopback origins', () => {
  assert.equal(validateDevServerUrl('http://127.0.0.1:4173'), 'http://127.0.0.1:4173');
  assert.equal(validateDevServerUrl('http://localhost:4173/'), 'http://localhost:4173');
  assert.throws(() => validateDevServerUrl('https://example.com'), /loopback host/);
});

test('IPC sender validation rejects non-main frames and unexpected origins', () => {
  const mainFrame = { url: `app://${APP_PROTOCOL_HOST}/index.html` };
  const mainWindow = {
    isDestroyed: () => false,
    webContents: {
      mainFrame,
      getURL: () => mainFrame.url,
    },
  };
  const trustedEvent = {
    sender: mainWindow.webContents,
    senderFrame: mainFrame,
  };

  assert.doesNotThrow(() => assertTrustedIpcSender(trustedEvent, mainWindow, 'http://127.0.0.1:4173'));
  assert.throws(
    () =>
      assertTrustedIpcSender(
        {
          sender: mainWindow.webContents,
          senderFrame: { url: 'https://example.com' },
        },
        mainWindow,
        'http://127.0.0.1:4173',
      ),
    /untrusted sender frame/,
  );

  const remoteFrame = { url: 'https://example.com' };
  const remoteWindow = {
    isDestroyed: () => false,
    webContents: {
      mainFrame: remoteFrame,
      getURL: () => remoteFrame.url,
    },
  };

  assert.throws(
    () =>
      assertTrustedIpcSender(
        {
          sender: remoteWindow.webContents,
          senderFrame: remoteFrame,
        },
        remoteWindow,
        'http://127.0.0.1:4173',
      ),
    /unexpected origin/,
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

test('opened text files are bounded before the main process reads them', () => {
  assert.equal(validateOpenedTextFileSize(64), 64);
  assert.throws(() => validateOpenedTextFileSize(1_000_001), /<= 1000000/);
});

test('autosave files are bounded before launch-time restore', () => {
  assert.equal(validateAutosaveFileSize(64), 64);
  assert.throws(() => validateAutosaveFileSize(1_000_001), /<= 1000000/);
});
