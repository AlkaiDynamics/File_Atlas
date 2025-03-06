/**
 * IPC Channel Definitions and Interface Specifications
 * Defines explicit API contracts between core modules
 */

const channels = {
  // Main → Renderer: Retrieve sanitized file system data
  GET_FILE_SYSTEM_DATA: 'get-file-system-data',

  // Renderer → Main: Persist changes to node state
  UPDATE_NODE_STATE: 'update-node-state',

  // Renderer → Main: Log UI events for auditing
  LOG_EVENT: 'log-event'
};

// JSON Schema definitions for IPC data validation
const schemas = {
  fileSystemData: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      type: { type: 'string' },
      subtype: { type: 'string' },
      name: { type: 'string' },
      metadata: { type: 'object' },
      children: { type: 'array', items: { $ref: '#' } }
    },
    required: ['id', 'type', 'name']
  },

  nodeState: {
    type: 'object',
    properties: {
      nodeId: { type: 'string' },
      expanded: { type: 'boolean' }
    },
    required: ['nodeId', 'expanded']
  },

  eventLog: {
    type: 'object',
    properties: {
      eventType: { type: 'string' },
      details: { type: 'object' }
    },
    required: ['eventType', 'details']
  }
};

module.exports = {
  channels,
  schemas
};