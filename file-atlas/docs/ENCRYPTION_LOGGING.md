# Expanded Encryption and Logging Code Examples

## Encryption Implementation
The File Atlas application uses AES-256-CBC encryption with HMAC authentication for secure data protection. Here's a detailed breakdown of the implementation:

### Core Encryption Class
```javascript
const crypto = require('crypto');

class Encryption {
  constructor(password, salt = 'file-atlas-salt') {
    // Secure key derivation with scrypt
    const iterations = 16384;
    this.key = crypto.scryptSync(password, salt, 32, { N: iterations });
    this.algorithm = 'aes-256-cbc';
  }

  encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    const hmac = crypto.createHmac('sha256', this.key);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Add HMAC for integrity verification
    hmac.update(encrypted);
    const authTag = hmac.digest('hex');
    
    return {
      iv: iv.toString('hex'),
      encryptedData: encrypted,
      authTag: authTag
    };
  }

  decrypt(encrypted) {
    // Verify data integrity with HMAC
    const hmac = crypto.createHmac('sha256', this.key);
    hmac.update(encrypted.encryptedData);
    const calculatedAuthTag = hmac.digest('hex');
    
    if (calculatedAuthTag !== encrypted.authTag) {
      throw new Error('Data integrity check failed');
    }

    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.key,
      Buffer.from(encrypted.iv, 'hex')
    );
    
    let decrypted = decipher.update(encrypted.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
```

### Security Features
- AES-256-CBC encryption for strong data protection
- Secure key derivation using scrypt with high iteration count
- HMAC authentication for data integrity verification
- Random IV generation for each encryption operation
- Comprehensive error handling

## Logging Configuration
File Atlas uses Winston for comprehensive logging with multiple transport options and structured log formats.

### Security Logger Implementation
```javascript
const winston = require('winston');
const path = require('path');

class SecurityLogger {
  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error'
        }),
        new winston.transports.File({
          filename: 'logs/security.log',
          level: 'info'
        })
      ]
    });

    // Development console logging
    if (process.env.NODE_ENV !== 'production') {
      this.logger.add(new winston.transports.Console({
        format: winston.format.simple()
      }));
    }
  }

  // Log security-related events
  logAccess(userId, resourceId, action, success) {
    this.logger.info('Access attempt', {
      userId,
      resourceId,
      action,
      success,
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

  logError(error, context = {}) {
    this.logger.error('Security error', {
      error: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString()
    });
  }
}
```

### Logging Features
- Structured JSON log format with timestamps
- Separate error and security log files
- Console logging in development environment
- Comprehensive event tracking for:
  - Access attempts
  - Encryption operations
  - Security errors
  - Data validation

## Impact
- **Enhanced Security**: The encryption implementation ensures data confidentiality and integrity through industry-standard algorithms and practices.
- **Audit Trail**: Comprehensive logging provides a detailed audit trail for security-related events and system operations.
- **Troubleshooting**: Structured logs facilitate efficient debugging and incident investigation.
- **Compliance**: Supports compliance requirements through detailed activity tracking and secure data handling.