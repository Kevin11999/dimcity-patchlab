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
  artnetScan: (opts) => ipcRenderer.invoke('artnetScan', opts),
  artnetApply: (job) => ipcRenderer.invoke('artnetApply', job),
  netProbe: (args) => ipcRenderer.invoke('netProbe', args),
  luminexScan: (req) => ipcRenderer.invoke('luminexScan', req),
  luminexHttp: (req) => ipcRenderer.invoke('luminexHttp', req),
  showItemInFolder: (filePath) => ipcRenderer.invoke('showItemInFolder', filePath),
  appInfo: () => ipcRenderer.invoke('appInfo'),
  ping: () => ipcRenderer.invoke('ping'),

  // Personal device library (userData/library.lklib)
  libraryRead: () => ipcRenderer.invoke('libraryRead'),
  libraryWrite: (content) => ipcRenderer.invoke('libraryWrite', content),

  // App settings, back-ups, crash recovery, updates
  settingsRead: () => ipcRenderer.invoke('settingsRead'),
  settingsWrite: (data) => ipcRenderer.invoke('settingsWrite', data),
  appPaths: () => ipcRenderer.invoke('appPaths'),
  backupWrite: (args) => ipcRenderer.invoke('backupWrite', args),
  openPath: (p) => ipcRenderer.invoke('openPath', p),
  recoveryWrite: (args) => ipcRenderer.invoke('recoveryWrite', args),
  recoveryRead: () => ipcRenderer.invoke('recoveryRead'),
  recoveryClear: () => ipcRenderer.invoke('recoveryClear'),
  updateCheck: (args) => ipcRenderer.invoke('updateCheck', args),
  updateDownload: (args) => ipcRenderer.invoke('updateDownload', args),
  openExternal: (url) => ipcRenderer.invoke('openExternal', url),
  standardLibraryRead: () => ipcRenderer.invoke('standardLibraryRead'),
  standardLibraryFetch: (args) => ipcRenderer.invoke('standardLibraryFetch', args),

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
