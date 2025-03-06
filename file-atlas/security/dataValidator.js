const { nodeSchema, fileSystemDataSchema } = require('../app/data/schema');
const { validateAndSanitize } = require('./sanitization');

class DataValidator {
  /**
   * Performs deep validation and sanitization of file system data
   * @param {Object} data - The file system data to validate
   * @returns {Object} - Validated and sanitized data
   * @throws {Error} - If validation fails
   */
  static validateFileSystemData(data) {
    try {
      // Step 1: Schema validation
      const { error, value } = fileSystemDataSchema.validate(data, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        throw new Error(`Schema validation failed: ${error.message}`);
      }

      // Step 2: Deep validation and sanitization of the root node
      const sanitizedRoot = validateAndSanitize(value.root);

      // Step 3: Additional security checks
      this.performSecurityChecks(sanitizedRoot);

      // Step 4: Return validated and sanitized data
      return {
        ...value,
        root: sanitizedRoot
      };
    } catch (error) {
      // Sanitize error message to prevent information leakage
      throw new Error(`Data validation failed: ${this.sanitizeErrorMessage(error.message)}`);
    }
  }

  /**
   * Performs additional security checks on the data
   * @param {Object} node - The node to check
   * @throws {Error} - If security checks fail
   */
  static performSecurityChecks(node) {
    // Check for path traversal attempts
    if (node.path && (node.path.includes('..') || node.path.includes('~'))) {
      throw new Error('Invalid path detected');
    }

    // Check for malicious file extensions
    if (node.type === 'file') {
      const dangerousExtensions = ['.exe', '.dll', '.bat', '.cmd', '.ps1'];
      if (dangerousExtensions.some(ext => node.name.toLowerCase().endsWith(ext))) {
        throw new Error('Potentially dangerous file type detected');
      }
    }

    // Recursively check children
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(child => this.performSecurityChecks(child));
    }
  }

  /**
   * Sanitizes error messages to prevent information leakage
   * @param {string} message - The error message to sanitize
   * @returns {string} - Sanitized error message
   */
  static sanitizeErrorMessage(message) {
    // Remove file paths and system-specific information
    return message
      .replace(/([A-Za-z]:\\[^\s]+)/g, '[PATH]')
      .replace(/\/.+?\//g, '[PATH]/')
      .replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[IP]')
      .replace(/[a-zA-Z]:\\[^\s]*/g, '[PATH]');
  }
}

module.exports = DataValidator;