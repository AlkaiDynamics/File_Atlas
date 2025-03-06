// ForceDirectedView.js - Force-directed graph visualization for file relationships
import * as d3 from 'd3';

class ForceDirectedView {
    constructor(containerId) {
        this.container = d3.select(containerId);
        this.width = 960;
        this.height = 800;
        
        this.initializeSVG();
        this.initializeTooltip();
        this.initializeForceSimulation();
    }

    initializeSVG() {
        this.container.attr('role', 'application')
            .attr('aria-label', 'Force-directed graph view of file system');

        this.svg = this.container.append('svg')
            .attr('width', this.width)
            .attr('height', this.height)
            .call(d3.zoom().scaleExtent([0.5, 3]).on('zoom', (event) => {
                this.svg.select('g').attr('transform', event.transform);
            }));

        this.g = this.svg.append('g');
    }

    initializeTooltip() {
        this.tooltip = this.container.append('div')
            .attr('class', 'tooltip')
            .style('opacity', 0)
            .style('position', 'absolute')
            .style('background-color', 'rgba(0, 0, 0, 0.8)')
            .style('color', 'white')
            .style('padding', '8px')
            .style('border-radius', '4px')
            .style('pointer-events', 'none');
    }

    initializeForceSimulation() {
        this.simulation = d3.forceSimulation()
            .force('link', d3.forceLink().id(d => d.id).distance(100))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(this.width / 2, this.height / 2))
            .force('collision', d3.forceCollide().radius(30));
    }

    async loadData() {
        try {
            const data = await window.fileAtlasAPI.getFileSystemData();
            const { nodes, links } = this.processData(data);
            this.render(nodes, links);
        } catch (error) {
            console.error('Error loading force-directed graph data:', error);
        }
    }

    processData(data) {
        const nodes = [];
        const links = [];
        let id = 0;

        function processNode(node, parentId = null) {
            const currentId = id++;
            nodes.push({
                id: currentId,
                name: node.name,
                type: node.type,
                size: node.size || 0
            });

            if (parentId !== null) {
                links.push({
                    source: parentId,
                    target: currentId,
                    value: 1
                });
            }

            if (node.children) {
                node.children.forEach(child => processNode(child, currentId));
            }
        }

        processNode(data);
        return { nodes, links };
    }

    render(nodes, links) {
        // Create links
        const link = this.g.selectAll('.link')
            .data(links)
            .enter().append('line')
            .attr('class', 'link')
            .style('stroke', '#999')
            .style('stroke-opacity', 0.6)
            .style('stroke-width', d => Math.sqrt(d.value));

        // Create nodes
        const node = this.g.selectAll('.node')
            .data(nodes)
            .enter().append('g')
            .attr('class', 'node')
            .attr('role', 'button')
            .attr('aria-label', d => `${d.name}: ${d.type}`)
            .attr('tabindex', 0)
            .call(d3.drag()
                .on('start', this.dragstarted.bind(this))
                .on('drag', this.dragged.bind(this))
                .on('end', this.dragended.bind(this)));

        // Add circles to nodes
        node.append('circle')
            .attr('r', d => Math.max(5, Math.sqrt(d.size / 1000)))
            .style('fill', d => this.getNodeColor(d.type))
            .style('stroke', '#fff')
            .style('stroke-width', 1.5)
            .on('mouseover', (event, d) => this.showTooltip(event, d))
            .on('mouseout', () => this.hideTooltip());

        // Add labels to nodes
        node.append('text')
            .attr('dx', 12)
            .attr('dy', '.35em')
            .text(d => d.name)
            .style('font-size', '10px');

        // Update simulation
        this.simulation
            .nodes(nodes)
            .on('tick', () => {
                link
                    .attr('x1', d => d.source.x)
                    .attr('y1', d => d.source.y)
                    .attr('x2', d => d.target.x)
                    .attr('y2', d => d.target.y);

                node
                    .attr('transform', d => `translate(${d.x},${d.y})`);
            });

        this.simulation.force('link')
            .links(links);
    }

    getNodeColor(type) {
        const colorMap = {
            'folder': '#2196f3',
            'file': '#4caf50',
            'protected': '#f44336',
            'default': '#9e9e9e'
        };
        return colorMap[type] || colorMap.default;
    }

    dragstarted(event) {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    }

    dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
    }

    dragended(event) {
        if (!event.active) this.simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
    }

    showTooltip(event, d) {
        this.tooltip.transition()
            .duration(200)
            .style('opacity', 0.9);

        this.tooltip.html(`
            <strong>${d.name}</strong><br/>
            Type: ${d.type}<br/>
            Size: ${this.formatSize(d.size)}
        `)
        .style('left', `${event.pageX + 10}px`)
        .style('top', `${event.pageY - 28}px`);
    }

    hideTooltip() {
        this.tooltip.transition()
            .duration(500)
            .style('opacity', 0);
    }

    formatSize(size) {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let value = size;
        let unitIndex = 0;
        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex++;
        }
        return `${Math.round(value * 100) / 100} ${units[unitIndex]}`;
    }
}

export default ForceDirectedView;