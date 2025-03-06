const winston = require('winston');
const path = require('path');
const { app } = require('electron');

class SecurityLogger {
  constructor() {
    const logDir = path.join(app.getPath('userData'), 'logs');

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({
          filename: path.join(logDir, 'error.log'),
          level: 'error'
        }),
        new winston.transports.File({
          filename: path.join(logDir, 'security.log'),
          level: 'info'
        })
      ]
    });

    // Add console transport in development
    if (process.env.NODE_ENV !== 'production') {
      this.logger.add(new winston.transports.Console({
        format: winston.format.simple()
      }));
    }
  }

  logAccess(userId, resourceId, action, success) {
    this.logger.info('Access attempt', {
      userId,
      resourceId,
      action,
      success,
      timestamp: new Date().toISOString()
    });
  }

  logError(error, context = {}) {
    this.logger.error('Security error', {
      error: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString()
    });
  }

  logEncryption(resourceId, operation) {
    this.logger.info('Encryption operation', {
      resourceId,
      operation,
      timestamp: new Date().toISOString()
    });
  }

  logValidation(resourceId, validationType, success) {
    this.logger.info('Validation check', {
      resourceId,
      validationType,
      success,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = new SecurityLogger();