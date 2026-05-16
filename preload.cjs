// preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

// V9 runtime UI layer disabled.
// Reason: it can create a render/mutation loop after CSV import, causing the app to freeze.
// Keep the file v9-runtime-fixes.js in the repo for reference, but do not auto-load it.

contextBridge.exposeInMainWorld('app', {
  openCsv: () => ipcRenderer.invoke('openCsv'),
  exportPdf: (saveName) => ipcRenderer.invoke('exportPdf', saveName),
  exportPdfFromHtml: (args) => ipcRenderer.invoke('exportPdfFromHtml', args),
  showSaveDialog: (options) => ipcRenderer.invoke('showSaveDialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('showOpenDialog', options),
  writeTextFile: (args) => ipcRenderer.invoke('writeTextFile', args),
  readTextFile: (filePath) => ipcRenderer.invoke('readTextFile', filePath),
  ping: () => ipcRenderer.invoke('ping')
});
