const { ipcMain, app } = require('electron');
const path = require('path');
const FileSystemScanner = require('./fileSystemScanner');
const DataValidator = require('../../security/dataValidator');
const logger = require('../../security/logger');

class FileSystemProcessor {
  constructor() {
    this.setupIpcHandlers();
  }

  setupIpcHandlers() {
    ipcMain.handle('get-file-system-data', this.getFileSystemData.bind(this));
  }

  async getFileSystemData() {
    try {
      // Get user data directory path
      const userDataPath = app.getPath('userData');
      
      // Scan the file system
      const fileSystemData = await FileSystemScanner.scanDirectory(userDataPath);
      
      // Validate and sanitize the data
      const validatedData = DataValidator.validateFileSystemData(fileSystemData);
      
      // Log successful scan
      logger.info('File system scan completed successfully', {
        totalFiles: validatedData.totalFiles,
        totalDirectories: validatedData.totalDirectories
      });

      return validatedData;
    } catch (error) {
      logger.error('Error processing file system data:', error);
      throw new Error('Failed to process file system data');
    }
  }
}

module.exports = new FileSystemProcessor();