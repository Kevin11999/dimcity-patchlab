// preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('app', {
  // CSV openen (voor de import-wizard)
  openCsv: () => ipcRenderer.invoke('openCsv'),

  // (oude) eenvoudige PDF-export via printToPDF (ProjectIO.exportPdf fallback)
  exportPdf: (saveName) => ipcRenderer.invoke('exportPdf', saveName),

  // Nieuwe HTML → PDF export (export-pdf.js)
  exportPdfFromHtml: (args) => ipcRenderer.invoke('exportPdfFromHtml', args),

  // Dialogs & file IO (ProjectIO)
  showSaveDialog: (options) => ipcRenderer.invoke('showSaveDialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('showOpenDialog', options),
  writeTextFile: (args) => ipcRenderer.invoke('writeTextFile', args),
  readTextFile: (filePath) => ipcRenderer.invoke('readTextFile', filePath),

  // Testkanaal
  ping: () => ipcRenderer.invoke('ping')
});
