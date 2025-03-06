import * as d3 from 'd3';
import { showTooltip, hideTooltip } from './components/tooltip.js';
import { updateBreadcrumbs } from './components/breadcrumbs.js';
import SearchComponent from './components/search.js';
import TreeView from './views/treeView.js';

let svg, root;
let currentTransform = d3.zoomIdentity;

// Initialize visualization when the DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Initialize tree view and search components
    const treeView = new TreeView('#tree-container');
    const searchComponent = new SearchComponent('#tree-container');

    // Load initial data
    const data = await window.fileAtlasAPI.getFileSystemData();
    treeView.loadData(data);

    // Listen for file system updates
    window.fileAtlasAPI.onFileSystemUpdate((event) => {
      console.log('File system update:', event);
      refreshVisualization();
    });
  } catch (error) {
    console.error('Error loading file system data:', error);
  }
});

async function refreshVisualization() {
  try {
    const data = await window.fileAtlasAPI.getFileSystemData();
    renderVisualization(data);
  } catch (error) {
    console.error('Error refreshing visualization:', error);
  }
}

function renderVisualization(data) {
  // Get container dimensions for responsive sizing
  const container = document.getElementById('tree-container');
  const width = container.clientWidth;
  const height = container.clientHeight;
  const padding = 40; // Padding to prevent nodes from touching borders
  
  const treeLayout = d3.tree().size([height - (padding * 2), width - (padding * 2)]);
  root = d3.hierarchy(data);
  treeLayout(root);

  // Clear existing visualization
  d3.select('#tree-container').selectAll('svg').remove();

  // Create new SVG with zoom support
  svg = d3.select('#tree-container').append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .call(d3.zoom().on('zoom', handleZoom))
    .append('g')
    .attr('transform', `translate(${padding},${padding}) ${currentTransform}`);

  // Add resize observer to handle window/container resizing
  const resizeObserver = new ResizeObserver(() => {
    const newWidth = container.clientWidth;
    const newHeight = container.clientHeight;
    svg.attr('viewBox', `0 0 ${newWidth} ${newHeight}`);
    treeLayout.size([newHeight - (padding * 2), newWidth - (padding * 2)]);
    update(root);
  });
  
  resizeObserver.observe(container);

  function handleZoom(event) {
    currentTransform = event.transform;
    svg.attr('transform', currentTransform);
  }

  // Draw links between nodes
  svg.selectAll('.link')
    .data(root.links())
    .enter().append('path')
    .attr('class', 'link')
    .attr('d', d3.linkHorizontal()
      .x(d => d.y)
      .y(d => d.x));

  // Create node groups
  const node = svg.selectAll('.node')
    .data(root.descendants())
    .enter().append('g')
    .attr('class', d => {
      const isNearEdge = d.y < padding * 2 || d.y > width - padding * 2 || 
                        d.x < padding * 2 || d.x > height - padding * 2;
      return `node ${d.children ? 'node--internal' : 'node--leaf'} ${isNearEdge ? 'node--edge' : ''}`;
    })
    .attr('transform', d => `translate(${d.y},${d.x})`)
    .attr('role', 'treeitem')
    .attr('aria-expanded', d => d.children ? 'false' : undefined)
    .attr('tabindex', 0)
    .on('click', toggleNode)
    .on('keydown', handleKeyNavigation)
    .on('mouseover', showTooltip)
    .on('mouseout', hideTooltip);

  // Add circles to nodes
  node.append('circle')
    .attr('r', 10)
    .attr('fill', d => d.data.subtype === 'protected' ? 'gray' : 'steelblue');

  // Add text labels
  node.append('text')
    .attr('dy', 3)
    .attr('x', d => d.children ? -12 : 12)
    .style('text-anchor', d => d.children ? 'end' : 'start')
    .text(d => d.data.name);
}

function toggleNode(event, d) {
  if (d.children) {
    d._children = d.children;
    d.children = null;
    event.target.closest('.node').setAttribute('aria-expanded', 'false');
  } else if (d._children) {
    d.children = d._children;
    d._children = null;
    event.target.closest('.node').setAttribute('aria-expanded', 'true');
  }

  // Apply transition to the node
  const node = d3.select(event.target.closest('.node'));
  node.select('circle')
    .transition()
    .duration(300)
    .attr('r', 12)
    .transition()
    .duration(300)
    .attr('r', 10);

  // Update visualization with transition
  const transition = svg.transition().duration(750);
  renderVisualization(d.data);
  updateBreadcrumbs(d);

  // Add visual feedback
  node.select('circle')
    .style('stroke', '#4CAF50')
    .style('stroke-width', '2px')
    .transition()
    .duration(750)
    .style('stroke', null)
    .style('stroke-width', null);
}

function handleKeyNavigation(event) {
  const currentNode = event.target.closest('.node');
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      focusNextNode(currentNode);
      break;
    case 'ArrowUp':
      event.preventDefault();
      focusPreviousNode(currentNode);
      break;
    case 'Enter':
    case ' ':
      event.preventDefault();
      currentNode.dispatchEvent(new Event('click'));
      break;
    case 'Escape':
      event.preventDefault();
      clearNodeFocus();
      break;
  }
}

function focusNextNode(currentNode) {
  const nodes = document.querySelectorAll('.node');
  const currentIndex = Array.from(nodes).indexOf(currentNode);
  if (currentIndex < nodes.length - 1) {
    nodes[currentIndex + 1].focus();
  }
}

function focusPreviousNode(currentNode) {
  const nodes = document.querySelectorAll('.node');
  const currentIndex = Array.from(nodes).indexOf(currentNode);
  if (currentIndex > 0) {
    nodes[currentIndex - 1].focus();
  }
}

function clearNodeFocus() {
  document.activeElement.blur();
}