// sizeScaling.js - Utility functions for consistent node size scaling across views
import * as d3 from 'd3';

export const sizeScaling = {
    // Base scale for node sizes
    baseScale: d3.scaleLog()
        .domain([1, 1e9]) // 1 byte to 1GB
        .range([8, 40]), // Min to max node size in pixels

    // Get node size based on file/folder size with view-specific adjustments
    getNodeSize(size, viewType, zoomLevel = 1) {
        if (!size) return 8; // Minimum size for empty or undefined
        
        let baseSize = this.baseScale(size + 1); // Add 1 to handle 0 size
        
        // Apply view-specific scaling factors
        switch (viewType) {
            case 'tree':
                return Math.max(8, Math.min(20, baseSize * 0.5));
            case 'treemap':
                // Treemap uses area-based scaling
                return Math.sqrt(size) * zoomLevel;
            case 'force':
                return Math.max(8, Math.min(30, baseSize * 0.75));
            default:
                return baseSize;
        }
    },

    // Get color based on size and depth
    getNodeColor(size, depth) {
        const colors = ['#2196f3', '#64b5f6', '#90caf9', '#bbdefb', '#e3f2fd'];
        const colorIndex = Math.min(depth, colors.length - 1);
        return colors[colorIndex];
    },

    // Format size for display
    formatSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }
};