const state = {
  rootPath: null,
  result: null,
  mapMode: 'waste',
  currentNode: null,
  nodeByPath: new Map(),
  parentByPath: new Map(),
  duplicateVisible: 60,
  scanning: false
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const chooseButton = $('#choose-folder');
const scanButton = $('#scan-folder');
const cancelButton = $('#cancel-scan');
const progressPanel = $('#progress-panel');
const progressBar = $('#progress-bar');
const tooltip = $('#tooltip');

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** exponent);
  return `${value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[exponent]}`;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function setScanning(scanning) {
  state.scanning = scanning;
  chooseButton.disabled = scanning;
  scanButton.disabled = scanning || !state.rootPath;
  cancelButton.hidden = !scanning;
  progressPanel.hidden = !scanning;
}

function setProgress(progress) {
  const title = $('#progress-title');
  const detail = $('#progress-detail');
  progressBar.classList.remove('indeterminate');

  if (progress.phase === 'walking') {
    title.textContent = 'Mapping filesystem';
    detail.textContent = `${progress.files.toLocaleString()} files · ${formatBytes(progress.bytes)} · ${progress.current || ''}`;
    progressBar.style.width = '35%';
    progressBar.classList.add('indeterminate');
  } else if (progress.phase === 'hashing') {
    title.textContent = 'Verifying possible duplicates';
    const total = Math.max(progress.total || 0, 1);
    const current = progress.current || 0;
    progressBar.style.width = `${Math.min(100, (current / total) * 100)}%`;
    detail.textContent = `${current.toLocaleString()} / ${(progress.total || 0).toLocaleString()} physical files · ${progress.cacheHits || 0} cache hits`;
  } else if (progress.phase === 'analyzing') {
    title.textContent = 'Building bloat map';
    detail.textContent = 'Aggregating directories, file types, hardlinks, and reclaimable bytes';
    progressBar.style.width = '96%';
  } else if (progress.phase === 'done') {
    progressBar.style.width = '100%';
  }
}

function indexTree(node, parent = null) {
  state.nodeByPath.set(node.path, node);
  if (parent) state.parentByPath.set(node.path, parent.path);
  for (const child of node.children || []) indexTree(child, node);
}

function renderSummary() {
  const s = state.result.summary;
  $('#metric-physical').textContent = formatBytes(s.physicalBytes);
  $('#metric-logical').textContent = s.hardlinkAliasCount
    ? `${formatBytes(s.logicalBytes)} logical · ${s.hardlinkAliasCount.toLocaleString()} hardlink aliases already shared`
    : `${formatBytes(s.logicalBytes)} logical`;
  $('#metric-waste').textContent = formatBytes(s.duplicateWasteBytes);
  $('#metric-waste-pct').textContent = s.physicalBytes
    ? `${((s.duplicateWasteBytes / s.physicalBytes) * 100).toFixed(1)}% of physical data is exact duplicate content`
    : 'No reclaimable duplicate data';
  $('#metric-groups').textContent = s.duplicateGroupCount.toLocaleString();
  $('#metric-files').textContent = `${s.fileCount.toLocaleString()} files scanned · ${s.hashedPhysicalFiles.toLocaleString()} needed hashing`;
  $('#metric-cache').textContent = s.hashedPhysicalFiles
    ? `${Math.round((s.cacheHits / s.hashedPhysicalFiles) * 100)}%`
    : '100%';
  $('#metric-elapsed').textContent = `${s.cacheHits.toLocaleString()} cached hashes · ${formatDuration(s.elapsedMs)}`;
}

function renderBreadcrumbs() {
  const container = $('#breadcrumbs');
  container.replaceChildren();
  const chain = [];
  let node = state.currentNode;
  while (node) {
    chain.push(node);
    const parentPath = state.parentByPath.get(node.path);
    node = parentPath ? state.nodeByPath.get(parentPath) : null;
  }
  chain.reverse().forEach((item, index) => {
    if (index) {
      const sep = document.createElement('span');
      sep.className = 'crumb-sep';
      sep.textContent = '›';
      container.appendChild(sep);
    }
    const button = document.createElement('button');
    button.className = `crumb ${item.path === state.currentNode.path ? 'current' : ''}`;
    button.textContent = item.name;
    button.addEventListener('click', () => {
      state.currentNode = item;
      renderMap();
    });
    container.appendChild(button);
  });
}

function mapMetric(node) {
  return state.mapMode === 'waste' ? node.totalWasteBytes : node.totalPhysicalBytes;
}

function mapOwnMetric(node) {
  return state.mapMode === 'waste' ? node.ownWasteBytes : node.ownPhysicalBytes;
}

function heatColor(node) {
  const ratio = node.totalPhysicalBytes > 0 ? node.totalWasteBytes / node.totalPhysicalBytes : 0;
  return d3.interpolateRgb('#294455', '#d45f4d')(Math.min(1, ratio * 1.55));
}

function showTooltip(event, item) {
  const node = item.node || state.currentNode;
  const ratio = node.totalPhysicalBytes ? (node.totalWasteBytes / node.totalPhysicalBytes) * 100 : 0;
  tooltip.innerHTML = `<strong>${item.name}</strong><br>${formatBytes(node.totalPhysicalBytes)} physical<br>${formatBytes(node.totalWasteBytes)} exact duplicate waste (${ratio.toFixed(1)}%)<br>${node.fileCount.toLocaleString()} files`;
  tooltip.hidden = false;
  const x = Math.min(window.innerWidth - 380, event.clientX + 14);
  const y = Math.min(window.innerHeight - 120, event.clientY + 14);
  tooltip.style.left = `${Math.max(8, x)}px`;
  tooltip.style.top = `${Math.max(8, y)}px`;
}

function renderMap() {
  renderBreadcrumbs();
  const container = $('#treemap');
  container.replaceChildren();
  const node = state.currentNode;

  const items = (node.children || [])
    .map((child) => ({ name: child.name, value: mapMetric(child), node: child, kind: 'directory' }))
    .filter((item) => item.value > 0);
  const own = mapOwnMetric(node);
  if (own > 0) items.push({ name: 'Files directly here', value: own, node, kind: 'files' });

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'map-empty';
    empty.innerHTML = state.mapMode === 'waste'
      ? '<div><strong>No exact duplicate waste in this folder.</strong><br>Switch to Physical size to map occupied space.</div>'
      : '<div><strong>No file data in this folder.</strong></div>';
    container.appendChild(empty);
    return;
  }

  const width = Math.max(container.clientWidth, 500);
  const height = Math.max(container.clientHeight, 500);
  const hierarchy = d3.hierarchy({ children: items }).sum((d) => d.value || 0);
  d3.treemap().size([width, height]).paddingInner(2).paddingOuter(2).round(true)(hierarchy);

  const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${width} ${height}`);
  const leaves = svg.selectAll('g').data(hierarchy.leaves()).enter().append('g')
    .attr('transform', (d) => `translate(${d.x0},${d.y0})`);

  leaves.append('rect')
    .attr('class', 'map-cell')
    .attr('width', (d) => Math.max(0, d.x1 - d.x0))
    .attr('height', (d) => Math.max(0, d.y1 - d.y0))
    .attr('rx', 4)
    .attr('fill', (d) => heatColor(d.data.node))
    .on('mouseenter', (event, d) => showTooltip(event, d.data))
    .on('mousemove', (event, d) => showTooltip(event, d.data))
    .on('mouseleave', () => { tooltip.hidden = true; })
    .on('click', (_event, d) => {
      if (d.data.kind === 'directory') {
        state.currentNode = d.data.node;
        renderMap();
      }
    });

  leaves.each(function(d) {
    const w = d.x1 - d.x0;
    const h = d.y1 - d.y0;
    if (w < 85 || h < 40) return;
    const group = d3.select(this);
    const name = d.data.name.length > Math.floor(w / 8) ? `${d.data.name.slice(0, Math.max(5, Math.floor(w / 8) - 1))}…` : d.data.name;
    group.append('text').attr('class', 'map-label').attr('x', 8).attr('y', 18).text(name);
    if (h >= 58) {
      group.append('text').attr('class', 'map-sub').attr('x', 8).attr('y', 35).text(formatBytes(d.data.value));
    }
  });
}

function renderHotspots() {
  const list = $('#hotspot-list');
  list.replaceChildren();
  const rows = state.result.hotspots.filter((h) => h.path !== state.result.rootPath).slice(0, 30);
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'No reclaimable exact duplicate bytes found.';
    list.appendChild(empty);
    return;
  }
  rows.forEach((row) => {
    const button = document.createElement('button');
    button.className = 'hotspot';
    button.innerHTML = `<strong>${row.name}</strong><span>${formatBytes(row.wasteBytes)} reclaimable · ${formatBytes(row.physicalBytes)} physical</span>`;
    button.title = row.path;
    button.addEventListener('click', () => {
      const node = state.nodeByPath.get(row.path);
      if (node) {
        state.currentNode = node;
        renderMap();
      }
    });
    list.appendChild(button);
  });
}

function renderExtensions() {
  const chart = $('#extension-chart');
  chart.replaceChildren();
  const rows = state.result.extensions.slice(0, 18);
  const max = Math.max(...rows.map((r) => r.physicalBytes), 1);
  rows.forEach((row) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'bar-row';
    const totalPct = (row.physicalBytes / max) * 100;
    const wastePct = row.physicalBytes ? (row.wasteBytes / row.physicalBytes) * totalPct : 0;
    wrapper.innerHTML = `<div class="bar-label" title="${row.extension}">${row.extension}</div><div class="bar-track"><div class="bar-total" style="width:${totalPct}%"></div><div class="bar-waste" style="width:${wastePct}%"></div></div><div class="bar-value">${formatBytes(row.physicalBytes)}</div>`;
    chart.appendChild(wrapper);
  });
}

function renderLargestFiles() {
  const list = $('#largest-files');
  list.replaceChildren();
  state.result.topFiles.slice(0, 50).forEach((file) => {
    const row = document.createElement('div');
    row.className = 'file-row';
    const main = document.createElement('div');
    main.className = 'file-main';
    const duplicateMark = file.duplicateGroupId ? '<span class="duplicate-dot" title="Part of an exact duplicate group">●</span>' : '';
    main.innerHTML = `<strong>${file.name}${duplicateMark}</strong><small>${file.path}</small>`;
    const size = document.createElement('div');
    size.className = 'file-size';
    size.textContent = formatBytes(file.size);
    const reveal = document.createElement('button');
    reveal.className = 'reveal';
    reveal.title = 'Show in folder';
    reveal.textContent = '↗';
    reveal.addEventListener('click', () => window.atlas.reveal(file.path));
    row.append(main, size, reveal);
    list.appendChild(row);
  });
}

function renderDuplicates() {
  const container = $('#duplicate-groups');
  const groups = state.result.duplicateGroups;
  container.replaceChildren();
  $('#duplicate-count-label').textContent = `${groups.length.toLocaleString()} groups · ${formatBytes(state.result.summary.duplicateWasteBytes)} reclaimable`;

  groups.slice(0, state.duplicateVisible).forEach((group) => {
    const details = document.createElement('details');
    details.className = 'duplicate-group';
    const summary = document.createElement('summary');
    const title = document.createElement('div');
    title.className = 'duplicate-title';
    title.innerHTML = `<strong>${group.sampleName}</strong><small>${formatBytes(group.size)} each · ${group.physicalCopies} physical copies · ${group.pathCount} paths</small>`;
    const reclaim = document.createElement('div');
    reclaim.className = 'reclaim';
    reclaim.textContent = `${formatBytes(group.reclaimableBytes)} waste`;
    summary.append(title, reclaim);

    const paths = document.createElement('div');
    paths.className = 'duplicate-paths';
    group.paths.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'duplicate-path';
      const pathText = document.createElement('span');
      pathText.textContent = entry.path;
      if (entry.hardlinkAliases > 1) {
        const badge = document.createElement('em');
        badge.className = 'hardlink-badge';
        badge.textContent = `(${entry.hardlinkAliases} aliases share this physical copy)`;
        pathText.appendChild(badge);
      }
      const reveal = document.createElement('button');
      reveal.className = 'reveal';
      reveal.textContent = '↗';
      reveal.title = 'Show in folder';
      reveal.addEventListener('click', () => window.atlas.reveal(entry.path));
      row.append(pathText, reveal);
      paths.appendChild(row);
    });

    details.append(summary, paths);
    container.appendChild(details);
  });

  const more = $('#show-more-duplicates');
  more.hidden = state.duplicateVisible >= groups.length;
  if (!more.hidden) more.textContent = `Show next ${Math.min(60, groups.length - state.duplicateVisible)} groups`;
}

function renderWarnings() {
  const panel = $('#warnings-panel');
  const list = $('#warnings-list');
  const warnings = state.result.warnings || [];
  panel.hidden = warnings.length === 0 && state.result.summary.skippedLinkCount === 0;
  list.replaceChildren();
  if (state.result.summary.skippedLinkCount) {
    const line = document.createElement('div');
    line.textContent = `${state.result.summary.skippedLinkCount.toLocaleString()} symbolic links / junction-like links skipped to avoid traversal loops.`;
    list.appendChild(line);
  }
  warnings.forEach((warning) => {
    const line = document.createElement('div');
    line.textContent = `${warning.path} — ${warning.message}`;
    list.appendChild(line);
  });
}

function renderAll() {
  $('#empty-state').hidden = true;
  $('#dashboard').hidden = false;
  state.nodeByPath.clear();
  state.parentByPath.clear();
  indexTree(state.result.tree);
  state.currentNode = state.result.tree;
  state.mapMode = state.result.summary.duplicateWasteBytes > 0 ? 'waste' : 'size';
  $$('.segment').forEach((button) => button.classList.toggle('active', button.dataset.mapMode === state.mapMode));
  state.duplicateVisible = 60;

  renderSummary();
  renderMap();
  renderHotspots();
  renderExtensions();
  renderLargestFiles();
  renderDuplicates();
  renderWarnings();
}

chooseButton.addEventListener('click', async () => {
  const selected = await window.atlas.chooseFolder();
  if (!selected) return;
  state.rootPath = selected;
  $('#target-path').textContent = selected;
  $('#target-path').title = selected;
  scanButton.disabled = false;
});

scanButton.addEventListener('click', async () => {
  if (!state.rootPath || state.scanning) return;
  setScanning(true);
  $('#progress-title').textContent = 'Starting scan';
  $('#progress-detail').textContent = state.rootPath;
  progressBar.style.width = '10%';
  progressBar.classList.add('indeterminate');

  try {
    state.result = await window.atlas.scan(state.rootPath);
    renderAll();
  } catch (error) {
    if (!String(error?.message || error).toLowerCase().includes('cancel')) {
      $('#empty-state').hidden = false;
      $('#dashboard').hidden = true;
      $('#empty-state').innerHTML = `<div class="empty-mark">!</div><h2>Scan failed.</h2><p>${String(error?.message || error)}</p>`;
    }
  } finally {
    setScanning(false);
  }
});

cancelButton.addEventListener('click', () => window.atlas.cancelScan());

$$('[data-map-mode]').forEach((button) => {
  button.addEventListener('click', () => {
    state.mapMode = button.dataset.mapMode;
    $$('[data-map-mode]').forEach((candidate) => candidate.classList.toggle('active', candidate === button));
    renderMap();
  });
});

$('#show-more-duplicates').addEventListener('click', () => {
  state.duplicateVisible += 60;
  renderDuplicates();
});

window.atlas.onProgress(setProgress);

new ResizeObserver(() => {
  if (state.result && state.currentNode) renderMap();
}).observe($('#treemap'));
