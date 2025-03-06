const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');
const { validatePath } = require('../../security/validation');
const { nodeSchema } = require('./schema');
const logger = require('../../security/logger');

class FileSystemScanner {
  constructor() {
    this.resetCounters();
  }

  resetCounters() {
    this.totalFiles = 0;
    this.totalDirectories = 0;
    this.totalSize = 0;
  }

  async scanDirectory(dirPath) {
    try {
      const validPath = validatePath(dirPath);
      const stats = await fs.stat(validPath);

      if (!stats.isDirectory()) {
        throw new Error('Path is not a directory');
      }

      this.resetCounters();
      const root = await this._scanNode(validPath);

      return {
        root,
        timestamp: new Date().toISOString(),
        totalFiles: this.totalFiles,
        totalDirectories: this.totalDirectories,
        totalSize: this.totalSize
      };
    } catch (error) {
      logger.error('Error scanning directory:', error);
      throw new Error(`Failed to scan directory: ${error.message}`);
    }
  }

  async _scanNode(nodePath, parentId = '1.0') {
    const stats = await fs.stat(nodePath);
    const name = path.basename(nodePath);
    const nodeInfo = this._createNodeInfo(nodePath, stats, name, parentId);

    if (stats.isDirectory()) {
      this.totalDirectories++;
      nodeInfo.children = await this._scanChildren(nodePath, nodeInfo.id);
    } else {
      this.totalFiles++;
      this.totalSize += stats.size;
      nodeInfo.size = this._formatSize(stats.size);
    }

    return nodeInfo;
  }

  async _scanChildren(dirPath, parentId) {
    const entries = await fs.readdir(dirPath);
    const children = [];

    for (const entry of entries) {
      try {
        const childPath = path.join(dirPath, entry);
        const child = await this._scanNode(childPath, parentId);
        children.push(child);
      } catch (error) {
        logger.warn(`Skipping ${entry}: ${error.message}`);
      }
    }

    return children;
  }

  _createNodeInfo(nodePath, stats, name, parentId) {
    const ext = path.extname(name).toLowerCase();
    const isRoot = parentId === '1.0' && nodePath === app.getPath('userData');
    
    return {
      id: this._generateId(isRoot, stats.isDirectory(), parentId),
      name,
      path: nodePath,
      type: stats.isDirectory() ? 'folder' : 'file',
      ...this._getFileType(ext)
    };
  }

  _generateId(isRoot, isDirectory, parentId) {
    if (isRoot) return '1.0';
    return isDirectory ? `${parentId}.${this.totalDirectories + 1}` : `${parentId}.${this.totalFiles + 1}`;
  }

  _getFileType(ext) {
    const typeMap = {
      '.pdf': { subtype: 'pdf', category: 'document' },
      '.doc': { subtype: 'document', category: 'document' },
      '.docx': { subtype: 'document', category: 'document' },
      '.txt': { subtype: 'text', category: 'document' },
      '.jpg': { subtype: 'image', category: 'media' },
      '.png': { subtype: 'image', category: 'media' },
      '.mp3': { subtype: 'audio', category: 'media' },
      '.mp4': { subtype: 'video', category: 'media' },
      '.js': { subtype: 'code', category: 'development' },
      '.py': { subtype: 'code', category: 'development' },
      '.json': { subtype: 'data', category: 'development' },
      '.xml': { subtype: 'data', category: 'development' }
    };
    return typeMap[ext] || { subtype: 'other', category: 'unknown' };
  }

  _formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${Math.round(size * 100) / 100}${units[unitIndex]}`;
  }
}

module.exports = new FileSystemScanner();