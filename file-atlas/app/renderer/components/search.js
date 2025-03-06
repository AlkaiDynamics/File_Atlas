// Search component for file system navigation
import * as d3 from 'd3';

class SearchComponent {
    constructor(containerId) {
        this.container = d3.select(containerId);
        this.initializeSearchBar();
    }

    initializeSearchBar() {
        const searchContainer = this.container
            .insert('div', ':first-child')
            .attr('class', 'search-container')
            .style('margin-bottom', '15px')
            .style('position', 'relative');

        // Add search icon
        searchContainer.append('span')
            .attr('class', 'search-icon')
            .style('position', 'absolute')
            .style('left', '10px')
            .style('top', '50%')
            .style('transform', 'translateY(-50%)')
            .style('color', '#666')
            .html('🔍');

        // Add clear button
        const clearButton = searchContainer.append('span')
            .attr('class', 'clear-button')
            .style('position', 'absolute')
            .style('right', '10px')
            .style('top', '50%')
            .style('transform', 'translateY(-50%)')
            .style('color', '#666')
            .style('cursor', 'pointer')
            .style('display', 'none')
            .html('✕')
            .on('click', () => this.clearSearch());

        this.searchInput = searchContainer.append('input')
            .attr('type', 'text')
            .attr('class', 'search-input')
            .attr('placeholder', 'Search files and folders...')
            .attr('aria-label', 'Search files and folders')
            .style('width', '100%')
            .style('padding', '8px 35px')
            .style('border', '1px solid #ddd')
            .style('border-radius', '4px')
            .style('font-size', '14px')
            .style('transition', 'all 0.3s ease');

        this.searchInput.on('input', () => this.handleSearch());
    }

    handleSearch() {
        const searchTerm = this.searchInput.node().value.toLowerCase();
        
        // Show/hide clear button based on search term
        d3.select('.clear-button')
            .style('display', searchTerm ? 'block' : 'none');

        // Add visual feedback to search input
        this.searchInput
            .style('border-color', searchTerm ? '#3498db' : '#ddd')
            .style('box-shadow', searchTerm ? '0 0 5px rgba(52, 152, 219, 0.3)' : 'none');
        
        // Select all nodes in the tree
        const nodes = d3.selectAll('.node');

        if (!searchTerm) {
            // Reset all nodes to full opacity if search is empty
            nodes
                .style('opacity', 1)
                .style('pointer-events', 'all');
            return;
        }

        // Filter nodes based on search term
        nodes.each(function(d) {
            const node = d3.select(this);
            const name = d.data.name.toLowerCase();
            const match = name.includes(searchTerm);

            // Set opacity based on match
            node
                .style('opacity', match ? 1 : 0.3)
                .style('pointer-events', match ? 'all' : 'none');

            // Highlight matching text
            node.select('text')
                .style('font-weight', match ? 'bold' : 'normal')
                .style('fill', match ? '#2ecc71' : '#000');
        });
    }

    // Method to clear search
    clearSearch() {
        this.searchInput.node().value = '';
        this.handleSearch();
    }
}

export default SearchComponent;