// main.js (ESM)
import { app, BrowserWindow, ipcMain, dialog, nativeImage, Menu, shell, nativeTheme } from 'electron';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const APP_NAME = 'DimCity PatchLab';
// Versie altijd uit package.json (ook als de app via een ander startscript draait)
let APP_VERSION = '0.0.0';
try { APP_VERSION = JSON.parse(await fs.readFile(path.join(__dirname, 'package.json'), 'utf8')).version || APP_VERSION; } catch {}
const isMac = process.platform === 'darwin';

// UI-taal van Chromium (bestandskiezer, datumvelden) altijd Engels.
app.commandLine.appendSwitch('lang', 'en-GB');
app.setName(APP_NAME);

let win;
// Projectbestand dat bij het opstarten (dubbelklik / "Open with") geopend moet worden
let pendingOpen = process.argv.slice(1).find(a => /\.lkproj$/i.test(a)) || null;
function openFileInApp(filePath){
  if (!filePath) return;
  if (win && !win.isDestroyed() && !win.webContents.isLoading()) send('openFile', filePath);
  else pendingOpen = filePath;
}
app.on('open-file', (e, filePath) => { e.preventDefault(); openFileInApp(filePath); });

const icon = nativeImage.createFromPath(
  path.join(__dirname, 'assets', 'dimcity-patchlab-256.png')
);

// ===== Recent projects =====
const RECENT_MAX = 8;
const recentFile = () => path.join(app.getPath('userData'), 'recent-projects.json');

async function readRecent(){
  try {
    const list = JSON.parse(await fs.readFile(recentFile(), 'utf8'));
    return Array.isArray(list) ? list.filter(x => x && typeof x.path === 'string') : [];
  } catch { return []; }
}
async function writeRecent(list){
  await fs.mkdir(path.dirname(recentFile()), { recursive: true });
  await fs.writeFile(recentFile(), JSON.stringify(list.slice(0, RECENT_MAX), null, 2), 'utf8');
  buildMenu(list);
}
async function addRecent(filePath, name){
  if (!filePath) return;
  const list = (await readRecent()).filter(x => x.path !== filePath);
  list.unshift({ path: filePath, name: name || path.basename(filePath, path.extname(filePath)), openedAt: new Date().toISOString() });
  await writeRecent(list);
  if (isMac) app.addRecentDocument(filePath);
}
async function listRecentWithStatus(){
  const list = await readRecent();
  return Promise.all(list.map(async item => {
    try {
      const st = await fs.stat(item.path);
      return { ...item, exists: true, modifiedAt: st.mtime.toISOString() };
    } catch {
      return { ...item, exists: false };
    }
  }));
}

// ===== Menu =====
function send(command, arg){
  if (win && !win.isDestroyed()) win.webContents.send('menu-command', { command, arg });
}

// Menuteksten volgen de taal uit de instellingen (en / nl)
let menuLang = 'en';
let lastRecent = [];
const MENU_NL = {
  'About':'Over', 'Settings…':'Instellingen…', 'Check for Updates…':'Zoeken naar updates…',
  'File':'Bestand', 'New Project…':'Nieuw project…', 'Open Project…':'Project openen…', 'Open Recent':'Recent geopend',
  'Clear Recent':'Lijst wissen', 'No recent projects':'Geen recente projecten', 'Save':'Opslaan', 'Save As…':'Opslaan als…',
  'Import CSV…':'CSV importeren…', 'Imported Files…':'Geïmporteerde bestanden…', 'Report Builder / Export PDF…':'Rapport / PDF exporteren…', 'Print Stickers…':'Stickers printen…',
  'Welcome Screen':'Welkomstscherm', 'Exit':'Afsluiten', 'Edit':'Wijzig', 'Undo':'Ongedaan maken', 'Redo':'Opnieuw',
  'History…':'Geschiedenis…', 'Find…':'Zoeken…', 'Cut':'Knippen', 'Copy':'Kopiëren', 'Paste':'Plakken', 'Select All':'Alles selecteren',
  'Edit Patch Rows…':'Patchregels bewerken…', 'Add LK…':'LK toevoegen…', 'Add Veam…':'Veam toevoegen…', 'View':'Weergave',
  'Project Overview':'Projectoverzicht', 'Validation':'Validatie', 'Patch List':'Patchlijst', 'Recalculate':'Herberekenen',
  'Network':'Netwerk', 'Network…':'Netwerk…', 'Nodes & Splitters…':'Nodes & splitters…', 'Setup…':'Setup…', 'Video Tutorials…':'Video-uitleg…', 'Signal Flow…':'Signaalstroom…', 'Device Builder…':'Device Builder…', 'Rack Builder…':'Rack Builder…',
  'Export Library…':'Bibliotheek exporteren…', 'Import Library…':'Bibliotheek importeren…', 'Show Library File':'Bibliotheekbestand tonen',
  'Help':'Help', 'Take the Tour':'Rondleiding', 'Keyboard Shortcuts':'Sneltoetsen', 'User Manual':'Handleiding', 'Take the Tour…':'Rondleiding…', 'Open Demo Show':'Demo-show openen', 'Festival Wrapped…':'Festival wrapped…', 'Send a Request…':'Een verzoek sturen…', "What's New":'Wat is er nieuw'
};
const T = s => (menuLang === 'nl' && MENU_NL[s]) || s;

function buildMenu(recent = lastRecent){
  lastRecent = recent;
  const recentItems = recent.length
    ? [
        ...recent.map(r => ({ label: r.name || path.basename(r.path), sublabel: r.path, click: () => send('openRecent', r.path) })),
        { type: 'separator' },
        { label: T('Clear Recent'), click: async () => { await writeRecent([]); send('recentChanged'); } }
      ]
    : [{ label: T('No recent projects'), enabled: false }];

  const template = [
    ...(isMac ? [{
      label: APP_NAME,
      submenu: [
        { label: `${T('About')} ${APP_NAME}`, click: () => send('about') },
        { label: T('Check for Updates…'), click: () => send('checkUpdates') },
        { type: 'separator' },
        { label: T('Settings…'), accelerator: 'CmdOrCtrl+,', click: () => send('settings') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: T('File'),
      submenu: [
        { label: T('New Project…'), accelerator: 'CmdOrCtrl+N', click: () => send('newProject') },
        { label: T('Open Project…'), accelerator: 'CmdOrCtrl+O', click: () => send('openProject') },
        { label: T('Open Recent'), submenu: recentItems },
        { type: 'separator' },
        { label: T('Save'), accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: T('Save As…'), accelerator: 'CmdOrCtrl+Shift+S', click: () => send('saveAs') },
        { type: 'separator' },
        { label: T('Import CSV…'), accelerator: 'CmdOrCtrl+I', click: () => send('importCsv') },
        { label: T('Imported Files…'), click: () => send('csvSources') },
        { type: 'separator' },
        { label: T('Report Builder / Export PDF…'), accelerator: 'CmdOrCtrl+P', click: () => send('exportPdf') },
        { label: T('Print Stickers…'), accelerator: 'CmdOrCtrl+Shift+L', click: () => send('stickers') },
        { type: 'separator' },
        { label: T('Welcome Screen'), click: () => send('welcome') },
        ...(isMac ? [] : [{ type: 'separator' }, { label: T('Settings…'), accelerator: 'Ctrl+,', click: () => send('settings') }, { type: 'separator' }, { role: 'quit', label: T('Exit') }])
      ]
    },
    {
      label: T('Edit'),
      submenu: [
        // Undo/redo gaan via de app: in een tekstveld is het tekst-undo, anders project-undo
        { label: T('Undo'), accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
        { label: T('Redo'), accelerator: isMac ? 'Shift+Cmd+Z' : 'Ctrl+Y', click: () => send('redo') },
        { label: T('History…'), accelerator: 'CmdOrCtrl+Shift+H', click: () => send('history') },
        { type: 'separator' },
        { role: 'cut', label: T('Cut') }, { role: 'copy', label: T('Copy') }, { role: 'paste', label: T('Paste') }, { role: 'selectAll', label: T('Select All') },
        { type: 'separator' },
        { label: T('Find…'), accelerator: 'CmdOrCtrl+K', click: () => send('search') },
        { type: 'separator' },
        { label: T('Edit Patch Rows…'), accelerator: 'CmdOrCtrl+E', click: () => send('editCsv') },
        { label: T('Add LK…'), click: () => send('addLK') },
        { label: T('Add Veam…'), click: () => send('addVeam') }
      ]
    },
    {
      label: T('View'),
      submenu: [
        { label: T('Project Overview'), accelerator: 'CmdOrCtrl+1', click: () => send('view', 'HOME') },
        { label: T('Validation'), accelerator: 'CmdOrCtrl+2', click: () => send('view', 'ISSUES') },
        { label: T('Patch List'), accelerator: 'CmdOrCtrl+3', click: () => send('view', 'TABLE') },
        { type: 'separator' },
        { label: T('Recalculate'), accelerator: 'CmdOrCtrl+R', click: () => send('rebuild') },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: T('Network'),
      submenu: [
        { label: T('Network…'), accelerator: 'CmdOrCtrl+5', click: () => send('network') },
        { label: T('Nodes & Splitters…'), click: () => send('networkPlanner') },
        { label: T('Setup…'), click: () => send('setup') },
        { label: T('Signal Flow…'), accelerator: 'CmdOrCtrl+4', click: () => send('signalFlow') },
        { type: 'separator' },
        { label: T('Device Builder…'), accelerator: 'CmdOrCtrl+Shift+D', click: () => send('deviceBuilder') },
        { label: T('Rack Builder…'), click: () => send('deviceBuilder', 'rack') },
        { type: 'separator' },
        { label: T('Export Library…'), click: () => send('libraryExport') },
        { label: T('Import Library…'), click: () => send('libraryImport') },
        { label: T('Show Library File'), click: async () => shell.showItemInFolder(await ensureLibraryFile()) }
      ]
    },
    {
      role: 'help',
      label: T('Help'),
      submenu: [
        { label: T('User Manual'), accelerator: 'F1', click: () => send('help') },
        { label: T('Video Tutorials…'), click: () => send('help', 'videos') },
        { label: T('Send a Request…'), click: () => send('request') },
        { label: T("What's New"), click: () => send('help', 'whats-new') },
        { type: 'separator' },
        { label: T('Take the Tour…'), click: () => send('tourMenu') },
        { label: T('Open Demo Show'), click: () => send('demo') },
        { label: T('Festival Wrapped…'), click: () => send('wrapped') },
        { label: T('Keyboard Shortcuts'), click: () => send('shortcuts') },
        ...(isMac ? [] : [{ type: 'separator' }, { label: T('Check for Updates…'), click: () => send('checkUpdates') }, { label: `${T('About')} ${APP_NAME}`, click: () => send('about') }])
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ===== Window =====
async function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    title: APP_NAME,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0e1014' : '#f4f5f7',
    show: false,
    icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.once('ready-to-show', () => win.show());

  // Externe links in de standaardbrowser openen, niet in de app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Vraag om bevestiging als het project onopgeslagen wijzigingen heeft.
  let allowClose = false;
  win.on('close', async (e) => {
    if (allowClose) return;
    e.preventDefault();
    let dirty = false;
    try {
      dirty = await win.webContents.executeJavaScript('!!window.LKApp?.getMODEL?.()?.ui?.dirty');
    } catch { /* renderer niet bereikbaar: gewoon sluiten */ }
    if (dirty) {
      const { response } = await dialog.showMessageBox(win, {
        type: 'warning',
        buttons: menuLang === 'nl' ? ['Sluiten zonder opslaan', 'Annuleren'] : ['Close Without Saving', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        message: menuLang === 'nl' ? 'Dit project heeft niet-opgeslagen wijzigingen.' : 'This project has unsaved changes.',
        detail: menuLang === 'nl' ? `${APP_NAME} toch sluiten? Je wijzigingen gaan verloren.` : `Close ${APP_NAME} anyway? Your changes will be lost.`
      });
      if (response !== 0) return;
      // bewust zonder opslaan gesloten: geen herstel aanbieden bij de volgende start
      await fs.unlink(recoveryFile()).catch(() => {}); await fs.unlink(recoveryMeta()).catch(() => {});
    }
    allowClose = true;
    win.close();
  });

  win.webContents.on('did-finish-load', () => {
    if (pendingOpen) { const p = pendingOpen; pendingOpen = null; setTimeout(() => send('openFile', p), 300); }
  });

  await win.loadFile(path.join(__dirname, 'index.html'));
}

// Tweede instantie (Windows/Linux dubbelklik) → bestand in het bestaande venster openen
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const f = argv.slice(1).find(a => /\.lkproj$/i.test(a));
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    if (f) openFileInApp(f);
  });
}

app.whenReady().then(async () => {
  if (isMac && icon && !icon.isEmpty()) app.dock.setIcon(icon);
  try { const st = JSON.parse(await fs.readFile(settingsFile(), 'utf8')); menuLang = st.language || 'en'; applyNativeTheme(st.theme || 'dark'); } catch {}
  buildMenu(await readRecent());
  createWindow();
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ===== IPC =====

ipcMain.handle('ping', async () => 'pong');
ipcMain.handle('appInfo', async () => ({ name: APP_NAME, version: APP_VERSION, platform: process.platform }));

ipcMain.handle('openCsv', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Import CSV',
    filters: [{ name: 'CSV', extensions: ['csv'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths?.[0]) return null;
  const content = await fs.readFile(filePaths[0], 'utf8');
  return { path: filePaths[0], content };
});

ipcMain.handle('showSaveDialog', async (_evt, options) => {
  return await dialog.showSaveDialog(win, options || {});
});

ipcMain.handle('showOpenDialog', async (_evt, options) => {
  return await dialog.showOpenDialog(win, options || {});
});

ipcMain.handle('writeTextFile', async (_evt, { filePath, content }) => {
  if (!filePath) throw new Error('No filePath');
  await fs.writeFile(filePath, content, 'utf8');
  return true;
});

// ---- Network: find Art-Net nodes and send them their configuration (core/artnet-io.js) ----
let _artIo = null;
const artIo = async () => (_artIo ||= await import(new URL('./core/artnet-io.js', import.meta.url).href));
ipcMain.handle('artnetScan', async (_evt, opts = {}) => { const io = await artIo(); const targets = Array.isArray(opts.targets) ? opts.targets.filter(x => /^\d+\.\d+\.\d+\.\d+$/.test(x)) : null; return io.groupDevices(await io.poll({ timeoutMs:Math.min(8000, Number(opts.timeoutMs) || 2200), targets })); });
ipcMain.handle('artnetApply', async (_evt, job = {}) => {
  const io = await artIo(); if(!/^\d+\.\d+\.\d+\.\d+$/.test(job.ip || '')) throw new Error('Bad IP');
  for(const a of (job.address || [])) await io.sendAddress(job.ip, a);          // names and universes first …
  let ipReply = null; if(job.ipProg) ipReply = await io.sendIpProg(job.ip, job.ipProg);   // … the IP address last (the device moves)
  return { ok:true, ipReply };
});
ipcMain.handle('netProbe', async (_evt, { ip, ports } = {}) => { const io = await artIo(); if(!/^\d+\.\d+\.\d+\.\d+$/.test(ip || '')) return []; return io.probe(ip, Array.isArray(ports) && ports.length ? ports.slice(0, 6) : [80, 443]); });

// ---- Luminex devices over their documented HTTP API (core/luminex-http.js) ----
ipcMain.handle('luminexHttp', async (_evt, req) => (await import(new URL('./core/luminex-http.js', import.meta.url).href)).luminexHttp(req));

ipcMain.handle('readTextFile', async (_evt, filePath) => {
  if (!filePath) return null;
  return await fs.readFile(filePath, 'utf8');
});

// ===== Personal device library (nodes, splitters, switches, panels, racks, PDF templates) =====
const libraryFile = () => path.join(app.getPath('userData'), 'library.lklib');
async function ensureLibraryFile(){
  const p = libraryFile();
  try { await fs.access(p); }
  catch { await fs.writeFile(p, JSON.stringify({ fileType:'patchlab-library', version:1 }, null, 2), 'utf8'); }
  return p;
}
ipcMain.handle('libraryRead', async () => {
  try { return await fs.readFile(libraryFile(), 'utf8'); }
  catch { return null; }
});
ipcMain.handle('libraryWrite', async (_evt, content) => {
  const p = libraryFile();
  await fs.writeFile(p + '.tmp', content, 'utf8');
  await fs.rename(p + '.tmp', p);
  return p;
});

// ===== App settings =====
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
// Systeemdialogen en vensterachtergrond volgen het thema van de app
function applyNativeTheme(theme){
  nativeTheme.themeSource = theme === 'light' ? 'light' : theme === 'system' ? 'system' : 'dark';
  if (win && !win.isDestroyed()) win.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#0e1014' : '#f4f5f7');
}
ipcMain.handle('settingsRead', async () => {
  try { return JSON.parse(await fs.readFile(settingsFile(), 'utf8')); } catch { return {}; }
});
ipcMain.handle('settingsWrite', async (_evt, data) => {
  await fs.writeFile(settingsFile(), JSON.stringify(data || {}, null, 2), 'utf8');
  if (data?.language && data.language !== menuLang){ menuLang = data.language; buildMenu(); }
  if (data?.theme) applyNativeTheme(data.theme);
  return true;
});
ipcMain.handle('appPaths', async () => ({
  documents: app.getPath('documents'), downloads: app.getPath('downloads'), userData: app.getPath('userData'),
  defaultBackups: path.join(app.getPath('documents'), 'DimCity PatchLab Backups')
}));

// ===== Back-ups (los van het originele bestand) =====
const stamp = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}-${z(d.getMinutes())}-${z(d.getSeconds())}`; };
ipcMain.handle('backupWrite', async (_evt, { dir, baseName, content, keep }) => {
  if (!dir) throw new Error('No backup folder');
  await fs.mkdir(dir, { recursive: true });
  const base = String(baseName || 'Untitled').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Untitled';
  const file = path.join(dir, `${base} ${stamp()}.lkproj`);
  await fs.writeFile(file, content, 'utf8');
  // alleen de oudste back-ups van dit project opruimen
  const max = Math.max(1, Number(keep) || 20);
  const mine = (await fs.readdir(dir)).filter(f => f.startsWith(base + ' ') && f.endsWith('.lkproj')).sort();
  for (const f of mine.slice(0, Math.max(0, mine.length - max))) await fs.unlink(path.join(dir, f)).catch(() => {});
  return file;
});
ipcMain.handle('openPath', async (_evt, p) => { if (p) await shell.openPath(p); return true; });

// ===== Herstel na crash: laatste niet-opgeslagen staat =====
const recoveryFile = () => path.join(app.getPath('userData'), 'recovery.lkproj');
const recoveryMeta = () => path.join(app.getPath('userData'), 'recovery.json');
ipcMain.handle('recoveryWrite', async (_evt, { content, meta }) => {
  await fs.writeFile(recoveryFile(), content, 'utf8');
  await fs.writeFile(recoveryMeta(), JSON.stringify({ ...(meta || {}), savedAt: new Date().toISOString() }), 'utf8');
  return true;
});
ipcMain.handle('recoveryRead', async () => {
  try { return { meta: JSON.parse(await fs.readFile(recoveryMeta(), 'utf8')), content: await fs.readFile(recoveryFile(), 'utf8') }; }
  catch { return null; }
});
ipcMain.handle('recoveryClear', async () => {
  await fs.unlink(recoveryFile()).catch(() => {}); await fs.unlink(recoveryMeta()).catch(() => {});
  return true;
});

// ===== Standard device library (bundled, and the newest one on GitHub) =====
ipcMain.handle('standardLibraryRead', async () => {
  try { return JSON.parse(await fs.readFile(path.join(__dirname, 'library', 'standard-library.json'), 'utf8')); }
  catch { return null; }
});
ipcMain.handle('standardLibraryFetch', async (_evt, { repo, token, branch = 'main' }) => {
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(repo || ''))) return { error: 'No valid GitHub repository set (owner/name).' };
  const res = await fetch(`https://raw.githubusercontent.com/${repo}/${branch}/library/standard-library.json`, { headers: ghHeaders(token) });
  if (res.status === 404) return { error: 'No standard library found in the repository.' };
  if (!res.ok) return { error: `GitHub answered ${res.status}` };
  try { return { data: await res.json() }; } catch { return { error: 'The library file on GitHub is not valid JSON.' }; }
});

// ===== Updates via GitHub Releases =====
const ghHeaders = token => ({ 'Accept': 'application/vnd.github+json', 'User-Agent': APP_NAME, ...(token ? { Authorization: `Bearer ${token}` } : {}) });
ipcMain.handle('updateCheck', async (_evt, { repo, token }) => {
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(repo || ''))) return { error: 'No valid GitHub repository set (owner/name).' };
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: ghHeaders(token) });
  if (res.status === 404) return { error: 'No releases found. Is the repository public, or is a token set?' };
  if (!res.ok) return { error: `GitHub answered ${res.status}` };
  const r = await res.json();
  return {
    current: APP_VERSION, latest: String(r.tag_name || '').replace(/^v/i, ''), name: r.name, notes: r.body || '',
    url: r.html_url, publishedAt: r.published_at, platform: process.platform, arch: process.arch,
    assets: (r.assets || []).map(a => ({ name: a.name, size: a.size, url: a.url, browserUrl: a.browser_download_url }))
  };
});
ipcMain.handle('updateDownload', async (_evt, { asset, token }) => {
  const res = await fetch(asset.url, { headers: { ...ghHeaders(token), Accept: 'application/octet-stream' } });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const file = path.join(app.getPath('downloads'), path.basename(asset.name));
  await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
  await shell.openPath(file);   // installer / dmg openen; de gebruiker rondt de installatie af
  return file;
});
ipcMain.handle('openExternal', async (_evt, url) => { if (/^https:\/\//.test(String(url))) await shell.openExternal(url); return true; });

ipcMain.handle('recentList', async () => listRecentWithStatus());
ipcMain.handle('recentAdd', async (_evt, { filePath, name }) => { await addRecent(filePath, name); return true; });
ipcMain.handle('recentRemove', async (_evt, filePath) => {
  await writeRecent((await readRecent()).filter(x => x.path !== filePath));
  return true;
});

// Titel, "edited"-stip (macOS) en bestandsicoon in de titelbalk.
ipcMain.on('documentState', (_evt, { title, dirty, filePath }) => {
  if (!win || win.isDestroyed()) return;
  win.setTitle(title ? `${title} — ${APP_NAME}` : APP_NAME);
  if (isMac) {
    win.setDocumentEdited(!!dirty);
    win.setRepresentedFilename(filePath || '');
  }
});

// ===== PDF =====
const escHtml = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));

// Bedrijfslogo (brand) in de kop of voet van elke pagina: { logo, pos:'header-left'|'header-right'|'footer-left'|'footer-right', height, margin }
const brandLogoImg = brand => brand?.logo && /^data:image\//.test(brand.logo)
  ? `<img src="${brand.logo}" style="height:${Number(brand.height) || 9}mm;max-width:70mm;object-fit:contain;display:block">` : '';
function headerTemplate(brand){
  const img = String(brand?.pos || '').startsWith('header') ? brandLogoImg(brand) : '';
  if (!img) return '<span></span>';
  const m = Number(brand.margin) || 10;
  return `<div style="-webkit-print-color-adjust:exact;width:100%;padding:0 ${m}mm;margin-top:${Math.max(3, m / 2 - 1)}mm;display:flex;justify-content:${brand.pos === 'header-left' ? 'flex-start' : 'flex-end'}">${img}</div>`;
}
function footerTemplate(footer, brand){
  const img = String(brand?.pos || '').startsWith('footer') ? brandLogoImg(brand) : '';
  if (!footer && !img) return '<span></span>';
  const m = Number(brand?.margin) || 10;
  const logoCell = img ? `<span style="flex:none">${img}</span>` : '';
  const text = footer ? `<span style="flex:1">${escHtml(footer.left)}</span><span style="flex:1;text-align:center">${escHtml(footer.center)}</span>
    <span style="flex:1;text-align:right">${footer.pageNumbers === false ? '' : 'Page <span class="pageNumber"></span> of <span class="totalPages"></span>'}</span>` : '<span style="flex:1"></span>';
  return `<div style="-webkit-print-color-adjust:exact;font-family:Arial,Helvetica,sans-serif;font-size:7px;color:#64748b;width:100%;padding:0 ${m}mm;display:flex;align-items:center;gap:4mm;">
    ${brand?.pos === 'footer-left' ? logoCell : ''}${text}${brand?.pos === 'footer-right' ? logoCell : ''}
  </div>`;
}

// HTML via een tijdelijk bestand renderen: data-URL's lopen stuk op grote (logo-)inhoud.
async function renderHtmlToPdf(html, opts = {}){
  const tmpFile = path.join(os.tmpdir(), `patchlab-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  await fs.writeFile(tmpFile, html, 'utf8');
  const off = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  try {
    await off.loadFile(tmpFile);
    // Wachten tot afbeeldingen (logo) en fonts klaar zijn
    await off.webContents.executeJavaScript(`Promise.all([
      document.fonts ? document.fonts.ready : null,
      ...[...document.images].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; }))
    ]).then(() => true)`);
    return await off.webContents.printToPDF({
      pageSize: opts.pageSize || 'A4',
      landscape: !!opts.landscape,
      printBackground: true,
      preferCSSPageSize: true,
      margins: { marginType: 'default' }, // 'default' respecteert de @page-marges uit de CSS
      displayHeaderFooter: !!(opts.footer || brandLogoImg(opts.brand)),
      headerTemplate: headerTemplate(opts.brand),
      footerTemplate: footerTemplate(opts.footer, opts.brand)
    });
  } finally {
    if (!off.isDestroyed()) off.destroy();
    fs.unlink(tmpFile).catch(() => {});
  }
}

ipcMain.handle('exportPdfFromHtml', async (_evt, { html, defaultPath, landscape, pageSize, footer, brand }) => {
  const res = await dialog.showSaveDialog(win, {
    title: 'Export PDF',
    defaultPath: defaultPath || 'lk-veam-report.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (res.canceled || !res.filePath) return null;

  const pdf = await renderHtmlToPdf(html, { landscape, pageSize, footer, brand });
  await fs.writeFile(res.filePath, pdf);
  return res.filePath;
});

// Meerdere PDF's (bijv. één per DimCity) in één gekozen map.
ipcMain.handle('exportPdfBatch', async (_evt, { items, landscape, pageSize, footer, brand }) => {
  if (!Array.isArray(items) || !items.length) return null;
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose folder for PDF files',
    buttonLabel: 'Export Here',
    properties: ['openDirectory', 'createDirectory']
  });
  if (res.canceled || !res.filePaths?.[0]) return null;

  const dir = res.filePaths[0];
  const written = [];
  for (const item of items) {
    const name = path.basename(String(item.fileName || 'export.pdf'));
    const pdf = await renderHtmlToPdf(item.html, { landscape, pageSize, footer: item.footer || footer, brand });
    const outPath = path.join(dir, name.toLowerCase().endsWith('.pdf') ? name : name + '.pdf');
    await fs.writeFile(outPath, pdf);
    written.push(outPath);
  }
  return { dir, files: written };
});

ipcMain.handle('showItemInFolder', async (_evt, p) => { if (p) shell.showItemInFolder(p); return true; });
