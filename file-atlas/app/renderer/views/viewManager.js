// ViewManager.js - Manages different visualization modes and transitions
import TreeView from './treeView.js';
import TreemapView from './treemapView.js';
import ForceDirectedView from './forceDirectedView.js';

class ViewManager {
    constructor(containerId) {
        this.container = document.querySelector(containerId);
        this.currentView = null;
        this.views = {};
        this.zoomState = {};
        this.transitionDuration = 750;

        // Initialize views with zoom state preservation
        const viewClasses = {
            tree: TreeView,
            treemap: TreemapView,
            force: ForceDirectedView
        };

        Object.entries(viewClasses).forEach(([id, ViewClass]) => {
            this.views[id] = new ViewClass(containerId);
            this.zoomState[id] = { scale: 1, x: 0, y: 0 };
        });

        this.initializeViewSelector();
        this.switchView('tree'); // Default view
    }

    initializeViewSelector() {
        const selector = document.createElement('div');
        selector.className = 'view-selector';
        selector.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: white;
            border-radius: 4px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            padding: 10px;
            z-index: 1000;
        `;

        const views = [
            { id: 'tree', label: 'Hierarchical Tree', icon: '🌳' },
            { id: 'treemap', label: 'Storage Treemap', icon: '📊' },
            { id: 'force', label: 'Force-Directed', icon: '🔄' }
        ];

        views.forEach(view => {
            const button = document.createElement('button');
            button.className = 'view-button';
            button.setAttribute('aria-label', view.label);
            button.style.cssText = `
                display: block;
                width: 100%;
                padding: 8px 15px;
                margin: 5px 0;
                border: none;
                background: #f5f5f5;
                border-radius: 4px;
                cursor: pointer;
                transition: background 0.3s;
                text-align: left;
                font-size: 14px;
            `;
            button.innerHTML = `${view.icon} ${view.label}`;
            button.onclick = () => this.switchView(view.id);

            button.onmouseover = () => {
                button.style.background = '#e0e0e0';
            };
            button.onmouseout = () => {
                button.style.background = '#f5f5f5';
            };

            selector.appendChild(button);
        });

        this.container.parentNode.insertBefore(selector, this.container);
    }

    async switchView(viewId) {
        if (this.currentView) {
            // Store current view's zoom state
            const currentViewId = Object.keys(this.views).find(key => this.views[key] === this.currentView);
            if (currentViewId) {
                const transform = this.currentView.svg?.node()?.__zoom;
                if (transform) {
                    this.zoomState[currentViewId] = { scale: transform.k, x: transform.x, y: transform.y };
                }
            }

            // Fade out current view
            d3.select(this.container)
                .transition()
                .duration(this.transitionDuration / 2)
                .style('opacity', 0);
        }

        const view = this.views[viewId];
        if (!view) {
            console.error(`View ${viewId} not found`);
            return;
        }

        // Clear container after fade out
        await new Promise(resolve => setTimeout(resolve, this.transitionDuration / 2));
        this.container.innerHTML = '';

        this.currentView = view;
        await view.loadData(); // Load and render the new view

        // Restore zoom state
        const savedZoomState = this.zoomState[viewId];
        if (savedZoomState && view.svg) {
            view.svg.call(
                d3.zoom().transform,
                d3.zoomIdentity
                    .translate(savedZoomState.x, savedZoomState.y)
                    .scale(savedZoomState.scale)
            );
        }

        // Fade in new view
        d3.select(this.container)
            .style('opacity', 0)
            .transition()
            .duration(this.transitionDuration / 2)
            .style('opacity', 1);

        // Update active button state
        document.querySelectorAll('.view-button').forEach(button => {
            const isActive = button.textContent.includes(viewId);
            button.style.background = isActive ? '#e0e0e0' : '#f5f5f5';
            button.style.fontWeight = isActive ? 'bold' : 'normal';
        });
    }
}

export default ViewManager;