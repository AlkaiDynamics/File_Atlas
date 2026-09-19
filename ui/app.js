const state = {
  root: null,
  report: null,
  lens: "waste",
  scanning: false,
  expandedPaths: new Set(),
  dedupeScopePath: null,
  dedupeFilters: {
    family: "all",
    minWaste: 0,
    minCopies: 2,
    path: "",
  },
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
  familyFilter: $("familyFilter"),
  minWasteFilter: $("minWasteFilter"),
  copyFilter: $("copyFilter"),
  pathFilter: $("pathFilter"),
  clearDedupeFilters: $("clearDedupeFilters"),
  dedupeScope: $("dedupeScope"),
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
  state.expandedPaths = new Set([report.directoryTree.path]);
  state.dedupeScopePath = null;
  syncDedupeControls();

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
  if (!state.expandedPaths.size) state.expandedPaths.add(root.path);
  const render = () => {
    const rows = [];
    flattenVisible(root, 0, state.expandedPaths, rows);
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
          ${hasChildren ? `<button class="mass-toggle" aria-label="Toggle folder">${state.expandedPaths.has(node.path) ? "▾" : "▸"}</button>` : '<span class="leaf-pad"></span>'}
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
          if (state.expandedPaths.has(node.path)) expanded.delete(node.path);
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
  if (!state.expandedPaths.has(node.path)) return;
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
  const filtered = groups
    .filter(groupMatchesFilters)
    .sort((a, b) => b.reclaimableBytes - a.reclaimableBytes);
  const filteredWaste = filtered.reduce((sum, group) => sum + group.reclaimableBytes, 0);
  const totalWaste = groups.reduce((sum, group) => sum + group.reclaimableBytes, 0);
  ui.duplicateCount.textContent = filtered.length === groups.length
    ? `${bytes(totalWaste)} · ${number(groups.length)} groups`
    : `${bytes(filteredWaste)} · ${number(filtered.length)}/${number(groups.length)} groups`;

  ui.duplicateGroups.innerHTML = filtered.slice(0, 100).map((group, index) => {
    const members = group.members.map((member) => {
      const keep = member.path === group.keepPath;
      return `<li class="${keep ? "keep" : "redundant"}">${escapeHtml(member.path)}${member.linkCount > 1 ? ` · ${member.linkCount} links` : ""}</li>`;
    }).join("");
    return `<div class="card duplicate-card">
      <div class="card-head">
        <strong>#${index + 1} · ${bytes(group.reclaimableBytes)} reclaimable</strong>
        <small>${group.physicalCopies} physical · ${group.hardlinkAliases} aliases · ${bytes(group.logicalBytesEach)} each</small>
      </div>
      <ul class="path-list">${members}</ul>
    </div>`;
  }).join("") || `<div class="empty">No exact duplicate groups match the current targeting controls.</div>`;
}

function groupMatchesFilters(group) {
  if (group.reclaimableBytes < state.dedupeFilters.minWaste) return false;
  if (group.physicalCopies < state.dedupeFilters.minCopies) return false;

  const paths = group.members.map((member) => member.path);
  const pathNeedle = state.dedupeFilters.path.trim().toLocaleLowerCase();
  if (pathNeedle && !paths.some((path) => path.toLocaleLowerCase().includes(pathNeedle))) return false;

  if (state.dedupeScopePath) {
    const scope = normalizedPath(state.dedupeScopePath);
    if (!paths.some((path) => {
      const candidate = normalizedPath(path);
      return candidate === scope || candidate.startsWith(scope + "/");
    })) return false;
  }

  if (state.dedupeFilters.family !== "all") {
    if (!paths.some((path) => fileFamily(path) === state.dedupeFilters.family)) return false;
  }
  return true;
}

function normalizedPath(path) {
  return String(path).replaceAll("\\", "/").replace(/\/+$/, "").toLocaleLowerCase();
}

function fileFamily(path) {
  const clean = String(path).toLocaleLowerCase().split(/[?#]/)[0];
  const dot = clean.lastIndexOf(".");
  const ext = dot >= 0 ? clean.slice(dot) : "";
  const families = {
    media: new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif", ".raw", ".dng", ".tif", ".tiff", ".bmp", ".svg", ".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".mp3", ".wav", ".flac", ".aac", ".m4a", ".ogg"]),
    documents: new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".rtf", ".md", ".csv", ".epub"]),
    archives: new Set([".zip", ".7z", ".rar", ".tar", ".gz", ".bz2", ".xz", ".zst", ".iso"]),
    installers: new Set([".exe", ".msi", ".msix", ".appx", ".appxbundle", ".cab"]),
    developer: new Set([".js", ".jsx", ".ts", ".tsx", ".py", ".rs", ".go", ".java", ".class", ".jar", ".dll", ".pdb", ".obj", ".o", ".so", ".dylib", ".wasm", ".map", ".lock"]),
  };
  for (const [family, extensions] of Object.entries(families)) {
    if (extensions.has(ext)) return family;
  }
  return "other";
}

function syncDedupeControls() {
  ui.familyFilter.value = state.dedupeFilters.family;
  ui.minWasteFilter.value = String(state.dedupeFilters.minWaste);
  ui.copyFilter.value = String(state.dedupeFilters.minCopies);
  ui.pathFilter.value = state.dedupeFilters.path;
  renderDedupeScope();
}

function renderDedupeScope() {
  if (!state.dedupeScopePath) {
    ui.dedupeScope.classList.add("hidden");
    ui.dedupeScope.innerHTML = "";
    return;
  }
  ui.dedupeScope.classList.remove("hidden");
  ui.dedupeScope.innerHTML = `Branch scope: <strong>${escapeHtml(state.dedupeScopePath)}</strong> <button id="clearScope" class="scope-clear">×</button>`;
  $("clearScope")?.addEventListener("click", () => {
    state.dedupeScopePath = null;
    renderDedupeScope();
    renderDuplicates(state.report?.duplicates || []);
    renderAtlas();
  });
}

function refreshDedupeFilters() {
  state.dedupeFilters.family = ui.familyFilter.value;
  state.dedupeFilters.minWaste = Number(ui.minWasteFilter.value) || 0;
  state.dedupeFilters.minCopies = Number(ui.copyFilter.value) || 2;
  state.dedupeFilters.path = ui.pathFilter.value || "";
  renderDuplicates(state.report?.duplicates || []);
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
ui.familyFilter.addEventListener("change", refreshDedupeFilters);
ui.minWasteFilter.addEventListener("change", refreshDedupeFilters);
ui.copyFilter.addEventListener("change", refreshDedupeFilters);
ui.pathFilter.addEventListener("input", refreshDedupeFilters);
ui.clearDedupeFilters.addEventListener("click", () => {
  state.dedupeFilters = { family: "all", minWaste: 0, minCopies: 2, path: "" };
  state.dedupeScopePath = null;
  syncDedupeControls();
  renderDuplicates(state.report?.duplicates || []);
  renderAtlas();
});
setScanning(false);

if (window.__TAURI__?.event?.listen) {
  window.__TAURI__.event.listen("scan-progress", onProgress);
}
