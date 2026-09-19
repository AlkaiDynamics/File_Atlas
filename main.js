import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanDirectory } from './src/scanner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow = null;
let scanGeneration = 0;

function cacheFilePath() {
  return path.join(app.getPath('userData'), 'hash-cache.json');
}

async function loadCache() {
  try {
    const raw = await fs.readFile(cacheFilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed?.version === 1 && parsed.entries ? parsed.entries : {};
  } catch {
    return {};
  }
}

async function saveCache(entries) {
  const trimmed = Object.fromEntries(
    Object.entries(entries)
      .sort((a, b) => (b[1]?.lastSeen || 0) - (a[1]?.lastSeen || 0))
      .slice(0, 100000)
  );
  const target = cacheFilePath();
  const temp = `${target}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(temp, JSON.stringify({ version: 1, entries: trimmed }), 'utf8');
  await fs.rename(temp, target);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: '#0d1117',
    title: 'File Atlas',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('closed', () => {
    mainWindow = null;
    scanGeneration += 1;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('atlas:choose-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose a folder to map',
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('atlas:scan', async (_event, rootPath) => {
  if (typeof rootPath !== 'string' || !rootPath.trim()) throw new Error('A folder path is required');

  const myGeneration = ++scanGeneration;
  const cache = await loadCache();
  try {
    const result = await scanDirectory(rootPath, {
      cache,
      shouldCancel: () => myGeneration !== scanGeneration,
      onProgress: (progress) => {
        if (mainWindow && myGeneration === scanGeneration) {
          mainWindow.webContents.send('atlas:scan-progress', progress);
        }
      }
    });
    await saveCache(cache);
    return result;
  } catch (error) {
    if (error?.code !== 'SCAN_CANCELLED') {
      await saveCache(cache).catch(() => {});
    }
    throw error;
  }
});

ipcMain.on('atlas:cancel-scan', () => {
  scanGeneration += 1;
});

ipcMain.handle('atlas:reveal', async (_event, targetPath) => {
  if (typeof targetPath !== 'string' || !targetPath) return false;
  shell.showItemInFolder(targetPath);
  return true;
});
