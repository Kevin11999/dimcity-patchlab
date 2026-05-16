// preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

function loadRuntimeFixes(){
  const inject = () => {
    if (document.getElementById('v9RuntimeFixesScript')) return;
    const s = document.createElement('script');
    s.id = 'v9RuntimeFixesScript';
    s.src = './v9-runtime-fixes.js';
    s.defer = true;
    document.body.appendChild(s);
  };
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', inject, { once:true });
  } else {
    inject();
  }
}
loadRuntimeFixes();

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
