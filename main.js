// main.js (ESM)
import { app, BrowserWindow, ipcMain, dialog, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

let win;

const icon = nativeImage.createFromPath(
  path.join(__dirname, 'assets', 'dimcity-patchlab-256.png')
);

async function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  await win.loadFile(path.join(__dirname, 'index.html'));
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && icon && !icon.isEmpty()) {
    app.dock.setIcon(icon);
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ===== IPC =====

ipcMain.handle('ping', async () => 'pong');

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

ipcMain.handle('exportPdf', async (_evt, saveName = 'lk-veam-report.pdf') => {
  const pdf = await win.webContents.printToPDF({});
  const outPath = path.join(process.cwd(), saveName);
  await fs.writeFile(outPath, pdf);
  return outPath;
});

ipcMain.handle('exportPdfFromHtml', async (_evt, { html, defaultPath }) => {
  const off = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true }
  });

  try {
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    await off.loadURL(dataUrl);
    await new Promise(r => setTimeout(r, 75));

    const pdf = await off.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      marginsType: 1
    });

    const res = await dialog.showSaveDialog(win, {
      title: 'Export PDF',
      defaultPath: defaultPath || 'lk-veam-report.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });

    if (res.canceled) return null;

    const outPath = res.filePath || defaultPath || 'lk-veam-report.pdf';
    await fs.writeFile(outPath, pdf);
    return outPath;
  } finally {
    if (!off.isDestroyed()) off.destroy();
  }
});
