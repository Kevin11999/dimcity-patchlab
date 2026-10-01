// preload.cjs — veilige brug tussen de UI en het Electron-hoofdproces
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('app', {
  openCsv: () => ipcRenderer.invoke('openCsv'),
  exportPdfFromHtml: (args) => ipcRenderer.invoke('exportPdfFromHtml', args),
  exportPdfBatch: (args) => ipcRenderer.invoke('exportPdfBatch', args),
  showSaveDialog: (options) => ipcRenderer.invoke('showSaveDialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('showOpenDialog', options),
  writeTextFile: (args) => ipcRenderer.invoke('writeTextFile', args),
  readTextFile: (filePath) => ipcRenderer.invoke('readTextFile', filePath),
  showItemInFolder: (filePath) => ipcRenderer.invoke('showItemInFolder', filePath),
  appInfo: () => ipcRenderer.invoke('appInfo'),
  ping: () => ipcRenderer.invoke('ping'),

  // Recent projects
  recentList: () => ipcRenderer.invoke('recentList'),
  recentAdd: (filePath, name) => ipcRenderer.invoke('recentAdd', { filePath, name }),
  recentRemove: (filePath) => ipcRenderer.invoke('recentRemove', filePath),

  // Venstertitel + onopgeslagen-status
  setDocumentState: (state) => ipcRenderer.send('documentState', state || {}),

  // Native menu → renderer
  onMenuCommand: (handler) => {
    const fn = (_evt, payload) => handler(payload?.command, payload?.arg);
    ipcRenderer.on('menu-command', fn);
    return () => ipcRenderer.removeListener('menu-command', fn);
  }
});
