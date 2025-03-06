// Keyboard navigation and accessibility logic for File Atlas

class KeyboardNavigation {
    constructor() {
        this.currentFocus = null;
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        document.addEventListener('keydown', this.handleKeyPress.bind(this));
    }

    handleKeyPress(event) {
        switch(event.key) {
            case 'ArrowRight':
                this.expandNode();
                event.preventDefault();
                break;
            case 'ArrowLeft':
                this.collapseNode();
                event.preventDefault();
                break;
            case 'ArrowUp':
                this.navigateUp();
                event.preventDefault();
                break;
            case 'ArrowDown':
                this.navigateDown();
                event.preventDefault();
                break;
            case 'Enter':
                this.toggleNode();
                event.preventDefault();
                break;
            case 'Home':
                this.navigateToRoot();
                event.preventDefault();
                break;
            case 'Escape':
                this.clearNodeFocus();
                event.preventDefault();
                break;
            case ' ':
                this.selectNode();
                event.preventDefault();
                break;
        }
    }

    expandNode() {
        if (this.currentFocus) {
            const node = document.querySelector(`[data-node-id="${this.currentFocus}"]`);
            if (node && !node.classList.contains('expanded')) {
                node.dispatchEvent(new Event('expand'));
            }
        }
    }

    collapseNode() {
        if (this.currentFocus) {
            const node = document.querySelector(`[data-node-id="${this.currentFocus}"]`);
            if (node && node.classList.contains('expanded')) {
                node.dispatchEvent(new Event('collapse'));
            }
        }
    }

    navigateUp() {
        if (this.currentFocus) {
            const nodes = document.querySelectorAll('.node');
            const currentIndex = Array.from(nodes).findIndex(
                node => node.dataset.nodeId === this.currentFocus
            );
            if (currentIndex > 0) {
                this.setFocus(nodes[currentIndex - 1].dataset.nodeId);
            }
        }
    }

    navigateDown() {
        if (this.currentFocus) {
            const nodes = document.querySelectorAll('.node');
            const currentIndex = Array.from(nodes).findIndex(
                node => node.dataset.nodeId === this.currentFocus
            );
            if (currentIndex < nodes.length - 1) {
                this.setFocus(nodes[currentIndex + 1].dataset.nodeId);
            }
        }
    }

    toggleNode() {
        if (this.currentFocus) {
            const node = document.querySelector(`[data-node-id="${this.currentFocus}"]`);
            if (node) {
                node.dispatchEvent(new Event('toggle'));
            }
        }
    }

    navigateToRoot() {
        const rootNode = document.querySelector('.node[data-depth="0"]');
        if (rootNode) {
            this.setFocus(rootNode.dataset.nodeId);
        }
    }

    selectNode() {
        if (this.currentFocus) {
            const node = document.querySelector(`[data-node-id="${this.currentFocus}"]`);
            if (node) {
                node.dispatchEvent(new Event('select'));
            }
        }
    }

    setFocus(nodeId) {
        if (this.currentFocus) {
            const oldNode = document.querySelector(`[data-node-id="${this.currentFocus}"]`);
            if (oldNode) {
                oldNode.setAttribute('aria-selected', 'false');
                oldNode.setAttribute('aria-expanded', oldNode.classList.contains('expanded'));
                oldNode.classList.remove('focused');
            }
        }

        const newNode = document.querySelector(`[data-node-id="${nodeId}"]`);
        if (newNode) {
            this.currentFocus = nodeId;
            newNode.setAttribute('aria-selected', 'true');
            newNode.setAttribute('aria-expanded', newNode.classList.contains('expanded'));
            newNode.classList.add('focused');
            newNode.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

    clearNodeFocus() {
        if (this.currentFocus) {
            const node = document.querySelector(`[data-node-id="${this.currentFocus}"]`);
            if (node) {
                node.setAttribute('aria-selected', 'false');
                node.classList.remove('focused');
            }
            this.currentFocus = null;
        }
    }
}

export default KeyboardNavigation;