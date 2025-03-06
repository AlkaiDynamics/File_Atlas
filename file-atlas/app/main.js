const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { validateAndSanitize } = require('../security/sanitization');
const fileSystemWatcher = require('./data/fileSystemWatcher');
const fileSystemScanner = require('./data/fileSystemScanner');
const DataValidator = require('../security/dataValidator');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
  fileSystemWatcher.setMainWindow(mainWindow);

  // Start watching the user data directory
  const userDataPath = app.getPath('userData');
  fileSystemWatcher.startWatching(userDataPath);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  fileSystemWatcher.stopAllWatchers();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Enhanced secure IPC channel for file system data
ipcMain.handle('get-file-system-data', async () => {
  try {
    // Validate user data path
    const userDataPath = app.getPath('userData');
    if (!userDataPath || typeof userDataPath !== 'string') {
      throw new Error('Invalid user data path');
    }

    // Scan directory with timeout protection
    const scanTimeout = setTimeout(() => {
      throw new Error('File system scan timeout');
    }, 30000); // 30 seconds timeout

    const data = await fileSystemScanner.scanDirectory(userDataPath);
    clearTimeout(scanTimeout);

    // Perform comprehensive validation and sanitization
    const validatedData = DataValidator.validateFileSystemData(data);
    if (!validatedData || !validatedData.root) {
      throw new Error('Critical data integrity check failed');
    }

    // Additional security check for data structure
    if (!Array.isArray(validatedData.root.children)) {
      throw new Error('Invalid data structure');
    }

    return validatedData;
  } catch (error) {
    console.error('Error reading file system data:', error);
    // Sanitize error message to prevent information leakage
    throw new Error('Failed to process file system data securely');
  }
});

// Handle node state updates
ipcMain.handle('update-node-state', async (event, { nodeId, expanded }) => {
  try {
    // Validate parameters
    if (typeof nodeId !== 'string' || typeof expanded !== 'boolean') {
      throw new Error('Invalid parameters for node state update');
    }

    // Persist node state
    await fileSystemScanner.updateNodeState(nodeId, expanded);
    return { success: true };
  } catch (error) {
    console.error('Error updating node state:', error);
    throw new Error('Failed to update node state');
  }
});

// Handle event logging
ipcMain.handle('log-event', async (event, { eventType, details }) => {
  try {
    // Validate parameters
    if (typeof eventType !== 'string' || typeof details !== 'object') {
      throw new Error('Invalid parameters for event logging');
    }

    // Log the event securely
    const sanitizedDetails = validateAndSanitize(details);
    await fileSystemWatcher.logEvent(eventType, sanitizedDetails);
    return { success: true };
  } catch (error) {
    console.error('Error logging event:', error);
    throw new Error('Failed to log event');
  }
});