import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const appRoot = '/Users/nizda/Dev/codex/chess';
const distRoot = path.join(appRoot, 'dist');

async function findPackagedExecutable() {
  const entries = await fs.readdir(distRoot, { withFileTypes: true });
  const appBundles = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('mac')) continue;
    const candidateRoot = path.join(distRoot, entry.name);
    const nested = await fs.readdir(candidateRoot, { withFileTypes: true });
    nested
      .filter((child) => child.isDirectory() && child.name.endsWith('.app'))
      .forEach((child) => appBundles.push(path.join(candidateRoot, child.name)));
  }

  const appBundle = appBundles.sort()[0];
  if (!appBundle) throw new Error('No packaged macOS .app bundle found under dist/. Run npm run package:mac:dir first.');

  const executableDir = path.join(appBundle, 'Contents', 'MacOS');
  const binaries = (await fs.readdir(executableDir)).sort();
  if (!binaries[0]) throw new Error(`No packaged executable found in ${executableDir}.`);
  return path.join(executableDir, binaries[0]);
}

async function waitForReady(window) {
  await window.waitForFunction(() => Boolean(window.__chessDebug?.ready));
}

async function getState(window) {
  return window.evaluate(() => window.__chessDebug.getState());
}

async function clickSquare(window, square) {
  const point = await window.evaluate((value) => window.__chessDebug.getSquareScreenPoint(value), square);
  await window.mouse.click(point.x, point.y);
}

async function waitForHistory(window, count) {
  await window.waitForFunction((target) => window.__chessDebug.getState().history.length >= target, count);
}

async function main() {
  const executablePath = await findPackagedExecutable();
  console.log(`Packaged smoke: launching ${executablePath}`);

  const app = await electron.launch({ executablePath });
  const window = await app.firstWindow();
  await waitForReady(window);

  await window.locator('#analysis-enabled').check();
  await window.waitForFunction(() => document.querySelector('#analysis-best').textContent.trim() !== '-');

  await window.getByRole('button', { name: 'Play against AI' }).click();
  await window.selectOption('#human-color', 'w');
  await window.locator('#black-move-time').fill('120');
  await window.locator('#black-depth').fill('8');
  await window.getByTestId('new-game').click();
  await clickSquare(window, 'e2');
  await clickSquare(window, 'e4');
  await waitForHistory(window, 2);

  const state = await getState(window);
  assert.equal(state.history[1].color, 'b', 'packaged build should resolve a bundled Stockfish reply');

  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
