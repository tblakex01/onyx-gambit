import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isGitLfsPointerContent,
  isLikelyNativeMacosBinary,
  normalizeSpawnError,
  validateStockfishBinary,
} from '../../electron/stockfish-binary.js';

test('git lfs pointer detection recognizes pointer text', () => {
  assert.equal(isGitLfsPointerContent('version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 1\n'), true);
  assert.equal(isGitLfsPointerContent('not-a-pointer'), false);
});

test('native macOS binary detection recognizes Mach-O signatures', () => {
  assert.equal(isLikelyNativeMacosBinary(Buffer.from([0xcf, 0xfa, 0xed, 0xfe])), true);
  assert.equal(isLikelyNativeMacosBinary(Buffer.from('version https://git-lfs.github.com/spec/v1', 'utf8')), false);
});

test('validateStockfishBinary rejects git lfs pointers with an actionable error', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stockfish-pointer-'));
  const binaryPath = path.join(tempDir, 'stockfish');
  fs.writeFileSync(binaryPath, 'version https://git-lfs.github.com/spec/v1\noid sha256:test\nsize 123\n');

  assert.throws(() => validateStockfishBinary(binaryPath), /Git LFS pointer/);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('normalizeSpawnError rewrites ENOEXEC failures into engine guidance', () => {
  const error = normalizeSpawnError({ code: 'ENOEXEC', message: 'spawn ENOEXEC' }, '/tmp/stockfish');
  assert.match(error.message, /not runnable on this machine/);
  assert.match(error.message, /prepare:stockfish/);
});
