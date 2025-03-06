const fileSystemScanner = require('../app/data/fileSystemScanner');
const fs = require('fs').promises;
const path = require('path');

// Mock fs and path modules
jest.mock('fs', () => ({
  promises: {
    stat: jest.fn(),
    readdir: jest.fn()
  }
}));

describe('FileSystemScanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('scanDirectory', () => {
    it('should scan a directory successfully', async () => {
      const mockStats = {
        isDirectory: () => true,
        isFile: () => false,
        size: 0,
        mtime: new Date(),
        mode: 0o755,
        uid: 1000
      };

      const mockFileStats = {
        ...mockStats,
        isDirectory: () => false,
        isFile: () => true,
        size: 1024
      };

      fs.stat
        .mockResolvedValueOnce(mockStats)
        .mockResolvedValueOnce(mockFileStats);

      fs.readdir.mockResolvedValueOnce(['test.txt']);

      const result = await fileSystemScanner.scanDirectory('/test/path');

      expect(result).toHaveProperty('root');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('totalFiles', 1);
      expect(result).toHaveProperty('totalDirectories', 1);
      expect(result).toHaveProperty('totalSize', 1024);
    });

    it('should handle invalid paths', async () => {
      fs.stat.mockRejectedValueOnce(new Error('ENOENT'));

      await expect(fileSystemScanner.scanDirectory('/invalid/path'))
        .rejects
        .toThrow('Failed to scan directory');
    });

    it('should handle non-directory paths', async () => {
      const mockStats = {
        isDirectory: () => false,
        isFile: () => true
      };

      fs.stat.mockResolvedValueOnce(mockStats);

      await expect(fileSystemScanner.scanDirectory('/path/to/file'))
        .rejects
        .toThrow('Path is not a directory');
    });
  });

  describe('_scanNode', () => {
    it('should scan a file node correctly', async () => {
      const mockStats = {
        isFile: () => true,
        isDirectory: () => false,
        size: 1024,
        mtime: new Date(),
        mode: 0o644,
        uid: 1000
      };

      fs.stat.mockResolvedValueOnce(mockStats);

      const result = await fileSystemScanner._scanNode('/test/file.txt');

      expect(result).toHaveProperty('type', 'file');
      expect(result).toHaveProperty('size', 1024);
      expect(result).toHaveProperty('metadata');
    });

    it('should handle scan errors gracefully', async () => {
      fs.stat.mockRejectedValueOnce(new Error('Test error'));

      await expect(fileSystemScanner._scanNode('/test/error.txt'))
        .rejects
        .toThrow('Test error');
    });
  });
});