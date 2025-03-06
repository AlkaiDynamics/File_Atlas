const crypto = require('crypto');

class Encryption {
  constructor(password, salt = 'file-atlas-salt') {
    if (!password) {
      throw new Error('Password is required for encryption');
    }
    this.algorithm = 'aes-256-cbc';
    // Use a more secure key derivation with higher cost parameters
    const iterations = 16384; // Increased iterations for better security
    this.key = crypto.scryptSync(password, salt, 32, { N: iterations });
  }

  encrypt(text) {
    try {
      if (!text) {
        throw new Error('Text to encrypt cannot be empty');
      }
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
      // Add authentication data
      const hmac = crypto.createHmac('sha256', this.key);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      // Calculate HMAC of the encrypted data
      hmac.update(encrypted);
      const authTag = hmac.digest('hex');
      
      return {
        iv: iv.toString('hex'),
        encryptedData: encrypted,
        authTag: authTag
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  decrypt(encrypted) {
    try {
      if (!encrypted || !encrypted.iv || !encrypted.encryptedData || !encrypted.authTag) {
        throw new Error('Invalid encrypted data format');
      }

      // Verify HMAC before decryption
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
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  // Utility method to encrypt file data before saving
  encryptFileData(fileData) {
    const jsonString = JSON.stringify(fileData);
    return this.encrypt(jsonString);
  }

  // Utility method to decrypt file data after loading
  decryptFileData(encryptedData) {
    const jsonString = this.decrypt(encryptedData);
    return JSON.parse(jsonString);
  }
}

module.exports = Encryption;