// Tooltip component for displaying node metadata
const tooltip = d3.select('body')
  .append('div')
  .attr('class', 'tooltip')
  .style('opacity', 0)
  .style('position', 'absolute')
  .style('pointer-events', 'none')
  .style('background-color', 'rgba(0, 0, 0, 0.8)')
  .style('color', 'white')
  .style('padding', '8px')
  .style('border-radius', '4px')
  .style('font-size', '12px')
  .style('max-width', '200px');

export function showTooltip(event, d) {
  tooltip.transition()
    .duration(200)
    .style('opacity', 0.9);

  const metadata = d.data.metadata || {};
  const content = `
    <strong>${d.data.name}</strong><br/>
    ${metadata.size ? `Size: ${metadata.size}<br/>` : ''}
    ${metadata.modified ? `Modified: ${metadata.modified}<br/>` : ''}
    ${metadata.type ? `Type: ${metadata.type}` : ''}
  `;

  tooltip.html(content)
    .style('left', (event.pageX + 10) + 'px')
    .style('top', (event.pageY - 28) + 'px');
}

export function hideTooltip() {
  tooltip.transition()
    .duration(500)
    .style('opacity', 0);
}