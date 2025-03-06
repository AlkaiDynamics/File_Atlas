const path = require('path');

class ValidationUtils {
  static validatePath(filePath) {
    // Check for null or undefined
    if (!filePath) {
      throw new Error('File path cannot be null or undefined');
    }

    // Check if path is a string
    if (typeof filePath !== 'string') {
      throw new Error('File path must be a string');
    }

    // Check for path traversal attempts
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..' + path.sep)) {
      throw new Error('Path traversal detected');
    }

    // Check path length
    if (filePath.length > 260) { // Windows MAX_PATH
      throw new Error('File path exceeds maximum length');
    }

    return normalizedPath;
  }

  static validateFileData(data) {
    // Validate basic structure
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid file data structure');
    }

    // Required fields
    const requiredFields = ['name', 'type', 'size', 'lastModified'];
    for (const field of requiredFields) {
      if (!(field in data)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Type validation
    if (typeof data.name !== 'string' ||
        typeof data.type !== 'string' ||
        typeof data.size !== 'number' ||
        !(data.lastModified instanceof Date)) {
      throw new Error('Invalid field type in file data');
    }

    return true;
  }
}

module.exports = ValidationUtils;