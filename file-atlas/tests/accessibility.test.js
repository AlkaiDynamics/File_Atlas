const { test, expect } = require('@jest/globals');
const KeyboardNavigation = require('../app/renderer/components/keyboardNavigation');

describe('Accessibility Tests', () => {
    let keyboardNav;
    let mockDocument;

    beforeEach(() => {
        // Setup mock DOM
        document.body.innerHTML = `
            <div class="file-tree" role="tree">
                <div class="node" data-node-id="root" data-depth="0" role="treeitem" aria-level="1">
                    Root Folder
                    <div class="node" data-node-id="child1" role="treeitem" aria-level="2">
                        Child 1
                    </div>
                    <div class="node expanded" data-node-id="child2" role="treeitem" aria-level="2">
                        Child 2
                    </div>
                </div>
            </div>
        `;
        keyboardNav = new KeyboardNavigation();
    });

    describe('Keyboard Navigation', () => {
        test('Arrow key navigation', () => {
            // Test down arrow
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
            expect(document.querySelector('[data-node-id="child1"]').classList.contains('focused')).toBeTruthy();

            // Test up arrow
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
            expect(document.querySelector('[data-node-id="root"]').classList.contains('focused')).toBeTruthy();
        });

        test('Expand/Collapse functionality', () => {
            // Set initial focus
            keyboardNav.setFocus('root');

            // Test expand
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
            const expandedNode = document.querySelector('[data-node-id="root"]');
            expect(expandedNode.getAttribute('aria-expanded')).toBe('true');

            // Test collapse
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
            expect(expandedNode.getAttribute('aria-expanded')).toBe('false');
        });

        test('Enter key functionality', () => {
            keyboardNav.setFocus('child1');
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
            const toggledNode = document.querySelector('[data-node-id="child1"]');
            expect(toggledNode.classList.contains('expanded')).toBeTruthy();
        });
    });

    describe('ARIA Attributes', () => {
        test('Proper ARIA roles', () => {
            const treeView = document.querySelector('.file-tree');
            const treeItems = document.querySelectorAll('[role="treeitem"]');

            expect(treeView.getAttribute('role')).toBe('tree');
            expect(treeItems.length).toBeGreaterThan(0);
        });

        test('Proper ARIA states', () => {
            const rootNode = document.querySelector('[data-node-id="root"]');
            keyboardNav.setFocus('root');

            expect(rootNode.getAttribute('aria-selected')).toBe('true');
            expect(rootNode.getAttribute('aria-expanded')).toBeDefined();
            expect(rootNode.getAttribute('aria-level')).toBe('1');
        });

        test('Focus management', () => {
            keyboardNav.setFocus('child2');
            const focusedNode = document.querySelector('[data-node-id="child2"]');

            expect(focusedNode.getAttribute('aria-selected')).toBe('true');
            expect(focusedNode.classList.contains('focused')).toBeTruthy();
        });
    });

    describe('Screen Reader Support', () => {
        test('Descriptive node labels', () => {
            const nodes = document.querySelectorAll('.node');
            nodes.forEach(node => {
                expect(node.textContent.trim()).toBeTruthy();
            });
        });

        test('Hierarchical structure', () => {
            const rootNode = document.querySelector('[data-node-id="root"]');
            const childNode = document.querySelector('[data-node-id="child1"]');

            expect(parseInt(rootNode.getAttribute('aria-level'))).toBeLessThan(
                parseInt(childNode.getAttribute('aria-level'))
            );
        });
    });
});