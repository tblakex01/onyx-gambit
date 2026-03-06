import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { app, BrowserWindow, clipboard, dialog, ipcMain, net, protocol, shell } from 'electron';
import {
  assertTrustedIpcSender,
  isSafeExternalUrl,
  isTrustedRendererUrl,
  validateAutosaveFileSize,
  validateOpenedTextFileSize,
  validateAutosaveContent,
  validateClipboardText,
  validateDevServerUrl,
  validateEnginePayload,
  validateOpenTextPayload,
  validateSaveTextPayload,
} from './security.js';
import { StockfishService } from './stockfish-service.js';
import { APP_ENTRYPOINT, APP_PROTOCOL, APP_PROTOCOL_HOST } from '../src/security-policy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.join(__dirname, '..', 'dist');
const devUrl = validateDevServerUrl(process.env.VITE_DEV_SERVER_URL);
const stockfish = new StockfishService();
let mainWindow = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function getAutosavePath() {
  return path.join(app.getPath('userData'), 'autosave.game.json');
}

function assertTrustedEvent(event) {
  assertTrustedIpcSender(event, mainWindow, devUrl);
}

function resolveBundledAssetPath(requestUrl) {
  const url = new URL(requestUrl);
  if (url.protocol !== `${APP_PROTOCOL}:` || url.host !== APP_PROTOCOL_HOST) {
    throw new Error(`Unsupported app asset URL: ${requestUrl}`);
  }
  const relativePath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const assetPath = path.normalize(path.join(distRoot, `.${relativePath}`));
  if (assetPath !== distRoot && !assetPath.startsWith(`${distRoot}${path.sep}`)) {
    throw new Error(`Blocked app asset path traversal: ${requestUrl}`);
  }
  return assetPath;
}

function registerBundledProtocol() {
  protocol.handle(APP_PROTOCOL, (request) => net.fetch(pathToFileURL(resolveBundledAssetPath(request.url)).toString()));
}

function emitEngineStatus(status) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('chess:engine-status', status);
}

function registerIpc() {
  ipcMain.handle('chess:engine:ensure-ready', (event) => {
    assertTrustedEvent(event);
    return stockfish.ensureReady();
  });
  ipcMain.handle('chess:engine:new-game', (event) => {
    assertTrustedEvent(event);
    return stockfish.newGame();
  });
  ipcMain.handle('chess:engine:best-move', (event, payload) => {
    assertTrustedEvent(event);
    return stockfish.bestMove(validateEnginePayload(payload, { allowDepth: true, defaultMultiPv: 1 }));
  });
  ipcMain.handle('chess:engine:analyze', (event, payload) => {
    assertTrustedEvent(event);
    return stockfish.analyze(validateEnginePayload(payload, { allowDepth: false, defaultMultiPv: 3 }));
  });
  ipcMain.handle('chess:engine:cancel', (event) => {
    assertTrustedEvent(event);
    return stockfish.cancel();
  });

  ipcMain.handle('chess:file:save-text', async (event, payload) => {
    assertTrustedEvent(event);
    const safePayload = validateSaveTextPayload(payload);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: safePayload.title,
      defaultPath: safePayload.defaultPath,
      filters: safePayload.filters,
      showsTagField: false,
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fs.writeFile(result.filePath, safePayload.content, 'utf8');
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle('chess:file:open-text', async (event, payload) => {
    assertTrustedEvent(event);
    const safePayload = validateOpenTextPayload(payload);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: safePayload.title,
      filters: safePayload.filters,
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true, content: null };
    const filePath = result.filePaths[0];
    const stats = await fs.stat(filePath);
    validateOpenedTextFileSize(stats.size);
    const content = await fs.readFile(filePath, 'utf8');
    return { canceled: false, filePath, content };
  });

  ipcMain.handle('chess:clipboard:write-text', (event, text) => {
    assertTrustedEvent(event);
    clipboard.writeText(validateClipboardText(text));
    return true;
  });

  ipcMain.handle('chess:autosave:save', async (event, content) => {
    assertTrustedEvent(event);
    await fs.writeFile(getAutosavePath(), validateAutosaveContent(content), 'utf8');
    return true;
  });

  ipcMain.handle('chess:autosave:load', async (event) => {
    assertTrustedEvent(event);
    try {
      const autosavePath = getAutosavePath();
      const stats = await fs.stat(autosavePath);
      validateAutosaveFileSize(stats.size);
      return await fs.readFile(autosavePath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      return null;
    }
  });
}

function hardenRendererSession(window) {
  const denyPermission = (_webContents, _permission, callback) => callback(false);
  if (typeof window.webContents.session.setPermissionCheckHandler === 'function') {
    window.webContents.session.setPermissionCheckHandler(() => false);
  }
  window.webContents.session.setPermissionRequestHandler(denyPermission);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#060a10',
    titleBarStyle: 'hiddenInset',
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  hardenRendererSession(mainWindow);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isTrustedRendererUrl(url, devUrl)) return;
    event.preventDefault();
  });

  if (devUrl) {
    mainWindow.loadURL(devUrl);
    return;
  }

  mainWindow.loadURL(APP_ENTRYPOINT);
}

app.whenReady().then(() => {
  registerBundledProtocol();
  stockfish.onStatus(emitEngineStatus);
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', async () => {
  await stockfish.destroy();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
