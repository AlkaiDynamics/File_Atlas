const { RoleBasedAccessControl } = require('../../security/rbac');

class FileSystemClassification {
  constructor() {
    this.rbac = new RoleBasedAccessControl();
    this.classifications = new Map();
    this.initializeDefaultClassifications();
  }

  initializeDefaultClassifications() {
    // Define standard classifications with RBAC integration
    this.addClassification('protected', {
      type: 'Protected Folder',
      requiredPermissions: ['read_protected'],
      visualProperties: {
        padlock: true,
        colorScheme: 'muted',
        icon: 'lock'
      }
    });

    this.addClassification('restricted', {
      type: 'Restricted Access',
      requiredPermissions: ['read_restricted'],
      visualProperties: {
        padlock: true,
        colorScheme: 'highly-muted',
        icon: 'shield-lock'
      }
    });

    this.addClassification('standard', {
      type: 'Standard Access',
      requiredPermissions: ['read_standard'],
      visualProperties: {
        padlock: false,
        colorScheme: 'normal',
        icon: 'folder'
      }
    });
  }

  addClassification(name, properties) {
    this.classifications.set(name, properties);
    if (properties.requiredPermissions) {
      // Integrate with RBAC system
      this.rbac.protectResource(name, properties.requiredPermissions);
    }
  }

  classifyNode(node, userId) {
    // Determine node classification based on path or metadata
    const classification = this.determineClassification(node);
    const properties = this.classifications.get(classification);

    if (!properties) return this.classifications.get('standard');

    // Check access permissions
    const canAccess = this.rbac.canAccess(userId, classification);
    
    return {
      ...properties,
      accessible: canAccess,
      visualProperties: {
        ...properties.visualProperties,
        // Apply muted colors and padlock for protected/restricted content
        colorScheme: canAccess ? properties.visualProperties.colorScheme : 'restricted',
        padlock: !canAccess || properties.visualProperties.padlock
      }
    };
  }

  determineClassification(node) {
    // Logic to determine classification based on node properties
    // This could check path patterns, metadata, or other criteria
    if (node.path.includes('protected')) return 'protected';
    if (node.path.includes('restricted')) return 'restricted';
    return 'standard';
  }

  getVisualProperties(node, userId) {
    const classification = this.classifyNode(node, userId);
    return classification.visualProperties;
  }
}

module.exports = FileSystemClassification;