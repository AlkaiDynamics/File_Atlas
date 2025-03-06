const crypto = require('crypto');

function validateAndSanitize(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid data structure');
  }

  // Validate root node structure
  if (!data.id || !data.type || !data.name) {
    throw new Error('Missing required root node properties');
  }

  // Recursively validate and sanitize the tree structure
  function validateNode(node) {
    // Required properties for all nodes
    if (!node.id || !node.type || !node.name) {
      throw new Error(`Invalid node structure: ${JSON.stringify(node)}`);
    }

    // Sanitize node name to prevent path traversal
    node.name = sanitizePath(node.name);

    // Validate children if they exist
    if (node.children) {
      if (!Array.isArray(node.children)) {
        throw new Error('Children property must be an array');
      }
      node.children = node.children.map(child => validateNode(child));
    }

    return node;
  }

  return validateNode(data);
}

function sanitizePath(path) {
  // Remove potentially dangerous characters and normalize path
  return path.replace(/[\\/:*?"<>|]/g, '_');
}

module.exports = {
  validateAndSanitize
};