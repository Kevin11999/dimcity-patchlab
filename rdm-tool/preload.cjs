// preload.cjs — the small, safe bridge between the screen and the main process.
const { contextBridge, ipcRenderer } = require('electron');

const calls = ['interfaces', 'setInterface', 'discoverArtnet', 'discoverRdmnet', 'devices', 'details', 'setParam', 'identify', 'reset', 'planAlign', 'runAlign'];
const api = {};
for(const c of calls) api[c] = (...args) => ipcRenderer.invoke(c, ...args);
api.on = (channel, fn) => {
  if(['status', 'device', 'devices', 'nodes', 'align', 'rdmnet'].includes(channel)) ipcRenderer.on(channel, (_e, d) => fn(d));
};
contextBridge.exposeInMainWorld('rdm', api);
