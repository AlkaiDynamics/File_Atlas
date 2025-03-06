const { ipcRenderer } = require('electron');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

class FileSystemDataManager {
  constructor() {
    this.cache = null;
    this.lastUpdate = null;
  }

  async getFileSystemData() {
    try {
      // Check if we have cached data that's less than 5 minutes old
      if (this.cache && this.lastUpdate && (Date.now() - this.lastUpdate) < 300000) {
        logger.info('Returning cached file system data');
        return this.cache;
      }

      // Fetch fresh data
      const data = await ipcRenderer.invoke('get-file-system-data');
      
      // Update cache
      this.cache = data;
      this.lastUpdate = Date.now();
      
      logger.info('Retrieved fresh file system data');
      return data;
    } catch (error) {
      logger.error('Error fetching file system data:', error);
      throw new Error('Failed to fetch file system data');
    }
  }

  clearCache() {
    this.cache = null;
    this.lastUpdate = null;
    logger.info('File system data cache cleared');
  }
}

module.exports = new FileSystemDataManager();