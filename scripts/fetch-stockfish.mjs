import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(repoRoot, 'resources', 'stockfish');
const releaseUrl = 'https://api.github.com/repos/official-stockfish/Stockfish/releases/latest';
const targets = [
  { folder: 'darwin-arm64', assetName: 'stockfish-macos-m1-apple-silicon.tar' },
  { folder: 'darwin-x64', assetName: 'stockfish-macos-x86-64.tar' },
];

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'onyx-gambit' },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

function pickExecutableName(entries) {
  const normalized = entries
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => !entry.endsWith('/'))
    .filter((entry) => !entry.toLowerCase().endsWith('.txt'))
    .filter((entry) => !entry.toLowerCase().endsWith('.md'));
  return normalized.find((entry) => path.basename(entry).startsWith('stockfish')) ?? normalized[0];
}

async function downloadFile(url, destination) {
  const response = await fetch(url, {
    headers: { Accept: 'application/octet-stream', 'User-Agent': 'onyx-gambit' },
  });
  if (!response.ok) throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destination, buffer);
}

async function extractBinary(archivePath, destinationDir) {
  const listing = execFileSync('tar', ['-tf', archivePath], { encoding: 'utf8' }).trim().split('\n');
  const executableEntry = pickExecutableName(listing);
  if (!executableEntry) throw new Error(`Could not find executable in ${archivePath}`);

  const tempDir = path.join(destinationDir, '.tmp');
  await fs.rm(tempDir, { recursive: true, force: true });
  await fs.mkdir(tempDir, { recursive: true });
  execFileSync('tar', ['-xf', archivePath, '-C', tempDir]);

  const sourcePath = path.join(tempDir, executableEntry);
  const outputPath = path.join(destinationDir, 'stockfish');
  await fs.rm(outputPath, { force: true });
  await fs.copyFile(sourcePath, outputPath);
  await fs.chmod(outputPath, 0o755);
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function main() {
  const release = await fetchJson(releaseUrl);
  await fs.mkdir(outputRoot, { recursive: true });

  for (const target of targets) {
    const asset = release.assets.find((item) => item.name === target.assetName);
    if (!asset) {
      throw new Error(`Release ${release.tag_name} does not contain ${target.assetName}`);
    }

    const destinationDir = path.join(outputRoot, target.folder);
    const archivePath = path.join(outputRoot, `${target.folder}.tar`);
    await fs.mkdir(destinationDir, { recursive: true });
    await downloadFile(asset.browser_download_url, archivePath);
    await extractBinary(archivePath, destinationDir);
    await fs.writeFile(
      path.join(destinationDir, 'SOURCE.txt'),
      [
        `Stockfish release: ${release.tag_name}`,
        `Asset: ${asset.name}`,
        `Binary URL: ${asset.browser_download_url}`,
        'Source repository: https://github.com/official-stockfish/Stockfish',
        'License: GPL-3.0-or-later',
      ].join('\n'),
      'utf8',
    );
    await fs.writeFile(path.join(destinationDir, 'LICENSE.txt'), 'GPL-3.0-or-later - https://github.com/official-stockfish/Stockfish/blob/master/Copying.txt\n', 'utf8');
    await fs.rm(archivePath, { force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
