// Breadcrumb navigation component
const breadcrumbContainer = d3.select('#tree-container')
  .insert('div', ':first-child')
  .attr('class', 'breadcrumbs')
  .attr('role', 'navigation')
  .attr('aria-label', 'File system navigation')
  .style('padding', '10px 0')
  .style('margin-bottom', '10px');

export function updateBreadcrumbs(node) {
  const path = [];
  let current = node;
  
  while (current) {
    path.unshift(current);
    current = current.parent;
  }

  const breadcrumbs = breadcrumbContainer.selectAll('.breadcrumb')
    .data(path, d => d.data.name);

  // Remove old breadcrumbs
  breadcrumbs.exit().remove();

  // Add new breadcrumbs
  const newBreadcrumbs = breadcrumbs.enter()
    .append('span')
    .attr('class', 'breadcrumb')
    .style('cursor', 'pointer')
    .style('color', '#3498db')
    .style('margin', '0 5px')
    .style('transition', 'all 0.2s ease')
    .on('mouseover', function() {
      d3.select(this)
        .style('color', '#2980b9')
        .style('text-decoration', 'underline');
    })
    .on('mouseout', function() {
      d3.select(this)
        .style('color', '#3498db')
        .style('text-decoration', 'none');
    })
    .attr('tabindex', 0)
    .attr('role', 'button')
    .text(d => d.data.name)
    .on('click', (event, d) => {
      event.stopPropagation();
      navigateToNode(d);
    })
    .on('keydown', (event, d) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        navigateToNode(d);
      }
    });

  // Add separator
  newBreadcrumbs.each(function(d, i) {
    if (i < path.length - 1) {
      d3.select(this.parentNode)
        .insert('span', () => this.nextSibling)
        .text(' / ')
        .style('color', '#95a5a6');
    }
  });
}

function navigateToNode(node) {
  // Ensure all parent nodes are expanded
  let current = node;
  while (current.parent) {
    if (current.parent._children) {
      current.parent.children = current.parent._children;
      current.parent._children = null;
    }
    current = current.parent;
  }

  // Update visualization and focus on the selected node
  renderVisualization(node.data);
  const selectedNode = d3.select(`g.node[transform*="${node.y},${node.x}"]`).node();
  if (selectedNode) {
    selectedNode.focus();
  }
}