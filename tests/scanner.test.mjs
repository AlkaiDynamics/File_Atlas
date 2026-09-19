import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { scanDirectory } from '../src/scanner.js';

async function withTempDir(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'file-atlas-'));
  try {
    await fn(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test('finds exact duplicates and rejects same-size non-matches', async () => {
  await withTempDir(async (root) => {
    await fs.mkdir(path.join(root, 'one'));
    await fs.mkdir(path.join(root, 'two'));
    const duplicate = Buffer.from('the-same-payload');
    const different = Buffer.from('other-payload---');
    assert.equal(duplicate.length, different.length);

    await fs.writeFile(path.join(root, 'one', 'a.bin'), duplicate);
    await fs.writeFile(path.join(root, 'two', 'b.bin'), duplicate);
    await fs.writeFile(path.join(root, 'two', 'c.bin'), different);

    const result = await scanDirectory(root, { cache: {}, concurrency: 2 });
    assert.equal(result.summary.fileCount, 3);
    assert.equal(result.duplicateGroups.length, 1);
    assert.equal(result.duplicateGroups[0].physicalCopies, 2);
    assert.equal(result.duplicateGroups[0].reclaimableBytes, duplicate.length);
    assert.equal(Math.round(result.tree.totalWasteBytes), duplicate.length);
  });
});

test('reuses metadata-stable SHA-256 cache entries', async () => {
  await withTempDir(async (root) => {
    const payload = Buffer.from('cache-me');
    await fs.writeFile(path.join(root, 'a.txt'), payload);
    await fs.writeFile(path.join(root, 'b.txt'), payload);
    const cache = {};

    const first = await scanDirectory(root, { cache, concurrency: 2 });
    assert.equal(first.summary.cacheHits, 0);
    const second = await scanDirectory(root, { cache, concurrency: 2 });
    assert.equal(second.summary.cacheHits, 2);
    assert.equal(second.summary.duplicateWasteBytes, payload.length);
  });
});

test('does not count hardlink aliases as separate physical duplicate copies', async (t) => {
  await withTempDir(async (root) => {
    const payload = Buffer.from('physical-copy-awareness');
    const original = path.join(root, 'original.bin');
    const alias = path.join(root, 'alias.bin');
    const copied = path.join(root, 'copied.bin');
    await fs.writeFile(original, payload);
    try {
      await fs.link(original, alias);
    } catch (error) {
      t.skip(`Hardlinks unavailable on this filesystem: ${error.message}`);
      return;
    }
    await fs.copyFile(original, copied);

    const result = await scanDirectory(root, { cache: {}, concurrency: 2 });
    assert.equal(result.summary.hardlinkAliasCount, 1);
    assert.equal(result.duplicateGroups.length, 1);
    assert.equal(result.duplicateGroups[0].physicalCopies, 2);
    assert.equal(result.duplicateGroups[0].pathCount, 3);
    assert.equal(result.duplicateGroups[0].reclaimableBytes, payload.length);
  });
});
