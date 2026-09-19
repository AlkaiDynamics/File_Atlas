const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('atlas', {
  chooseFolder: () => ipcRenderer.invoke('atlas:choose-folder'),
  scan: (rootPath) => ipcRenderer.invoke('atlas:scan', rootPath),
  cancelScan: () => ipcRenderer.send('atlas:cancel-scan'),
  reveal: (targetPath) => ipcRenderer.invoke('atlas:reveal', targetPath),
  onProgress: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('atlas:scan-progress', handler);
    return () => ipcRenderer.removeListener('atlas:scan-progress', handler);
  }
});
