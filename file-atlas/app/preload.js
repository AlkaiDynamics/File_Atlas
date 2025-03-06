const { contextBridge, ipcRenderer } = require('electron');

// Define explicit API contracts between core modules
contextBridge.exposeInMainWorld('fileAtlasAPI', {
  // Retrieve sanitized file system data
  getFileSystemData: () => ipcRenderer.invoke('get-file-system-data'),

  // Persist changes to node state (expand/collapse)
  updateNodeState: (nodeId, expanded) => {
    if (typeof nodeId !== 'string' || typeof expanded !== 'boolean') {
      throw new Error('Invalid parameters for updateNodeState');
    }
    return ipcRenderer.invoke('update-node-state', { nodeId, expanded });
  },

  // Log UI events for auditing
  logEvent: (eventType, details) => {
    if (typeof eventType !== 'string' || typeof details !== 'object') {
      throw new Error('Invalid parameters for logEvent');
    }
    return ipcRenderer.invoke('log-event', { eventType, details });
  },

  // Subscribe to file system updates
  onFileSystemUpdate: (callback) => {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    ipcRenderer.on('file-system-update', (event, data) => {
      callback(data);
    });
  },

  // Secure file system data access with user context
  getSecureFileSystemData: (userId) => {
    if (typeof userId !== 'string') {
      throw new Error('Invalid user ID');
    }
    return ipcRenderer.invoke('get-secure-file-system-data', { userId });
  },

  // Protected resource access
  accessProtectedResource: (userId, resourceId) => {
    if (typeof userId !== 'string' || typeof resourceId !== 'string') {
      throw new Error('Invalid parameters for protected resource access');
    }
    return ipcRenderer.invoke('access-protected-resource', { userId, resourceId });
  },

  // Update resource protection status
  updateResourceProtection: (userId, resourceId, protection) => {
    if (typeof userId !== 'string' || 
        typeof resourceId !== 'string' || 
        typeof protection !== 'object') {
      throw new Error('Invalid parameters for protection update');
    }
    return ipcRenderer.invoke('update-resource-protection', { userId, resourceId, protection });
  }
});