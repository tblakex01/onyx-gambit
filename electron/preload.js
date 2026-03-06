const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('appShell', {
  name: 'Onyx Gambit',
  platform: process.platform,
});

contextBridge.exposeInMainWorld('chessBridge', {
  engine: {
    ensureReady: () => ipcRenderer.invoke('chess:engine:ensure-ready'),
    newGame: () => ipcRenderer.invoke('chess:engine:new-game'),
    bestMove: (payload) => ipcRenderer.invoke('chess:engine:best-move', payload),
    analyze: (payload) => ipcRenderer.invoke('chess:engine:analyze', payload),
    cancel: () => ipcRenderer.invoke('chess:engine:cancel'),
    onStatus: (callback) => {
      const listener = (_event, status) => callback(status);
      ipcRenderer.on('chess:engine-status', listener);
      return () => ipcRenderer.removeListener('chess:engine-status', listener);
    },
  },
  storage: {
    saveTextFile: (payload) => ipcRenderer.invoke('chess:file:save-text', payload),
    openTextFile: (payload) => ipcRenderer.invoke('chess:file:open-text', payload),
    saveAutosave: (content) => ipcRenderer.invoke('chess:autosave:save', content),
    loadAutosave: () => ipcRenderer.invoke('chess:autosave:load'),
    copyText: (text) => ipcRenderer.invoke('chess:clipboard:write-text', text),
  },
});
