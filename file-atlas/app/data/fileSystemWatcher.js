const { watch } = require('fs');
const path = require('path');
const { ipcMain } = require('electron');
const winston = require('winston');

// Configure logger
const logDir = path.join(app.getPath('userData'), 'logs');
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error'
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'filesystem.log'),
      level: 'info'
    })
  ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

class FileSystemWatcher {
  constructor() {
    this.watchers = new Map();
    this.mainWindow = null;
  }

  setMainWindow(window) {
    this.mainWindow = window;
  }

  startWatching(directoryPath) {
    if (this.watchers.has(directoryPath)) {
      logger.info(`Already watching directory: ${directoryPath}`);
      return;
    }

    try {
      const watcher = watch(directoryPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        const fullPath = path.join(directoryPath, filename);
        logger.info(`File system event: ${eventType} - ${fullPath}`);

        if (this.mainWindow) {
          this.mainWindow.webContents.send('file-system-update', {
            type: eventType,
            path: fullPath
          });
        }
      });

      this.watchers.set(directoryPath, watcher);
      logger.info(`Started watching directory: ${directoryPath}`);
    } catch (error) {
      logger.error(`Error watching directory ${directoryPath}:`, error);
      throw new Error(`Failed to watch directory: ${error.message}`);
    }
  }

  stopWatching(directoryPath) {
    const watcher = this.watchers.get(directoryPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(directoryPath);
      logger.info(`Stopped watching directory: ${directoryPath}`);
    }
  }

  stopAllWatchers() {
    for (const [directoryPath, watcher] of this.watchers) {
      watcher.close();
      logger.info(`Stopped watching directory: ${directoryPath}`);
    }
    this.watchers.clear();
  }
}

module.exports = new FileSystemWatcher();