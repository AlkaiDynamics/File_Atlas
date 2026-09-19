import { createReadStream, promises as fs } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { buildAnalysis } from './analysis.js';

export class ScanCancelledError extends Error {
  constructor() {
    super('Scan cancelled');
    this.name = 'ScanCancelledError';
    this.code = 'SCAN_CANCELLED';
  }
}

function cancelled(shouldCancel) {
  if (shouldCancel?.()) throw new ScanCancelledError();
}

function physicalKey(stat, filePath) {
  const ino = stat.ino?.toString?.() ?? '0';
  const dev = stat.dev?.toString?.() ?? '0';
  return ino !== '0' ? `${dev}:${ino}` : `path:${filePath}`;
}

function cacheMatches(entry, file) {
  return entry &&
    entry.size === file.size &&
    entry.mtimeMs === file.mtimeMs &&
    entry.ctimeMs === file.ctimeMs &&
    typeof entry.hash === 'string';
}

async function hashFile(filePath, shouldCancel) {
  cancelled(shouldCancel);
  const hash = crypto.createHash('sha256');
  const stream = createReadStream(filePath, { highWaterMark: 1024 * 1024 });

  for await (const chunk of stream) {
    cancelled(shouldCancel);
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function runPool(items, concurrency, worker) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  });
  await Promise.all(workers);
}

async function enumerateFiles(rootPath, onProgress, shouldCancel) {
  const files = [];
  const warnings = [];
  const stack = [path.resolve(rootPath)];
  const seenDirectories = new Set();
  let logicalBytes = 0;
  let skippedLinks = 0;

  while (stack.length) {
    cancelled(shouldCancel);
    const directory = stack.pop();

    let realDirectory;
    try {
      realDirectory = await fs.realpath(directory);
    } catch (error) {
      warnings.push({ path: directory, message: error.message });
      continue;
    }
    if (seenDirectories.has(realDirectory)) continue;
    seenDirectories.add(realDirectory);

    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      warnings.push({ path: directory, message: error.message });
      continue;
    }

    for (const entry of entries) {
      cancelled(shouldCancel);
      const fullPath = path.join(directory, entry.name);

      if (entry.isSymbolicLink()) {
        skippedLinks += 1;
        continue;
      }
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;

      try {
        const stat = await fs.stat(fullPath, { bigint: true });
        const size = Number(stat.size);
        const file = {
          path: fullPath,
          name: entry.name,
          dir: directory,
          size,
          mtimeMs: Number(stat.mtimeMs),
          ctimeMs: Number(stat.ctimeMs),
          nlink: Number(stat.nlink),
          fileKey: physicalKey(stat, fullPath),
          extension: path.extname(entry.name).toLowerCase() || '(none)',
          hash: null,
          duplicateGroupId: null,
          physicalBytes: size,
          wasteBytes: 0
        };
        files.push(file);
        logicalBytes += size;

        if (files.length % 250 === 0) {
          onProgress?.({ phase: 'walking', files: files.length, bytes: logicalBytes, current: fullPath });
        }
      } catch (error) {
        warnings.push({ path: fullPath, message: error.message });
      }
    }
  }

  onProgress?.({ phase: 'walking', files: files.length, bytes: logicalBytes, current: rootPath, complete: true });
  return { files, warnings, logicalBytes, skippedLinks };
}

export async function scanDirectory(rootPath, options = {}) {
  const started = Date.now();
  const {
    onProgress,
    shouldCancel = () => false,
    cache = {},
    concurrency = Math.max(2, Math.min(6, Number(process.env.FILE_ATLAS_HASH_CONCURRENCY) || 4))
  } = options;

  const rootStat = await fs.stat(rootPath);
  if (!rootStat.isDirectory()) throw new Error('Selected path is not a directory');

  const { files, warnings, logicalBytes, skippedLinks } = await enumerateFiles(rootPath, onProgress, shouldCancel);
  cancelled(shouldCancel);

  const aliasesByPhysicalKey = new Map();
  for (const file of files) {
    if (!aliasesByPhysicalKey.has(file.fileKey)) aliasesByPhysicalKey.set(file.fileKey, []);
    aliasesByPhysicalKey.get(file.fileKey).push(file);
  }
  for (const aliases of aliasesByPhysicalKey.values()) {
    const share = aliases[0].size / aliases.length;
    for (const file of aliases) file.physicalBytes = share;
  }

  const physicalRepresentatives = [...aliasesByPhysicalKey.values()].map((aliases) => aliases[0]);
  const physicalBytes = physicalRepresentatives.reduce((sum, file) => sum + file.size, 0);
  const hardlinkAliasCount = files.length - physicalRepresentatives.length;

  const sizeBuckets = new Map();
  for (const file of physicalRepresentatives) {
    if (file.size === 0) continue;
    if (!sizeBuckets.has(file.size)) sizeBuckets.set(file.size, []);
    sizeBuckets.get(file.size).push(file);
  }
  const candidates = [...sizeBuckets.values()].filter((bucket) => bucket.length > 1).flat();
  let cacheHits = 0;
  let hashed = 0;

  onProgress?.({ phase: 'hashing', current: 0, total: candidates.length, cacheHits: 0 });
  await runPool(candidates, concurrency, async (file) => {
    cancelled(shouldCancel);
    const key = `id:${file.fileKey}`;
    const cached = cache[key];
    if (cacheMatches(cached, file)) {
      file.hash = cached.hash;
      cacheHits += 1;
    } else {
      file.hash = await hashFile(file.path, shouldCancel);
      cache[key] = {
        size: file.size,
        mtimeMs: file.mtimeMs,
        ctimeMs: file.ctimeMs,
        hash: file.hash,
        lastSeen: Date.now()
      };
    }

    cache[key].lastSeen = Date.now();
    for (const alias of aliasesByPhysicalKey.get(file.fileKey)) alias.hash = file.hash;
    hashed += 1;
    if (hashed % 10 === 0 || hashed === candidates.length) {
      onProgress?.({ phase: 'hashing', current: hashed, total: candidates.length, cacheHits });
    }
  });

  cancelled(shouldCancel);
  onProgress?.({ phase: 'analyzing' });

  const contentGroups = new Map();
  for (const file of candidates) {
    if (!file.hash) continue;
    const key = `${file.size}:${file.hash}`;
    if (!contentGroups.has(key)) contentGroups.set(key, []);
    contentGroups.get(key).push(file);
  }

  const duplicateGroups = [];
  let duplicateWasteBytes = 0;
  for (const representatives of contentGroups.values()) {
    if (representatives.length < 2) continue;
    const size = representatives[0].size;
    const physicalCopies = representatives.length;
    const reclaimableBytes = size * (physicalCopies - 1);
    const groupId = `${size}-${representatives[0].hash.slice(0, 16)}`;
    const paths = [];

    for (const representative of representatives) {
      const aliases = aliasesByPhysicalKey.get(representative.fileKey);
      const physicalWasteShare = reclaimableBytes / physicalCopies;
      const aliasWasteShare = physicalWasteShare / aliases.length;
      for (const alias of aliases) {
        alias.duplicateGroupId = groupId;
        alias.wasteBytes = aliasWasteShare;
        paths.push({
          path: alias.path,
          fileKey: alias.fileKey,
          hardlinkAliases: aliases.length,
          wasteShareBytes: aliasWasteShare
        });
      }
    }

    duplicateWasteBytes += reclaimableBytes;
    duplicateGroups.push({
      id: groupId,
      hash: representatives[0].hash,
      size,
      physicalCopies,
      pathCount: paths.length,
      reclaimableBytes,
      sampleName: representatives[0].name,
      paths: paths.sort((a, b) => a.path.localeCompare(b.path))
    });
  }

  duplicateGroups.sort((a, b) => b.reclaimableBytes - a.reclaimableBytes);

  const baseSummary = {
    fileCount: files.length,
    logicalBytes,
    physicalBytes,
    duplicateWasteBytes,
    physicalBytesAfterDedup: Math.max(0, physicalBytes - duplicateWasteBytes),
    hardlinkAliasCount,
    skippedLinkCount: skippedLinks,
    hashedPhysicalFiles: candidates.length,
    cacheHits,
    elapsedMs: Date.now() - started
  };

  const result = buildAnalysis(rootPath, files, duplicateGroups, baseSummary, warnings);
  onProgress?.({ phase: 'done', summary: result.summary });
  return result;
}
