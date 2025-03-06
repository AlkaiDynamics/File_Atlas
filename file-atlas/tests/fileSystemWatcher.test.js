const fileSystemWatcher = require('../app/data/fileSystemWatcher');
const { BrowserWindow } = require('electron');

// Mock electron module
jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
  ipcMain: {
    on: jest.fn()
  }
}));

// Mock fs module
jest.mock('fs', () => ({
  watch: jest.fn()
}));

describe('FileSystemWatcher', () => {
  let mockWatcher;
  let mockWindow;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWatcher = {
      close: jest.fn()
    };
    require('fs').watch.mockReturnValue(mockWatcher);

    mockWindow = {
      webContents: {
        send: jest.fn()
      }
    };
  });

  describe('setMainWindow', () => {
    it('should set the main window', () => {
      fileSystemWatcher.setMainWindow(mockWindow);
      expect(fileSystemWatcher.mainWindow).toBe(mockWindow);
    });
  });

  describe('startWatching', () => {
    it('should start watching a directory', () => {
      const testPath = '/test/path';
      fileSystemWatcher.startWatching(testPath);

      expect(require('fs').watch).toHaveBeenCalledWith(
        testPath,
        { recursive: true },
        expect.any(Function)
      );
      expect(fileSystemWatcher.watchers.has(testPath)).toBe(true);
    });

    it('should not watch the same directory twice', () => {
      const testPath = '/test/path';
      fileSystemWatcher.startWatching(testPath);
      fileSystemWatcher.startWatching(testPath);

      expect(require('fs').watch).toHaveBeenCalledTimes(1);
    });

    it('should notify the renderer process of file system changes', () => {
      const testPath = '/test/path';
      fileSystemWatcher.setMainWindow(mockWindow);
      fileSystemWatcher.startWatching(testPath);

      const watchCallback = require('fs').watch.mock.calls[0][2];
      watchCallback('change', 'test.txt');

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'file-system-update',
        {
          type: 'change',
          path: expect.stringContaining('test.txt')
        }
      );
    });
  });

  describe('stopWatching', () => {
    it('should stop watching a directory', () => {
      const testPath = '/test/path';
      fileSystemWatcher.startWatching(testPath);
      fileSystemWatcher.stopWatching(testPath);

      expect(mockWatcher.close).toHaveBeenCalled();
      expect(fileSystemWatcher.watchers.has(testPath)).toBe(false);
    });
  });

  describe('stopAllWatchers', () => {
    it('should stop all watchers', () => {
      const paths = ['/test/path1', '/test/path2'];
      paths.forEach(path => fileSystemWatcher.startWatching(path));

      fileSystemWatcher.stopAllWatchers();

      expect(mockWatcher.close).toHaveBeenCalledTimes(2);
      expect(fileSystemWatcher.watchers.size).toBe(0);
    });
  });
});