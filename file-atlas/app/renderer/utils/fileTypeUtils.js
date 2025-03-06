// fileTypeUtils.js - Utility functions for file type identification and styling
import * as d3 from 'd3';

export const fileTypeUtils = {
    // File type categories and their extensions
    typeDefinitions: {
        document: ['.txt', '.doc', '.docx', '.pdf', '.md', '.rtf'],
        image: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg'],
        audio: ['.mp3', '.wav', '.ogg', '.m4a', '.flac'],
        video: ['.mp4', '.avi', '.mov', '.wmv', '.flv'],
        archive: ['.zip', '.rar', '.7z', '.tar', '.gz'],
        code: ['.js', '.py', '.java', '.cpp', '.html', '.css'],
        data: ['.json', '.xml', '.csv', '.xlsx', '.db']
    },

    // Get file type based on extension
    getFileType(filename) {
        const ext = filename.toLowerCase().match(/\.[^.]*$/)?.[0];
        if (!ext) return 'unknown';

        for (const [type, extensions] of Object.entries(this.typeDefinitions)) {
            if (extensions.includes(ext)) return type;
        }
        return 'unknown';
    },

    // Get icon symbol for file type
    getTypeIcon(type) {
        const icons = {
            document: '📄',
            image: '🖼️',
            audio: '🎵',
            video: '🎬',
            archive: '📦',
            code: '💻',
            data: '📊',
            unknown: '📎'
        };
        return icons[type] || icons.unknown;
    },

    // Get color scheme for file type
    getTypeColor(type) {
        const colors = {
            document: '#4CAF50',  // Green
            image: '#FF9800',     // Orange
            audio: '#E91E63',     // Pink
            video: '#9C27B0',     // Purple
            archive: '#795548',    // Brown
            code: '#2196F3',      // Blue
            data: '#FFC107',      // Amber
            unknown: '#9E9E9E'    // Grey
        };
        return colors[type] || colors.unknown;
    },

    // Apply file type styling to node
    applyTypeStyles(node, viewType) {
        const fileType = this.getFileType(node.data.name);
        const baseColor = this.getTypeColor(fileType);

        // Apply different styling based on view type
        switch (viewType) {
            case 'tree':
                return {
                    fill: node.children ? '#ffffff' : d3.color(baseColor).brighter(0.8),
                    stroke: baseColor,
                    icon: this.getTypeIcon(fileType)
                };
            case 'treemap':
                return {
                    fill: d3.color(baseColor).brighter(0.5),
                    stroke: baseColor,
                    icon: this.getTypeIcon(fileType)
                };
            case 'force':
                return {
                    fill: node.children ? '#ffffff' : baseColor,
                    stroke: d3.color(baseColor).darker(0.5),
                    icon: this.getTypeIcon(fileType)
                };
            default:
                return {
                    fill: baseColor,
                    stroke: d3.color(baseColor).darker(0.2),
                    icon: this.getTypeIcon(fileType)
                };
        }
    }
};