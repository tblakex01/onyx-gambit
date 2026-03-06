import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(repoRoot, 'resources', 'stockfish');
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
const releaseUrl = `https://api.github.com/repos/official-stockfish/Stockfish/releases/tags/${STOCKFISH_RELEASE.tagName}`;

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'onyx-gambit' },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

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

export function assertExpectedReleaseAsset(release, asset, target) {
  if (release.tag_name !== STOCKFISH_RELEASE.tagName) {
    throw new Error(`Unexpected Stockfish release ${release.tag_name}. Expected ${STOCKFISH_RELEASE.tagName}.`);
  }
  if (!asset?.digest || asset.digest !== `sha256:${target.sha256}`) {
    throw new Error(`Digest mismatch for ${target.assetName}. Expected sha256:${target.sha256}.`);
  }
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

export async function main() {
  const release = await fetchJson(releaseUrl);
  await fs.mkdir(outputRoot, { recursive: true });

  for (const target of STOCKFISH_RELEASE.targets) {
    const asset = release.assets.find((item) => item.name === target.assetName);
    if (!asset) {
      throw new Error(`Release ${release.tag_name} does not contain ${target.assetName}`);
    }
    assertExpectedReleaseAsset(release, asset, target);

    const destinationDir = path.join(outputRoot, target.folder);
    const archivePath = path.join(outputRoot, `${target.folder}.tar`);
    await fs.mkdir(destinationDir, { recursive: true });
    const downloadedDigest = await downloadFile(asset.browser_download_url, archivePath);
    if (downloadedDigest !== target.sha256) {
      throw new Error(`Downloaded archive digest mismatch for ${target.assetName}.`);
    }
    await extractBinary(archivePath, destinationDir);
    await fs.writeFile(
      path.join(destinationDir, 'SOURCE.txt'),
      [
        `Stockfish release: ${release.tag_name}`,
        `Asset: ${asset.name}`,
        `SHA-256: ${target.sha256}`,
        `Binary URL: ${asset.browser_download_url}`,
        'Source repository: https://github.com/official-stockfish/Stockfish',
        'License: GPL-3.0-or-later',
      ].join('\n'),
      'utf8',
    );
    await fs.writeFile(
      path.join(destinationDir, 'LICENSE.txt'),
      'GPL-3.0-or-later - https://github.com/official-stockfish/Stockfish/blob/master/Copying.txt\n',
      'utf8',
    );
    await fs.rm(archivePath, { force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
