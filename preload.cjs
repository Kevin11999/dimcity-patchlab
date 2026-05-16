// preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

function loadStableUiFixes(){
  const inject = () => {
    if (document.getElementById('v10StableUiFixesScript')) return;
    const s = document.createElement('script');
    s.id = 'v10StableUiFixesScript';
    s.src = './v10-stable-ui-fixes.js';
    s.defer = true;
    document.body.appendChild(s);
  };
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', inject, { once:true });
  } else {
    inject();
  }
}
loadStableUiFixes();

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
