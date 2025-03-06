// TreeView.js - Hierarchical Tree Visualization with D3.js
import * as d3 from 'd3';
import { ipcRenderer } from 'electron';
import { sizeScaling } from '../utils/sizeScaling.js';
import { fileTypeUtils } from '../utils/fileTypeUtils.js';

class TreeView {
    constructor(containerId) {
        this.container = d3.select(containerId);
        this.margin = { top: 20, right: 90, bottom: 30, left: 90 };
        this.width = 960 - this.margin.left - this.margin.right;
        this.height = 800 - this.margin.top - this.margin.bottom;
        this.visibleNodes = new Set();
        this.virtualizedNodes = new Map();
        this.loadThreshold = 50;
        this.batchSize = 20;
        
        this.initializeSVG();
        this.initializeTooltip();
        this.setupKeyboardNavigation();
        this.setupVirtualization();
        this.loadData();
    }

    setupVirtualization() {
        this.viewportObserver = new IntersectionObserver(
            (entries) => this.handleVisibilityChange(entries),
            { threshold: 0.1 }
        );

        this.debouncedUpdate = this.debounce(() => this.updateVisibleNodes(), 100);
        window.addEventListener('scroll', this.debouncedUpdate);
        window.addEventListener('resize', this.debouncedUpdate);
    }

    handleVisibilityChange(entries) {
        entries.forEach(entry => {
            const nodeId = entry.target.getAttribute('data-node-id');
            if (entry.isIntersecting) {
                this.visibleNodes.add(nodeId);
                this.renderNode(nodeId);
            } else {
                this.visibleNodes.delete(nodeId);
                this.virtualizeNode(nodeId);
            }
        });
    }

    virtualizeNode(nodeId) {
        const node = this.virtualizedNodes.get(nodeId);
        if (node && node.element) {
            node.element.style.display = 'none';
        }
    }

    renderNode(nodeId) {
        const node = this.virtualizedNodes.get(nodeId);
        if (node) {
            node.element.style.display = '';
            if (!node.isInitialized) {
                this.initializeNodeContent(node);
                node.isInitialized = true;
            }
        }
    }

    initializeNodeContent(node) {
        // Lazy load node content and attach event handlers
        const nodeElement = d3.select(node.element);
        nodeElement
            .on('click', this.handleNodeClick.bind(this))
            .on('mouseover', this.handleMouseOver.bind(this))
            .on('mouseout', this.handleMouseOut.bind(this));
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    updateVisibleNodes() {
        const viewportTop = window.scrollY;
        const viewportBottom = viewportTop + window.innerHeight;
        
        this.virtualizedNodes.forEach((node, nodeId) => {
            const rect = node.element.getBoundingClientRect();
            const isVisible = rect.top < viewportBottom && rect.bottom > viewportTop;
            
            if (isVisible && !this.visibleNodes.has(nodeId)) {
                this.visibleNodes.add(nodeId);
                this.renderNode(nodeId);
            } else if (!isVisible && this.visibleNodes.has(nodeId)) {
                this.visibleNodes.delete(nodeId);
                this.virtualizeNode(nodeId);
            }
        });
    }

    initializeSVG() {
        this.container.attr('role', 'tree')
            .attr('aria-label', 'File system tree view');

        this.svg = this.container.append('svg')
            .attr('width', this.width + this.margin.left + this.margin.right)
            .attr('height', this.height + this.margin.top + this.margin.bottom)
            .call(d3.zoom().scaleExtent([0.5, 3]).on('zoom', (event) => {
                this.svg.select('g').attr('transform', event.transform);
            }))
            .append('g')
            .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

        this.tree = d3.tree().size([this.height, this.width]);
    }

    initializeTooltip() {
        this.tooltip = this.container.append('div')
            .attr('class', 'tooltip')
            .style('opacity', 0)
            .style('position', 'absolute')
            .style('background-color', 'white')
            .style('border', '1px solid #ddd')
            .style('border-radius', '4px')
            .style('padding', '10px')
            .style('pointer-events', 'none');
    }

    async loadData() {
        try {
            const data = await ipcRenderer.invoke('get-file-system-data');
            this.root = d3.hierarchy(data);
            this.root.x0 = this.height / 2;
            this.root.y0 = 0;
            this.update(this.root);
        } catch (error) {
            console.error('Error loading file system data:', error);
        }
    }

    update(source) {
        const duration = 750;
        const nodes = this.root.descendants();
        const links = this.root.links();

        // Compute the new tree layout with batch processing
        this.tree(this.root);
        
        // Process nodes in batches for better performance
        const processBatch = (startIndex) => {
            const endIndex = Math.min(startIndex + this.batchSize, nodes.length);
            const batchNodes = nodes.slice(startIndex, endIndex);

            // Update nodes in current batch
            const node = this.svg.selectAll('g.node')
                .data(batchNodes, d => d.id || (d.id = ++this.i));

            // Enter new nodes with optimized rendering
            const nodeEnter = node.enter().append('g')
                .attr('class', 'node')
                .attr('data-node-id', d => d.id)
                .attr('transform', d => `translate(${source.y0},${source.x0})`)
                .attr('tabindex', 0)
                .attr('role', 'treeitem')
                .attr('aria-expanded', d => d.children ? 'true' : 'false');

            // Add to virtualization tracking
            batchNodes.forEach(d => {
                if (!this.virtualizedNodes.has(d.id)) {
                    this.virtualizedNodes.set(d.id, {
                        element: nodeEnter.filter(n => n.id === d.id).node(),
                        isInitialized: false
                    });
                }
            });

            // Observe new nodes for virtualization
            nodeEnter.nodes().forEach(node => {
                this.viewportObserver.observe(node);
            });

            // Process next batch if available
            if (endIndex < nodes.length) {
                requestAnimationFrame(() => processBatch(endIndex));
            }
        };

        // Start batch processing
        processBatch(0);

        // Update links with optimized rendering
        const link = this.svg.selectAll('path.link')
            .data(links, d => d.target.id);

        // Enter new links with smooth transitions
        const linkEnter = link.enter().insert('path', 'g')
            .attr('class', 'link')
            .attr('d', d => {
                const o = {x: source.x0, y: source.y0};
                return this.diagonal({source: o, target: o});
            });

        // Transition links to their new position
        linkEnter.merge(link)
            .transition()
            .duration(duration)
            .attr('d', this.diagonal);

        // Remove any exiting links
        link.exit()
            .transition()
            .duration(duration)
            .attr('d', d => {
                const o = {x: source.x, y: source.y};
                return this.diagonal({source: o, target: o});
            })
            .remove();

        // Store the old positions for transition
        nodes.forEach(d => {
            d.x0 = d.x;
            d.y0 = d.y;
        });
    }

    // Event Handlers
    setupEventHandlers() {
        this.svg.selectAll('.node')
            .on('click', (event, d) => this.handleNodeClick(event, d))
            .on('mouseover', (event, d) => this.handleMouseOver(event, d))
            .on('mouseout', (event, d) => this.handleMouseOut(event, d));
    }

    handleNodeClick(event, d) {
        // Toggle children with proper ARIA attribute management
        if (d.children) {
            d._children = d.children;
            d.children = null;
            d3.select(event.currentTarget).attr('aria-expanded', 'false');
        } else if (d._children) {
            d.children = d._children;
            d._children = null;
            d3.select(event.currentTarget).attr('aria-expanded', 'true');
        }

        // Visual feedback animation for the clicked node
        const node = d3.select(event.currentTarget);
        node.select('circle')
            .transition()
            .duration(300)
            .attr('r', 12)
            .style('stroke', '#4CAF50')
            .style('stroke-width', '3px')
            .transition()
            .duration(300)
            .attr('r', 10)
            .style('stroke', d => d.children || d._children ? '#2196f3' : '#90caf9')
            .style('stroke-width', '2px');

        // Update the tree with smooth transition
        this.update(d);
    }

    handleMouseOver(event, d) {
        // Enhanced hover effect with smooth transition
        d3.select(event.currentTarget).select('circle')
            .transition()
            .duration(200)
            .attr('r', 12)
            .style('stroke-width', '3px')
            .style('stroke-opacity', 1)
            .style('filter', 'drop-shadow(0 3px 5px rgba(0,0,0,0.3))');

        // Show and position the tooltip with metadata
        this.tooltip.transition()
            .duration(200)
            .style('opacity', 0.9);

        const metadata = d.data.metadata || {};
        const content = `
            <strong>${d.data.name}</strong><br/>
            ${metadata.size ? `Size: ${metadata.size}<br/>` : ''}
            ${metadata.modified ? `Modified: ${metadata.modified}<br/>` : ''}
            ${metadata.type ? `Type: ${metadata.type}` : ''}
        `;

        this.tooltip.html(content)
            .style('left', `${event.pageX + 10}px`)
            .style('top', `${event.pageY - 28}px`)
            .attr('role', 'tooltip')
            .attr('aria-hidden', 'false');
    }

    handleMouseOut(event) {
        // Smooth transition back to original state
        d3.select(event.currentTarget).select('circle')
            .transition()
            .duration(200)
            .attr('r', 10)
            .style('stroke-width', d => Math.max(2, 4 - d.depth * 0.5) + 'px')
            .style('stroke-opacity', 0.85)
            .style('filter', 'drop-shadow(0 2px 3px rgba(0,0,0,0.2))');

        // Hide tooltip with fade out animation
        this.tooltip.transition()
            .duration(500)
            .style('opacity', 0)
            .attr('aria-hidden', 'true');
    }

    // Keyboard Navigation
    setupKeyboardNavigation() {
        document.addEventListener('keydown', (event) => {
            const focusedElement = document.activeElement;
            if (focusedElement.classList.contains('node')) {
                switch (event.key) {
                    case 'ArrowDown':
                        event.preventDefault();
                        this.focusNextNode(focusedElement);
                        break;
                    case 'ArrowUp':
                        event.preventDefault();
                        this.focusPreviousNode(focusedElement);
                        break;
                    case 'ArrowRight':
                        event.preventDefault();
                        const rightNode = d3.select(focusedElement).datum();
                        if (rightNode._children) {
                            this.handleNodeClick(null, rightNode);
                        }
                        break;
                    case 'ArrowLeft':
                        event.preventDefault();
                        const leftNode = d3.select(focusedElement).datum();
                        if (leftNode.children) {
                            this.handleNodeClick(null, leftNode);
                        } else if (leftNode.parent) {
                            d3.select(leftNode.parent).node().focus();
                        }
                        break;
                    case 'Enter':
                    case ' ':
                        event.preventDefault();
                        const d = d3.select(focusedElement).datum();
                        this.handleNodeClick(null, d);
                        break;
                    case 'Escape':
                        event.preventDefault();
                        this.clearNodeFocus();
                        break;
                    case 'Home':
                        event.preventDefault();
                        this.svg.select('.node').node().focus();
                        break;
                    case 'End':
                        event.preventDefault();
                        const nodes = this.svg.selectAll('.node').nodes();
                        nodes[nodes.length - 1].focus();
                        break;
                }
            }
        });
    }

    focusNextNode(currentNode) {
        const nodes = this.svg.selectAll('.node').nodes();
        const currentIndex = nodes.indexOf(currentNode);
        if (currentIndex < nodes.length - 1) {
            nodes[currentIndex + 1].focus();
        }
    }

    focusPreviousNode(currentNode) {
        const nodes = this.svg.selectAll('.node').nodes();
        const currentIndex = nodes.indexOf(currentNode);
        if (currentIndex > 0) {
            nodes[currentIndex - 1].focus();
        }
    }

    clearNodeFocus() {
        document.activeElement.blur();
    }

    // Helper function for drawing enhanced curved links
    diagonal(d) {
        return d3.linkHorizontal()
            .x(d => d.y)
            .y(d => d.x)
            (d);
    }
}

export default TreeView;