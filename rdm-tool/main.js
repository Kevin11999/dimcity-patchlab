// main.js — Electron main process of the DimCity RDM Tool. The network work happens in src/engine.js;
// this file opens the window and passes calls and events between the screen and the engine.
import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Engine, listInterfaces } from './src/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const engine = new Engine();
let win = null;

function createWindow(){
  win = new BrowserWindow({
    width: 1400, height: 880, minWidth: 1000, minHeight: 640, backgroundColor: '#14161a',
    title: 'DimCity RDM Tool', icon: join(here, 'assets', 'icon.ico'),
    webPreferences: { preload: join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(join(here, 'ui', 'index.html'));
}

const send = (ch, data) => { if(win && !win.isDestroyed()) win.webContents.send(ch, data); };
for(const ch of ['status', 'device', 'devices', 'nodes', 'align', 'rdmnet']) engine.on(ch, d => send(ch, d));
engine.on('error', e => send('status', 'Netwerkfout: ' + e.message));

// Every call answers { ok, result } or { ok: false, error } so the screen can show the message.
const handle = (name, fn) => ipcMain.handle(name, async (_e, ...args) => {
  try { return { ok: true, result: await fn(...args) }; } catch(e){ return { ok: false, error: e.message }; }
});
handle('interfaces', () => listInterfaces());
handle('setInterface', ip => engine.setInterface(ip));
handle('discoverArtnet', opts => engine.discoverArtnet(opts).then(() => engine.deviceList()));
handle('discoverRdmnet', opts => engine.discoverRdmnet(opts).then(() => engine.deviceList()));
handle('devices', () => engine.deviceList());
handle('details', id => engine.readDetails(id));
handle('setParam', (id, pid, value) => engine.setParam(id, pid, value));
handle('identify', (id, on) => engine.identify(id, on));
handle('reset', id => engine.reset(id));
handle('planAlign', job => engine.planAlign(job));
handle('runAlign', job => engine.runAlign(job));

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { engine.close(); app.quit(); });
