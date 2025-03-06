import * as d3 from 'd3';
import { showTooltip, hideTooltip } from '../components/tooltip.js';

let svg, root;
let currentTransform = d3.zoomIdentity;

export function renderFlowchart(data) {
  const width = 960;
  const height = 600;
  const nodeWidth = 200;
  const nodeHeight = 40;
  const nodeSpacing = 60;

  // Clear existing visualization
  d3.select('#tree-container').selectAll('svg').remove();

  // Create new SVG with zoom support
  svg = d3.select('#tree-container')
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .call(d3.zoom().on('zoom', handleZoom))
    .append('g')
    .attr('transform', currentTransform);

  // Prepare data
  root = d3.hierarchy(data);
  const nodes = root.descendants();
  const links = root.links();

  // Calculate node positions using a more sophisticated layout
  const levels = {};
  nodes.forEach(node => {
    const level = node.depth;
    if (!levels[level]) levels[level] = [];
    levels[level].push(node);
  });

  // Position nodes in a balanced way within their levels
  Object.entries(levels).forEach(([level, levelNodes]) => {
    const levelWidth = width * 0.8; // Use 80% of width for nodes
    const startX = width * 0.1; // Start at 10% margin
    const spacing = levelWidth / (levelNodes.length + 1);
    
    levelNodes.forEach((node, i) => {
      node.x = startX + spacing * (i + 1);
      node.y = level * (nodeHeight + nodeSpacing) + 50; // Add top margin
    });
  });

  // Draw links with arrows
  const link = svg.append('g')
    .attr('class', 'links')
    .selectAll('path')
    .data(links)
    .enter()
    .append('g');

  // Add curved path for links
  link.append('path')
    .attr('class', 'link')
    .attr('d', d => {
      const sourceY = d.source.y + nodeHeight;
      const targetY = d.target.y;
      const midY = sourceY + (targetY - sourceY) / 2;
      
      return d3.line().curve(d3.curveBasis)([
        [d.source.x, sourceY],
        [d.source.x, sourceY + (targetY - sourceY) / 4],
        [d.source.x + (d.target.x - d.source.x) / 2, midY],
        [d.target.x, targetY - (targetY - sourceY) / 4],
        [d.target.x, targetY]
      ]);
    });

  // Add arrow markers
  link.append('polygon')
    .attr('class', 'arrow')
    .attr('points', '0,-6 12,0 0,6')
    .attr('transform', d => {
      const x = d.target.x;
      const y = d.target.y;
      return `translate(${x},${y}) rotate(0)`;
    });

  // Create node groups
  const node = svg.append('g')
    .attr('class', 'nodes')
    .selectAll('g')
    .data(nodes)
    .enter()
    .append('g')
    .attr('class', 'node')
    .attr('transform', d => `translate(${d.x - nodeWidth/2},${d.y})`)
    .attr('role', 'treeitem')
    .attr('tabindex', 0)
    .on('mouseover', showTooltip)
    .on('mouseout', hideTooltip);

  // Add rectangles for nodes
  node.append('rect')
    .attr('width', nodeWidth)
    .attr('height', nodeHeight)
    .attr('rx', 5)
    .attr('ry', 5)
    .attr('fill', d => getNodeColor(d));

  // Add text labels
  node.append('text')
    .attr('x', nodeWidth / 2)
    .attr('y', nodeHeight / 2)
    .attr('dy', '.35em')
    .attr('text-anchor', 'middle')
    .text(d => d.data.name)
    .call(wrap, nodeWidth - 20);
}

// Handle zoom events
function handleZoom(event) {
  currentTransform = event.transform;
  svg.attr('transform', currentTransform);
}

// Get node color based on depth and type
function getNodeColor(d) {
  if (d.depth === 0) return '#fd8d3c'; // Root node
  if (d.data.subtype === 'protected') return '#95a5a6';
  return '#3498db'; // Default color
}

// Text wrapping function
function wrap(text, width) {
  text.each(function() {
    const text = d3.select(this);
    const words = text.text().split(/\s+/).reverse();
    let word;
    let line = [];
    let lineNumber = 0;
    const lineHeight = 1.1;
    const y = text.attr('y');
    const dy = parseFloat(text.attr('dy'));
    let tspan = text.text(null).append('tspan')
      .attr('x', text.attr('x'))
      .attr('y', y)
      .attr('dy', dy + 'em');

    while (word = words.pop()) {
      line.push(word);
      tspan.text(line.join(' '));
      if (tspan.node().getComputedTextLength() > width) {
        line.pop();
        tspan.text(line.join(' '));
        line = [word];
        tspan = text.append('tspan')
          .attr('x', text.attr('x'))
          .attr('y', y)
          .attr('dy', ++lineNumber * lineHeight + dy + 'em')
          .text(word);
      }
    }
  });
}