import * as d3 from 'd3';
import { showTooltip, hideTooltip } from '../components/tooltip.js';

let svg, root;
let currentTransform = d3.zoomIdentity;

export function renderMindMap(data) {
  const width = 960;
  const height = 960;
  const radius = Math.min(width, height) / 2;

  d3.select('#tree-container').selectAll('svg').remove();

  // Create new SVG with enhanced zoom support
  svg = d3.select('#tree-container')
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .call(d3.zoom()
      .scaleExtent([0.5, 3]) // Limit zoom scale
      .on('zoom', handleZoom))
    .append('g')
    .attr('transform', `translate(${width / 2},${height / 2}) ${currentTransform}`);

  // Enhanced cluster layout
  const cluster = d3.cluster()
    .size([360, radius - 120]) // Adjusted for better spacing
    .separation((a, b) => (a.parent === b.parent ? 1 : 2)); // Better node separation

  root = d3.hierarchy(data);
  cluster(root);

  // Draw links with smooth transitions
  const links = svg.append('g')
    .attr('class', 'links')
    .selectAll('path')
    .data(root.links())
    .enter().append('path')
    .attr('class', 'link')
    .attr('stroke', '#999')
    .attr('stroke-opacity', 0.6)
    .attr('stroke-width', d => Math.max(1, d.target.data.size / 100))
    .attr('fill', 'none')
    .attr('d', d => {
      return `M${project(d.target.x, d.target.y)}
              C${project(d.target.x, (d.target.y + d.source.y) / 2)}
               ${project(d.source.x, (d.target.y + d.source.y) / 2)}
               ${project(d.source.x, d.source.y)}`;
    });

  // Enhanced node groups with interactive features
  const node = svg.append('g')
    .attr('class', 'nodes')
    .selectAll('g')
    .data(root.descendants())
    .enter().append('g')
    .attr('class', d => `node ${d.children ? 'node--internal' : 'node--leaf'}`)
    .attr('transform', d => `translate(${project(d.x, d.y)})`)
    .attr('role', 'treeitem')
    .attr('tabindex', 0)
    .on('mouseover', (event, d) => {
      d3.select(event.currentTarget).select('circle')
        .transition()
        .duration(200)
        .attr('r', 12);
      showTooltip(event, d);
    })
    .on('mouseout', (event, d) => {
      d3.select(event.currentTarget).select('circle')
        .transition()
        .duration(200)
        .attr('r', 8);
      hideTooltip(event, d);
    })
    .on('click', (event, d) => {
      // Toggle children on click
      if (d.children) {
        d._children = d.children;
        d.children = null;
      } else {
        d.children = d._children;
        d._children = null;
      }
      renderMindMap(root.data);
    });

  // Enhanced circles with dynamic sizing
  node.append('circle')
    .attr('r', 8)
    .attr('fill', getNodeColor)
    .attr('stroke', '#fff')
    .attr('stroke-width', 2);

  // Enhanced text labels with better positioning
  node.append('text')
    .attr('dy', '.31em')
    .attr('x', d => d.x < 180 ? 15 : -15)
    .style('text-anchor', d => d.x < 180 ? 'start' : 'end')
    .attr('transform', d => d.x < 180 ? null : 'rotate(180)')
    .text(d => d.data.name)
    .style('font-size', '12px')
    .style('font-family', 'Arial')
    .style('fill', '#2a2a2a');
}

// Convert polar to Cartesian coordinates
function project(x, y) {
  const angle = (x - 90) / 180 * Math.PI;
  return [y * Math.cos(angle), y * Math.sin(angle)];
}

// Handle zoom events
function handleZoom(event) {
  currentTransform = event.transform;
  svg.attr('transform', `translate(${width / 2},${height / 2}) ${currentTransform}`);
}

// Enhanced node coloring with vibrant scheme
function getNodeColor(d) {
  const colors = d3.scaleOrdinal()
    .domain([0, 1, 2, 3, 4])
    .range(['#fd8d3c', '#e6550d', '#31a354', '#756bb1', '#636363']);
  
  if (d.depth === 0) return '#fd8d3c'; // Root node
  if (d.data.subtype === 'protected') return '#a1a1a1';
  if (d.data.type === 'directory') return '#31a354';
  if (d.children) return '#756bb1';
  return colors(d.depth); // Different colors for each level
}