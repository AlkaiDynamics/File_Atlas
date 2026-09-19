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
  massTree: $("massTree"),
  lensExplanation: $("lensExplanation"),
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
  renderMassTree(state.report.directoryTree);
}

function renderMassTree(root) {
  const expanded = new Set([root.path]);
  const render = () => {
    const rows = [];
    flattenVisible(root, 0, expanded, rows);
    ui.massTree.innerHTML = "";
    const barClass = state.lens === "waste" ? "waste" : state.lens === "structure" ? "structure" : "";
    for (const { node, depth } of rows) {
      if (depth > 0 && metricFor(node) <= 0) continue;
      const parentMetric = depth === 0 ? Math.max(1, metricFor(node)) : Math.max(1, metricFor(findParent(root, node.path) || root));
      const pct = Math.max(metricFor(node) > 0 ? 1.5 : 0, Math.min(100, (metricFor(node) / parentMetric) * 100));
      const row = document.createElement("div");
      row.className = "mass-row";
      row.setAttribute("role", "treeitem");
      row.setAttribute("aria-level", String(depth + 1));
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      row.innerHTML = `
        <div class="mass-path" style="padding-left:${depth * 16}px">
          ${hasChildren ? `<button class="mass-toggle" aria-label="Toggle folder">${expanded.has(node.path) ? "▾" : "▸"}</button>` : '<span class="leaf-pad"></span>'}
          <span class="mass-name" title="${escapeHtml(node.path)}">${escapeHtml(node.name || node.path)}</span>
        </div>
        <div class="mass-bar-track">
          <div class="mass-bar ${barClass}" style="width:${pct}%"></div>
          <span class="mass-bar-label">${bytes(metricFor(node))}</span>
        </div>
        <div class="mass-size">${bytes(metricFor(node))}</div>
        <div class="mass-files">${number(node.fileCount)}</div>
      `;
      if (hasChildren) {
        row.querySelector(".mass-toggle").addEventListener("click", () => {
          if (expanded.has(node.path)) expanded.delete(node.path);
          else expanded.add(node.path);
          render();
        });
      }
      ui.massTree.appendChild(row);
    }
  };
  render();
}

function flattenVisible(node, depth, expanded, output) {
  output.push({ node, depth });
  if (!expanded.has(node.path)) return;
  const children = [...(node.children || [])].sort((a, b) => metricFor(b) - metricFor(a));
  for (const child of children) flattenVisible(child, depth + 1, expanded, output);
}

function findParent(root, path) {
  if (!root.children) return null;
  for (const child of root.children) {
    if (child.path === path) return root;
    const nested = findParent(child, path);
    if (nested) return nested;
  }
  return null;
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
