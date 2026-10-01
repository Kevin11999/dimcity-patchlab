// main.js (ESM)
import { app, BrowserWindow, ipcMain, dialog, nativeImage, Menu, shell } from 'electron';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const APP_NAME = 'DimCity PatchLab';
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

function buildMenu(recent = []){
  const recentItems = recent.length
    ? [
        ...recent.map(r => ({ label: r.name || path.basename(r.path), sublabel: r.path, click: () => send('openRecent', r.path) })),
        { type: 'separator' },
        { label: 'Clear Recent', click: async () => { await writeRecent([]); send('recentChanged'); } }
      ]
    : [{ label: 'No recent projects', enabled: false }];

  const template = [
    ...(isMac ? [{
      label: APP_NAME,
      submenu: [
        { label: `About ${APP_NAME}`, click: () => send('about') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Project…', accelerator: 'CmdOrCtrl+N', click: () => send('newProject') },
        { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: () => send('openProject') },
        { label: 'Open Recent', submenu: recentItems },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('saveAs') },
        { type: 'separator' },
        { label: 'Import CSV…', accelerator: 'CmdOrCtrl+I', click: () => send('importCsv') },
        { label: 'Imported Files…', click: () => send('csvSources') },
        { type: 'separator' },
        { label: 'Report Builder / Export PDF…', accelerator: 'CmdOrCtrl+P', click: () => send('exportPdf') },
        { type: 'separator' },
        { label: 'Welcome Screen', click: () => send('welcome') },
        ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit', label: 'Exit' }])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Edit Patch Rows…', accelerator: 'CmdOrCtrl+E', click: () => send('editCsv') },
        { label: 'Add LK…', click: () => send('addLK') },
        { label: 'Add Veam…', click: () => send('addVeam') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Project Overview', accelerator: 'CmdOrCtrl+1', click: () => send('view', 'HOME') },
        { label: 'Validation', accelerator: 'CmdOrCtrl+2', click: () => send('view', 'ISSUES') },
        { label: 'Patch List', accelerator: 'CmdOrCtrl+3', click: () => send('view', 'TABLE') },
        { type: 'separator' },
        { label: 'Recalculate', accelerator: 'CmdOrCtrl+R', click: () => send('rebuild') },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Network',
      submenu: [
        { label: 'Network Planner…', click: () => send('networkPlanner') },
        { type: 'separator' },
        { label: 'Device Builder…', accelerator: 'CmdOrCtrl+Shift+D', click: () => send('deviceBuilder') },
        { label: 'Rack Builder…', click: () => send('deviceBuilder', 'rack') },
        { type: 'separator' },
        { label: 'Export Library…', click: () => send('libraryExport') },
        { label: 'Import Library…', click: () => send('libraryImport') },
        { label: 'Show Library File', click: async () => shell.showItemInFolder(await ensureLibraryFile()) }
      ]
    },
    {
      role: 'help',
      submenu: [
        { label: 'Take the Tour', click: () => send('tour') },
        { label: 'Keyboard Shortcuts', click: () => send('shortcuts') },
        ...(isMac ? [] : [{ type: 'separator' }, { label: `About ${APP_NAME}`, click: () => send('about') }])
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
    backgroundColor: '#0e1014',
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
        buttons: ['Close Without Saving', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        message: 'This project has unsaved changes.',
        detail: `Close ${APP_NAME} anyway? Your changes will be lost.`
      });
      if (response !== 0) return;
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
ipcMain.handle('appInfo', async () => ({ name: APP_NAME, version: app.getVersion(), platform: process.platform }));

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
