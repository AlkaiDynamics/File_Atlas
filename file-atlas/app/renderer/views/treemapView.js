// TreemapView.js - Storage-centric visualization using D3.js treemap layout
import * as d3 from 'd3';
import { sizeScaling } from '../utils/sizeScaling.js';

class TreemapView {
    constructor(containerId) {
        this.container = d3.select(containerId);
        this.margin = { top: 40, right: 10, bottom: 10, left: 10 };
        this.width = 960 - this.margin.left - this.margin.right;
        this.height = 800 - this.margin.top - this.margin.bottom;
        
        this.initializeSVG();
        this.initializeTooltip();
    }

    initializeSVG() {
        this.container.attr('role', 'treegrid')
            .attr('aria-label', 'File system treemap view');

        this.svg = this.container.append('svg')
            .attr('width', this.width + this.margin.left + this.margin.right)
            .attr('height', this.height + this.margin.top + this.margin.bottom)
            .append('g')
            .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

        this.treemap = d3.treemap()
            .size([this.width, this.height])
            .paddingTop(28)
            .paddingRight(7)
            .paddingInner(3);
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

    async loadData() {
        try {
            const data = await window.fileAtlasAPI.getFileSystemData();
            this.root = d3.hierarchy(data)
                .sum(d => d.size || 0)
                .sort((a, b) => b.value - a.value);

            this.render(this.root);
        } catch (error) {
            console.error('Error loading treemap data:', error);
        }
    }

    render(root) {
        this.treemap(root);

        const cell = this.svg.selectAll('g')
            .data(root.descendants())
            .enter().append('g')
            .attr('transform', d => `translate(${d.x0},${d.y0})`)
            .attr('role', 'gridcell')
            .attr('aria-label', d => `${d.data.name}: ${this.formatSize(d.value)}`)
            .attr('tabindex', 0);

        cell.append('rect')
            .attr('id', d => `rect-${d.data.id}`)
            .attr('width', d => d.x1 - d.x0)
            .attr('height', d => d.y1 - d.y0)
            .attr('fill', d => this.colorScale(d.depth, d.value))
            .attr('stroke', '#fff')
            .on('mouseover', (event, d) => this.showTooltip(event, d))
            .on('mouseout', () => this.hideTooltip());

        cell.append('clipPath')
            .attr('id', d => `clip-${d.data.id}`)
            .append('use')
            .attr('xlink:href', d => `#rect-${d.data.id}`);

        cell.append('text')
            .attr('clip-path', d => `url(#clip-${d.data.id})`)
            .selectAll('tspan')
            .data(d => d.data.name.split(/(?=[A-Z][^A-Z])/g))
            .enter().append('tspan')
            .attr('x', 4)
            .attr('y', (d, i) => 13 + i * 10)
            .text(d => d);
    }

    colorScale(depth, size) {
        return sizeScaling.getNodeColor(size, depth);
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

    showTooltip(event, d) {
        this.tooltip.transition()
            .duration(200)
            .style('opacity', 0.9);

        this.tooltip.html(`
            <strong>${d.data.name}</strong><br/>
            Size: ${this.formatSize(d.value)}<br/>
            Type: ${d.data.type || 'Unknown'}
        `)
        .style('left', `${event.pageX + 10}px`)
        .style('top', `${event.pageY - 28}px`);
    }

    hideTooltip() {
        this.tooltip.transition()
            .duration(500)
            .style('opacity', 0);
    }
}

export default TreemapView;