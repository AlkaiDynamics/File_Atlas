import path from 'node:path';

function makeNode(name, nodePath) {
  return {
    name,
    path: nodePath,
    ownLogicalBytes: 0,
    ownPhysicalBytes: 0,
    ownWasteBytes: 0,
    ownFileCount: 0,
    ownDuplicatePathCount: 0,
    totalLogicalBytes: 0,
    totalPhysicalBytes: 0,
    totalWasteBytes: 0,
    fileCount: 0,
    duplicatePathCount: 0,
    _children: new Map()
  };
}

function finalizeNode(node, hotspots) {
  const children = [...node._children.values()]
    .map((child) => finalizeNode(child, hotspots))
    .sort((a, b) => b.totalPhysicalBytes - a.totalPhysicalBytes);

  node.totalLogicalBytes = node.ownLogicalBytes + children.reduce((sum, child) => sum + child.totalLogicalBytes, 0);
  node.totalPhysicalBytes = node.ownPhysicalBytes + children.reduce((sum, child) => sum + child.totalPhysicalBytes, 0);
  node.totalWasteBytes = node.ownWasteBytes + children.reduce((sum, child) => sum + child.totalWasteBytes, 0);
  node.fileCount = node.ownFileCount + children.reduce((sum, child) => sum + child.fileCount, 0);
  node.duplicatePathCount = node.ownDuplicatePathCount + children.reduce((sum, child) => sum + child.duplicatePathCount, 0);

  if (node.totalWasteBytes > 0) {
    hotspots.push({
      name: node.name,
      path: node.path,
      wasteBytes: node.totalWasteBytes,
      physicalBytes: node.totalPhysicalBytes,
      fileCount: node.fileCount,
      duplicatePathCount: node.duplicatePathCount
    });
  }

  delete node._children;
  node.children = children;
  return node;
}

export function buildAnalysis(rootPath, files, duplicateGroups, baseSummary, warnings = []) {
  const rootName = path.basename(path.resolve(rootPath)) || path.resolve(rootPath);
  const root = makeNode(rootName, path.resolve(rootPath));
  const extensionMap = new Map();

  for (const file of files) {
    const relative = path.relative(rootPath, file.path);
    const parts = relative.split(path.sep).filter(Boolean);
    const dirParts = parts.slice(0, -1);

    let node = root;
    let currentPath = path.resolve(rootPath);
    for (const part of dirParts) {
      currentPath = path.join(currentPath, part);
      if (!node._children.has(part)) {
        node._children.set(part, makeNode(part, currentPath));
      }
      node = node._children.get(part);
    }

    node.ownLogicalBytes += file.size;
    node.ownPhysicalBytes += file.physicalBytes;
    node.ownWasteBytes += file.wasteBytes;
    node.ownFileCount += 1;
    if (file.duplicateGroupId) node.ownDuplicatePathCount += 1;

    const ext = file.extension || '(none)';
    if (!extensionMap.has(ext)) {
      extensionMap.set(ext, { extension: ext, logicalBytes: 0, physicalBytes: 0, wasteBytes: 0, fileCount: 0 });
    }
    const extRow = extensionMap.get(ext);
    extRow.logicalBytes += file.size;
    extRow.physicalBytes += file.physicalBytes;
    extRow.wasteBytes += file.wasteBytes;
    extRow.fileCount += 1;
  }

  const hotspots = [];
  const tree = finalizeNode(root, hotspots);
  hotspots.sort((a, b) => b.wasteBytes - a.wasteBytes);

  const extensions = [...extensionMap.values()].sort((a, b) => b.physicalBytes - a.physicalBytes);
  const topFiles = [...files]
    .sort((a, b) => b.size - a.size)
    .slice(0, 200)
    .map((file) => ({
      path: file.path,
      name: file.name,
      size: file.size,
      physicalBytes: file.physicalBytes,
      wasteBytes: file.wasteBytes,
      extension: file.extension,
      duplicateGroupId: file.duplicateGroupId
    }));

  return {
    rootPath: path.resolve(rootPath),
    summary: {
      ...baseSummary,
      duplicateGroupCount: duplicateGroups.length,
      warningCount: warnings.length
    },
    tree,
    hotspots: hotspots.slice(0, 250),
    extensions,
    topFiles,
    duplicateGroups,
    warnings: warnings.slice(0, 100)
  };
}
