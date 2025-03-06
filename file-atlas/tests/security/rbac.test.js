const { test, expect } = require('@jest/globals');
const RBAC = require('../../security/rbac');

describe('Role-Based Access Control Tests', () => {
    let rbac;

    beforeEach(() => {
        rbac = new RBAC();
    });

    describe('User Role Management', () => {
        test('Role Assignment', () => {
            const userId = 'user123';
            const role = 'editor';
            rbac.assignRole(userId, role);
            expect(rbac.getUserRole(userId)).toBe(role);
        });

        test('Role Validation', () => {
            const userId = 'user456';
            const invalidRole = 'invalid_role';
            expect(() => rbac.assignRole(userId, invalidRole)).toThrow();
        });

        test('Role Removal', () => {
            const userId = 'user789';
            const role = 'viewer';
            rbac.assignRole(userId, role);
            rbac.removeRole(userId);
            expect(rbac.getUserRole(userId)).toBeNull();
        });
    });

    describe('Permission Management', () => {
        test('Permission Check', () => {
            const userId = 'admin123';
            const resource = 'sensitive_folder';
            rbac.assignRole(userId, 'admin');
            expect(rbac.hasPermission(userId, 'read', resource)).toBeTruthy();
            expect(rbac.hasPermission(userId, 'write', resource)).toBeTruthy();
        });

        test('Permission Inheritance', () => {
            const userId = 'editor123';
            const resource = 'project_folder';
            rbac.assignRole(userId, 'editor');
            expect(rbac.hasPermission(userId, 'read', resource)).toBeTruthy();
            expect(rbac.hasPermission(userId, 'write', resource)).toBeTruthy();
            expect(rbac.hasPermission(userId, 'delete', resource)).toBeFalsy();
        });

        test('Resource Access Levels', () => {
            const userId = 'viewer123';
            const resource = 'public_folder';
            rbac.assignRole(userId, 'viewer');
            expect(rbac.hasPermission(userId, 'read', resource)).toBeTruthy();
            expect(rbac.hasPermission(userId, 'write', resource)).toBeFalsy();
        });
    });

    describe('Access Control Integration', () => {
        test('File System Operations', () => {
            const userId = 'user123';
            const filePath = '/protected/document.txt';
            rbac.assignRole(userId, 'editor');
            
            expect(rbac.canAccessFile(userId, filePath, 'read')).toBeTruthy();
            expect(rbac.canAccessFile(userId, filePath, 'write')).toBeTruthy();
            expect(rbac.canAccessFile(userId, filePath, 'delete')).toBeFalsy();
        });

        test('Folder Hierarchy Access', () => {
            const userId = 'user456';
            const folderPath = '/projects/team-a/';
            rbac.assignRole(userId, 'viewer');

            expect(rbac.canAccessFolder(userId, folderPath, 'read')).toBeTruthy();
            expect(rbac.canAccessFolder(userId, folderPath, 'write')).toBeFalsy();
        });

        test('Classification-based Access', () => {
            const userId = 'user789';
            const classifiedDoc = '/confidential/report.pdf';
            rbac.assignRole(userId, 'viewer');

            expect(rbac.canAccessClassified(userId, classifiedDoc, 2)).toBeFalsy();
            rbac.assignRole(userId, 'admin');
            expect(rbac.canAccessClassified(userId, classifiedDoc, 2)).toBeTruthy();
        });
    });

    describe('Audit Logging', () => {
        test('Access Attempt Logging', () => {
            const userId = 'user123';
            const resource = '/sensitive/data.txt';
            rbac.assignRole(userId, 'viewer');

            const accessAttempt = rbac.logAccessAttempt(userId, resource, 'write');
            expect(accessAttempt).toHaveProperty('timestamp');
            expect(accessAttempt).toHaveProperty('success', false);
            expect(accessAttempt).toHaveProperty('reason');
        });

        test('Role Change Logging', () => {
            const userId = 'user456';
            const oldRole = 'viewer';
            const newRole = 'editor';

            rbac.assignRole(userId, oldRole);
            const roleChange = rbac.logRoleChange(userId, oldRole, newRole);
            expect(roleChange).toHaveProperty('timestamp');
            expect(roleChange).toHaveProperty('oldRole', oldRole);
            expect(roleChange).toHaveProperty('newRole', newRole);
        });
    });
}));