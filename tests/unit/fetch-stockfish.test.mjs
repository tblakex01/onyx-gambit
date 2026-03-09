import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAssetDownloadUrl,
  getSourceText,
  hasPreparedBundle,
  hasPreparedTarget,
  pickExecutableName,
} from '../../scripts/fetch-stockfish.mjs';

test('pickExecutableName ignores unsafe or non-binary archive entries', () => {
  assert.equal(
    pickExecutableName([
      'docs/readme.md',
      'stockfish/stockfish-macos',
    ]),
    'stockfish/stockfish-macos',
  );
  assert.equal(pickExecutableName(['docs/readme.md']), null);
  assert.throws(() => pickExecutableName(['../../escape']), /Unsafe archive entry/);
  assert.throws(() => pickExecutableName(['/absolute/path']), /Unsafe archive entry/);
});

test('getAssetDownloadUrl points to the pinned release asset', () => {
  const target = {
    assetName: 'stockfish-macos-m1-apple-silicon.tar',
    sha256: '4d77c4aa3ad9bd1ea8111f2ac5a4620fe7ebf998d6893bf828d49ccd579c8cb0',
  };
  assert.equal(
    getAssetDownloadUrl(target),
    'https://github.com/official-stockfish/Stockfish/releases/download/sf_18/stockfish-macos-m1-apple-silicon.tar',
  );
  assert.match(getSourceText(target), /Stockfish release: sf_18/);
  assert.match(getSourceText(target), /SHA-256: 4d77c4aa3ad9bd1ea8111f2ac5a4620fe7ebf998d6893bf828d49ccd579c8cb0/);
});

test('hasPreparedTarget validates the local bundled binary and provenance files', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'stockfish-fetch-'));
  const target = {
    folder: 'darwin-arm64',
    assetName: 'stockfish-macos-m1-apple-silicon.tar',
    sha256: '4d77c4aa3ad9bd1ea8111f2ac5a4620fe7ebf998d6893bf828d49ccd579c8cb0',
  };
  const destinationDir = path.join(tempRoot, target.folder);
  await fs.mkdir(destinationDir, { recursive: true });
  await fs.writeFile(path.join(destinationDir, 'stockfish'), Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x00, 0x00]));
  await fs.writeFile(path.join(destinationDir, 'SOURCE.txt'), getSourceText(target), 'utf8');
  await fs.writeFile(
    path.join(destinationDir, 'LICENSE.txt'),
    'GPL-3.0-or-later - https://github.com/official-stockfish/Stockfish/blob/master/Copying.txt\n',
    'utf8',
  );

  await assert.doesNotReject(() => hasPreparedTarget(target, tempRoot));
  assert.equal(await hasPreparedTarget(target, tempRoot), true);

  await fs.writeFile(path.join(destinationDir, 'SOURCE.txt'), 'stale', 'utf8');
  assert.equal(await hasPreparedTarget(target, tempRoot), false);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('hasPreparedBundle requires every pinned target to be valid', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'stockfish-bundle-'));
  const arm64Target = {
    folder: 'darwin-arm64',
    assetName: 'stockfish-macos-m1-apple-silicon.tar',
    sha256: '4d77c4aa3ad9bd1ea8111f2ac5a4620fe7ebf998d6893bf828d49ccd579c8cb0',
  };
  const x64Target = {
    folder: 'darwin-x64',
    assetName: 'stockfish-macos-x86-64.tar',
    sha256: 'e7d7a2bca13915419d41ac6cb8cedb123dd2ba1c39a22c574df7a2aa3f526592',
  };

  for (const target of [arm64Target, x64Target]) {
    const destinationDir = path.join(tempRoot, target.folder);
    await fs.mkdir(destinationDir, { recursive: true });
    await fs.writeFile(path.join(destinationDir, 'stockfish'), Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x00, 0x00]));
    await fs.writeFile(path.join(destinationDir, 'SOURCE.txt'), getSourceText(target), 'utf8');
    await fs.writeFile(
      path.join(destinationDir, 'LICENSE.txt'),
      'GPL-3.0-or-later - https://github.com/official-stockfish/Stockfish/blob/master/Copying.txt\n',
      'utf8',
    );
  }

  assert.equal(await hasPreparedBundle(tempRoot), true);
  await fs.rm(path.join(tempRoot, x64Target.folder, 'LICENSE.txt'), { force: true });
  assert.equal(await hasPreparedBundle(tempRoot), false);
  await fs.rm(tempRoot, { recursive: true, force: true });
});
