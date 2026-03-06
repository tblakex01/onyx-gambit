import test from 'node:test';
import assert from 'node:assert/strict';
import { assertExpectedReleaseAsset, pickExecutableName } from '../../scripts/fetch-stockfish.mjs';

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

test('assertExpectedReleaseAsset pins the approved release and digest', () => {
  const release = { tag_name: 'sf_18' };
  const target = {
    assetName: 'stockfish-macos-m1-apple-silicon.tar',
    sha256: '4d77c4aa3ad9bd1ea8111f2ac5a4620fe7ebf998d6893bf828d49ccd579c8cb0',
  };

  assert.doesNotThrow(() =>
    assertExpectedReleaseAsset(
      release,
      { digest: 'sha256:4d77c4aa3ad9bd1ea8111f2ac5a4620fe7ebf998d6893bf828d49ccd579c8cb0' },
      target,
    ),
  );
  assert.throws(
    () => assertExpectedReleaseAsset({ tag_name: 'sf_17' }, { digest: 'sha256:test' }, target),
    /Unexpected Stockfish release/,
  );
  assert.throws(
    () => assertExpectedReleaseAsset(release, { digest: 'sha256:test' }, target),
    /Digest mismatch/,
  );
});
