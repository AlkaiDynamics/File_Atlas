const state = {
  root: null,
  report: null,
  lens: "space",
  scanning: false,
};

const $ = (id) => document.getElementById(id);
const ui = {
  chooseRoot: $("chooseRoot"),
  scanButton: $("scanButton"),
  rootPath: $("rootPath"),
  scannerBadge: $("scannerBadge"),
  progressPanel: $("progressPanel"),
  progressPhase: $("progressPhase"),
  progressMessage: $("progressMessage"),
  progressBar: $("progressBar"),
  summary: $("summary"),
  physicalBytes: $("physicalBytes"),
  wasteBytes: $("wasteBytes"),
  logicalBytes: $("logicalBytes"),
  fileCount: $("fileCount"),
  fileSubline: $("fileSubline"),
  atlasSection: $("atlasSection"),
  treemap: $("treemap"),
  mapDetail: $("mapDetail"),
  lensExplanation: $("lensExplanation"),
  hotspotList: $("hotspotList"),
  evidenceGrid: $("evidenceGrid"),
  secondaryGrid: $("secondaryGrid"),
  duplicateCount: $("duplicateCount"),
  duplicateGroups: $("duplicateGroups"),
  signals: $("signals"),
  types: $("types"),
  largeFiles: $("largeFiles"),
  warningsPanel: $("warningsPanel"),
  warnings: $("warnings"),
};

function bytes(value = 0) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const scaled = value / 1024 ** index;
  return `${scaled >= 100 || index === 0 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[index]}`;
}

function number(value = 0) {
  return new Intl.NumberFormat().format(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function metricFor(node, lens = state.lens) {
  if (lens === "waste") return node.reclaimableBytes || 0;
  if (lens === "structure") return node.logicalBytes || 0;
  return node.allocatedBytes || 0;
}

function lensLabel(lens = state.lens) {
  return lens === "waste" ? "Verified reclaimable" : lens === "structure" ? "Logical structure" : "Physical allocation";
}

function lensColor(lens = state.lens) {
  return lens === "waste" ? [251, 113, 133] : lens === "structure" ? [167, 139, 250] : [56, 189, 248];
}

function setScanning(scanning) {
  state.scanning = scanning;
  ui.scanButton.disabled = scanning || !state.root;
  ui.chooseRoot.disabled = scanning;
  ui.scanButton.textContent = scanning ? "Scanning…" : "Scan";
}

async function chooseRoot() {
  const dialog = window.__TAURI__?.dialog;
  if (!dialog?.open) {
    showFatal("Tauri dialog API is unavailable. Run File Atlas through the desktop app, not a normal browser.");
    return;
  }
  const selected = await dialog.open({ directory: true, multiple: false });
  if (!selected) return;
  state.root = selected;
  ui.rootPath.textContent = selected;
  setScanning(false);
}

async function scan() {
  if (!state.root || state.scanning) return;
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) {
    showFatal("Tauri command API is unavailable.");
    return;
  }

  setScanning(true);
  ui.progressPanel.classList.remove("hidden");
  ui.progressPhase.textContent = "START";
  ui.progressMessage.textContent = "Preparing scan";
  ui.progressBar.style.width = "4%";

  try {
    const report = await invoke("scan_path", { path: state.root });
    state.report = report;
    renderReport(report);
  } catch (error) {
    showFatal(String(error));
  } finally {
    setScanning(false);
  }
}

function onProgress(event) {
  const p = event.payload || {};
  ui.progressPanel.classList.remove("hidden");
  ui.progressPhase.textContent = String(p.phase || "scan").toUpperCase();
  ui.progressMessage.textContent = p.message || "";
  const phaseBase = { index: 8, metadata: 18, prehash: 35, hash: 55, verify: 76, aggregate: 90, done: 100 };
  let percent = phaseBase[p.phase] ?? 5;
  if (p.total && p.current >= 0) {
    const local = Math.min(1, p.current / p.total);
    const width = p.phase === "prehash" || p.phase === "hash" ? 18 : 8;
    percent = Math.min(99, percent + local * width);
  }
  ui.progressBar.style.width = `${percent}%`;
  if (p.phase === "done") {
    setTimeout(() => ui.progressPanel.classList.add("hidden"), 700);
  }
}

function renderReport(report) {
  const s = report.summary;
  ui.summary.classList.remove("hidden");
  ui.atlasSection.classList.remove("hidden");
  ui.evidenceGrid.classList.remove("hidden");
  ui.secondaryGrid.classList.remove("hidden");

  ui.scannerBadge.classList.remove("hidden");
  ui.scannerBadge.textContent = s.scannerMode === "ntfs-mft" ? "NTFS MFT FAST PATH" : "SAFE WALK";
  ui.physicalBytes.textContent = bytes(s.allocatedBytes);
  ui.wasteBytes.textContent = bytes(s.reclaimableBytes);
  ui.logicalBytes.textContent = bytes(s.logicalBytes);
  ui.fileCount.textContent = number(s.filesScanned);
  ui.fileSubline.textContent = `${number(s.duplicateGroups)} exact groups · ${number(s.hardlinkAliases)} hardlink aliases · ${(s.elapsedMs / 1000).toFixed(1)}s`;
  ui.duplicateCount.textContent = `${bytes(s.reclaimableBytes)} reclaimable`;

  renderAtlas();
  renderDuplicates(report.duplicates);
  renderSignals(report.signals);
  renderTypes(report.types);
  renderLargeFiles(report.largeFiles);
  renderWarnings(report);
}

function renderAtlas() {
  if (!state.report) return;
  const explanations = {
    space: "Tile area = allocated physical bytes. Hardlinked physical files are counted once.",
    waste: "Tile area = byte-verified redundant physical allocation. Folder-name heuristics do not appear here.",
    structure: "Tile area = logical file size across paths. Useful for understanding huge trees even when they are not waste.",
  };
  ui.lensExplanation.textContent = explanations[state.lens];
  renderTreemap(state.report.directoryTree);
  renderHotspots(state.report.hotspots);
}

function renderTreemap(root) {
  ui.treemap.replaceChildren();
  const nodes = [];
  layoutNode(root, 0, 0, 1000, 460, 0, nodes);
  const [r, g, b] = lensColor();

  for (const item of nodes) {
    if (item.depth === 0) continue;
    const metric = metricFor(item.node);
    if (metric <= 0) continue;
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", item.x + 1);
    rect.setAttribute("y", item.y + 1);
    rect.setAttribute("width", Math.max(0, item.w - 2));
    rect.setAttribute("height", Math.max(0, item.h - 2));
    rect.setAttribute("rx", "5");
    rect.setAttribute("class", "tile");
    const wasteRatio = item.node.allocatedBytes ? item.node.reclaimableBytes / item.node.allocatedBytes : 0;
    const alpha = state.lens === "waste" ? 0.35 + Math.min(.6, wasteRatio + .15) : 0.22 + Math.min(.55, item.depth * .08);
    rect.setAttribute("fill", `rgba(${r},${g},${b},${alpha})`);
    rect.addEventListener("click", () => showMapDetail(item.node));
    group.appendChild(rect);

    if (item.w > 115 && item.h > 42) {
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", item.x + 10);
      label.setAttribute("y", item.y + 21);
      label.setAttribute("class", "tile-label");
      label.textContent = truncate(item.node.name, Math.max(8, Math.floor(item.w / 8)));
      group.appendChild(label);

      const value = document.createElementNS("http://www.w3.org/2000/svg", "text");
      value.setAttribute("x", item.x + 10);
      value.setAttribute("y", item.y + 37);
      value.setAttribute("class", "tile-value");
      value.textContent = bytes(metric);
      group.appendChild(value);
    }
    ui.treemap.appendChild(group);
  }
}

function layoutNode(node, x, y, w, h, depth, output) {
  output.push({ node, x, y, w, h, depth });
  if (!node.children?.length || depth >= 5 || w < 18 || h < 18) return;
  const children = node.children.filter((child) => metricFor(child) > 0);
  const total = children.reduce((sum, child) => sum + metricFor(child), 0);
  if (!total) return;

  let cursor = depth % 2 === 0 ? x : y;
  children.forEach((child, index) => {
    const fraction = metricFor(child) / total;
    if (depth % 2 === 0) {
      const cw = index === children.length - 1 ? x + w - cursor : w * fraction;
      layoutNode(child, cursor, y, cw, h, depth + 1, output);
      cursor += cw;
    } else {
      const ch = index === children.length - 1 ? y + h - cursor : h * fraction;
      layoutNode(child, x, cursor, w, ch, depth + 1, output);
      cursor += ch;
    }
  });
}

function showMapDetail(node) {
  const wasteRatio = node.allocatedBytes ? (node.reclaimableBytes / node.allocatedBytes) * 100 : 0;
  ui.mapDetail.innerHTML = `
    <span class="muted">${escapeHtml(lensLabel())}</span>
    <strong>${escapeHtml(node.path)}</strong>
    <p>
      ${bytes(metricFor(node))} in this lens<br>
      Physical: ${bytes(node.allocatedBytes)}<br>
      Logical: ${bytes(node.logicalBytes)}<br>
      Verified waste: ${bytes(node.reclaimableBytes)} (${wasteRatio.toFixed(1)}%)<br>
      Files: ${number(node.fileCount)}
    </p>`;
}

function renderHotspots(hotspots) {
  const sorted = [...hotspots]
    .filter((h) => metricFor(h) > 0)
    .sort((a, b) => metricFor(b) - metricFor(a))
    .slice(0, 18);
  const max = Math.max(1, ...sorted.map((h) => metricFor(h)));
  const barClass = state.lens === "waste" ? "waste" : state.lens === "structure" ? "structure" : "";
  ui.hotspotList.innerHTML = sorted.map((h) => {
    const pct = (metricFor(h) / max) * 100;
    return `<div class="hotspot">
      <div class="hotspot-path" title="${escapeHtml(h.path)}">${escapeHtml(h.path)}</div>
      <div class="bar-track"><div class="bar-fill ${barClass}" style="width:${pct}%"></div></div>
      <strong>${bytes(metricFor(h))}</strong>
      <span class="muted">${number(h.fileCount)} files</span>
    </div>`;
  }).join("") || `<div class="empty">Nothing measurable in this lens.</div>`;
}

function renderDuplicates(groups) {
  ui.duplicateGroups.innerHTML = groups.slice(0, 60).map((group, index) => {
    const members = group.members.map((member) => {
      const keep = member.path === group.keepPath;
      return `<li class="${keep ? "keep" : "redundant"}">${escapeHtml(member.path)}${member.linkCount > 1 ? ` · ${member.linkCount} links` : ""}</li>`;
    }).join("");
    return `<div class="card">
      <div class="card-head">
        <strong>#${index + 1} · ${bytes(group.reclaimableBytes)} reclaimable</strong>
        <small>${group.physicalCopies} physical · ${group.hardlinkAliases} aliases</small>
      </div>
      <ul class="path-list">${members}</ul>
    </div>`;
  }).join("") || `<div class="empty">No exact duplicate physical waste found.</div>`;
}

function renderSignals(signals) {
  ui.signals.innerHTML = signals.map((signal) => `<div class="card">
    <div class="card-head">
      <strong>${escapeHtml(signal.label)}</strong>
      <span class="signal-confidence">${escapeHtml(signal.confidence)} confidence</span>
    </div>
    <p>${bytes(signal.allocatedBytes)} · ${number(signal.fileCount)} files</p>
    <ul class="path-list">${signal.samplePaths.slice(0, 3).map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>
  </div>`).join("") || `<div class="empty">No common bloat patterns detected.</div>`;
}

function renderTypes(types) {
  const max = Math.max(1, ...types.map((t) => t.allocatedBytes));
  ui.types.innerHTML = types.slice(0, 20).map((type) => `<div class="type-row">
    <div class="type-name">${escapeHtml(type.extension)}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${(type.allocatedBytes / max) * 100}%"></div></div>
    <strong>${bytes(type.allocatedBytes)}</strong>
  </div>`).join("") || `<div class="empty">No file type data.</div>`;
}

function renderLargeFiles(files) {
  ui.largeFiles.innerHTML = files.slice(0, 30).map((file) => `<div class="card">
    <div class="card-head">
      <strong>${bytes(file.allocatedBytes)}</strong>
      <small>${file.stale ? "STALE > 1 YEAR" : "recent"}</small>
    </div>
    <ul class="path-list"><li>${escapeHtml(file.path)}</li></ul>
  </div>`).join("") || `<div class="empty">No files over 100 MB.</div>`;
}

function renderWarnings(report) {
  const warnings = [...(report.warnings || [])];
  if (report.summary.unreadableEntries) {
    warnings.push(`${number(report.summary.unreadableEntries)} entries could not be read and were excluded from conclusions.`);
  }
  ui.warningsPanel.classList.toggle("hidden", warnings.length === 0);
  ui.warnings.innerHTML = warnings.map((warning) => `<div class="warning">${escapeHtml(warning)}</div>`).join("");
}

function truncate(text, length) {
  if (text.length <= length) return text;
  return text.slice(0, Math.max(1, length - 1)) + "…";
}

function showFatal(message) {
  ui.progressPanel.classList.remove("hidden");
  ui.progressPhase.textContent = "ERROR";
  ui.progressMessage.textContent = message;
  ui.progressBar.style.width = "100%";
}

document.querySelectorAll(".lens").forEach((button) => {
  button.addEventListener("click", () => {
    state.lens = button.dataset.lens;
    document.querySelectorAll(".lens").forEach((b) => b.classList.toggle("active", b === button));
    renderAtlas();
  });
});

ui.chooseRoot.addEventListener("click", chooseRoot);
ui.scanButton.addEventListener("click", scan);
setScanning(false);

if (window.__TAURI__?.event?.listen) {
  window.__TAURI__.event.listen("scan-progress", onProgress);
}
