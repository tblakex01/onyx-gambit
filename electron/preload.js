const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('appShell', {
  name: 'Glass Marble Chess',
  platform: process.platform,
});
