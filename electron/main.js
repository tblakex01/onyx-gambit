import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
import {
  isAllowedRendererNavigation,
  isSafeExternalUrl,
  validateAutosaveContent,
  validateClipboardText,
  validateEnginePayload,
  validateOpenTextPayload,
  validateSaveTextPayload,
} from './security.js';
import { StockfishService } from './stockfish-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererEntry = path.join(__dirname, '..', 'dist', 'index.html');
const devUrl = process.env.VITE_DEV_SERVER_URL;
const stockfish = new StockfishService();
let mainWindow = null;

function getAutosavePath() {
  return path.join(app.getPath('userData'), 'autosave.game.json');
}

function emitEngineStatus(status) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('chess:engine-status', status);
}

function registerIpc() {
  ipcMain.handle('chess:engine:ensure-ready', () => stockfish.ensureReady());
  ipcMain.handle('chess:engine:new-game', () => stockfish.newGame());
  ipcMain.handle('chess:engine:best-move', (_event, payload) =>
    stockfish.bestMove(validateEnginePayload(payload, { allowDepth: true, defaultMultiPv: 1 })),
  );
  ipcMain.handle('chess:engine:analyze', (_event, payload) =>
    stockfish.analyze(validateEnginePayload(payload, { allowDepth: false, defaultMultiPv: 3 })),
  );
  ipcMain.handle('chess:engine:cancel', () => stockfish.cancel());

  ipcMain.handle('chess:file:save-text', async (_event, payload) => {
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

  ipcMain.handle('chess:file:open-text', async (_event, payload) => {
    const safePayload = validateOpenTextPayload(payload);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: safePayload.title,
      filters: safePayload.filters,
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true, content: null };
    const filePath = result.filePaths[0];
    const content = await fs.readFile(filePath, 'utf8');
    return { canceled: false, filePath, content };
  });

  ipcMain.handle('chess:clipboard:write-text', (_event, text) => {
    clipboard.writeText(validateClipboardText(text));
    return true;
  });

  ipcMain.handle('chess:autosave:save', async (_event, content) => {
    await fs.writeFile(getAutosavePath(), validateAutosaveContent(content), 'utf8');
    return true;
  });

  ipcMain.handle('chess:autosave:load', async () => {
    try {
      return await fs.readFile(getAutosavePath(), 'utf8');
    } catch {
      return null;
    }
  });
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

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedRendererNavigation(url, devUrl)) return;
    event.preventDefault();
  });

  if (devUrl) {
    mainWindow.loadURL(devUrl);
    return;
  }

  mainWindow.loadFile(rendererEntry);
}

app.whenReady().then(() => {
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
