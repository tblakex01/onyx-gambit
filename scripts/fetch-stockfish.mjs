import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { validateStockfishBinary } from '../electron/stockfish-binary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(repoRoot, 'resources', 'stockfish');
const SOURCE_REPOSITORY_URL = 'https://github.com/official-stockfish/Stockfish';
const LICENSE_TEXT = 'GPL-3.0-or-later - https://github.com/official-stockfish/Stockfish/blob/master/Copying.txt\n';
const STOCKFISH_RELEASE = Object.freeze({
  tagName: 'sf_18',
  targets: Object.freeze([
    {
      folder: 'darwin-arm64',
      assetName: 'stockfish-macos-m1-apple-silicon.tar',
      sha256: '4d77c4aa3ad9bd1ea8111f2ac5a4620fe7ebf998d6893bf828d49ccd579c8cb0',
    },
    {
      folder: 'darwin-x64',
      assetName: 'stockfish-macos-x86-64.tar',
      sha256: 'e7d7a2bca13915419d41ac6cb8cedb123dd2ba1c39a22c574df7a2aa3f526592',
    },
  ]),
});

function normalizeArchiveEntry(entry) {
  const normalized = path.posix.normalize(entry.trim());
  if (!normalized || normalized === '.' || normalized === '..') return null;
  if (normalized.endsWith('/')) return null;
  if (normalized.startsWith('/') || normalized.startsWith('../') || normalized.includes('\0')) {
    throw new Error(`Unsafe archive entry: ${entry}`);
  }
  if (normalized.toLowerCase().endsWith('.txt') || normalized.toLowerCase().endsWith('.md')) {
    return null;
  }
  return normalized;
}

export function pickExecutableName(entries) {
  const normalized = entries.map((entry) => normalizeArchiveEntry(entry)).filter(Boolean);
  return normalized.find((entry) => path.basename(entry).startsWith('stockfish')) ?? normalized[0] ?? null;
}

export function getAssetDownloadUrl(target) {
  return `${SOURCE_REPOSITORY_URL}/releases/download/${STOCKFISH_RELEASE.tagName}/${target.assetName}`;
}

export function getSourceText(target) {
  return [
    `Stockfish release: ${STOCKFISH_RELEASE.tagName}`,
    `Asset: ${target.assetName}`,
    `SHA-256: ${target.sha256}`,
    `Binary URL: ${getAssetDownloadUrl(target)}`,
    `Source repository: ${SOURCE_REPOSITORY_URL}`,
    'License: GPL-3.0-or-later',
  ].join('\n');
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function hasPreparedTarget(target, baseOutputRoot = outputRoot) {
  const destinationDir = path.join(baseOutputRoot, target.folder);
  const binaryPath = path.join(destinationDir, 'stockfish');
  try {
    validateStockfishBinary(binaryPath);
  } catch {
    return false;
  }

  const [sourceText, licenseText] = await Promise.all([
    readTextIfExists(path.join(destinationDir, 'SOURCE.txt')),
    readTextIfExists(path.join(destinationDir, 'LICENSE.txt')),
  ]);
  return sourceText === getSourceText(target) && licenseText === LICENSE_TEXT;
}

export async function hasPreparedBundle(baseOutputRoot = outputRoot) {
  for (const target of STOCKFISH_RELEASE.targets) {
    if (!(await hasPreparedTarget(target, baseOutputRoot))) return false;
  }
  return true;
}

function extractArchiveBuffer(archivePath, entryName) {
  return execFileSync('tar', ['-xOf', archivePath, entryName], {
    encoding: 'buffer',
    maxBuffer: 128 * 1024 * 1024,
  });
}

async function downloadFile(url, destination) {
  const response = await fetch(url, {
    headers: { Accept: 'application/octet-stream', 'User-Agent': 'onyx-gambit' },
  });
  if (!response.ok) throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destination, buffer);
  return createHash('sha256').update(buffer).digest('hex');
}

async function extractBinary(archivePath, destinationDir) {
  const listing = execFileSync('tar', ['-tf', archivePath], { encoding: 'utf8' }).trim().split('\n');
  const executableEntry = pickExecutableName(listing);
  if (!executableEntry) throw new Error(`Could not find executable in ${archivePath}`);
  const outputPath = path.join(destinationDir, 'stockfish');
  await fs.rm(outputPath, { force: true });
  await fs.writeFile(outputPath, extractArchiveBuffer(archivePath, executableEntry));
  await fs.chmod(outputPath, 0o755);
}

export async function refreshTarget(target, baseOutputRoot = outputRoot) {
  await fs.mkdir(baseOutputRoot, { recursive: true });
  const destinationDir = path.join(baseOutputRoot, target.folder);
  const archivePath = path.join(baseOutputRoot, `${target.folder}.tar`);
  await fs.mkdir(destinationDir, { recursive: true });
  const downloadUrl = getAssetDownloadUrl(target);
  const downloadedDigest = await downloadFile(downloadUrl, archivePath);
  if (downloadedDigest !== target.sha256) {
    throw new Error(`Downloaded archive digest mismatch for ${target.assetName}.`);
  }
  await extractBinary(archivePath, destinationDir);
  await fs.writeFile(path.join(destinationDir, 'SOURCE.txt'), getSourceText(target), 'utf8');
  await fs.writeFile(path.join(destinationDir, 'LICENSE.txt'), LICENSE_TEXT, 'utf8');
  await fs.rm(archivePath, { force: true });
}

function shouldForceRefresh(argv = process.argv.slice(2)) {
  return argv.includes('--force');
}

export async function main(options = {}) {
  const baseOutputRoot = options.outputRoot ?? outputRoot;
  const force = options.force ?? shouldForceRefresh();
  await fs.mkdir(baseOutputRoot, { recursive: true });

  for (const target of STOCKFISH_RELEASE.targets) {
    if (!force && (await hasPreparedTarget(target, baseOutputRoot))) continue;
    await refreshTarget(target, baseOutputRoot);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
