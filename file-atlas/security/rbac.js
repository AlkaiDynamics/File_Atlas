const crypto = require('crypto');

class RoleBasedAccessControl {
  constructor() {
    this.roles = new Map();
    this.userRoles = new Map();
    this.resourcePermissions = new Map();
  }

  // Role Management
  addRole(roleName, permissions = []) {
    this.roles.set(roleName, new Set(permissions));
  }

  assignUserRole(userId, roleName) {
    if (!this.roles.has(roleName)) {
      throw new Error(`Role ${roleName} does not exist`);
    }
    this.userRoles.set(userId, roleName);
  }

  // Resource Protection
  protectResource(resourceId, requiredPermissions) {
    this.resourcePermissions.set(resourceId, new Set(requiredPermissions));
  }

  // Access Validation
  canAccess(userId, resourceId) {
    const userRole = this.userRoles.get(userId);
    if (!userRole) return false;

    const rolePermissions = this.roles.get(userRole);
    const requiredPermissions = this.resourcePermissions.get(resourceId);

    if (!requiredPermissions) return true; // Unprotected resource
    if (!rolePermissions) return false;

    return Array.from(requiredPermissions).every(permission =>
      rolePermissions.has(permission)
    );
  }

  // Visual Indicators
  getResourceStatus(resourceId) {
    const permissions = this.resourcePermissions.get(resourceId);
    return {
      isProtected: Boolean(permissions?.size),
      visualCues: {
        padlock: Boolean(permissions?.size),
        colorScheme: permissions?.size ? 'muted' : 'normal'
      }
    };
  }

  // Utility Methods
  getRolePermissions(roleName) {
    return Array.from(this.roles.get(roleName) || []);
  }

  getUserPermissions(userId) {
    const roleName = this.userRoles.get(userId);
    return roleName ? this.getRolePermissions(roleName) : [];
  }
}

module.exports = RoleBasedAccessControl;