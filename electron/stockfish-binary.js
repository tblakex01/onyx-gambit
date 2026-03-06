import fs from 'node:fs';

const GIT_LFS_POINTER_PREFIX = 'version https://git-lfs.github.com/spec/v1';
const MACH_O_MAGICS = new Set([0xfeedface, 0xcefaedfe, 0xfeedfacf, 0xcffaedfe, 0xcafebabe, 0xbebafeca]);

export function isGitLfsPointerContent(content) {
  return content.startsWith(GIT_LFS_POINTER_PREFIX);
}

export function isLikelyNativeMacosBinary(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  return MACH_O_MAGICS.has(buffer.readUInt32BE(0)) || MACH_O_MAGICS.has(buffer.readUInt32LE(0));
}

export function validateStockfishBinary(binaryPath) {
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Stockfish binary not found at ${binaryPath}. Run npm install or npm run prepare:stockfish.`);
  }

  const probe = fs.readFileSync(binaryPath);
  const prefix = probe.subarray(0, Math.min(160, probe.length)).toString('utf8');
  if (isGitLfsPointerContent(prefix)) {
    throw new Error(
      `Stockfish binary at ${binaryPath} is a Git LFS pointer, not an executable. Run npm install or npm run prepare:stockfish.`,
    );
  }
  if (!isLikelyNativeMacosBinary(probe)) {
    throw new Error(
      `Stockfish binary at ${binaryPath} is not a native macOS executable. Run npm install or npm run prepare:stockfish.`,
    );
  }

  fs.chmodSync(binaryPath, 0o755);
  return binaryPath;
}

export function normalizeSpawnError(error, binaryPath) {
  if (!error) return new Error(`Failed to launch Stockfish from ${binaryPath}.`);
  if (error.code === 'ENOEXEC') {
    return new Error(
      `Stockfish at ${binaryPath} is not runnable on this machine. Refresh the bundled engine with npm run prepare:stockfish.`,
    );
  }
  if (error.code === 'EACCES') {
    return new Error(`Stockfish at ${binaryPath} is not executable. Refresh the bundled engine with npm run prepare:stockfish.`);
  }
  return new Error(error.message || `Failed to launch Stockfish from ${binaryPath}.`);
}
