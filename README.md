# File Atlas

File Atlas is a local-first desktop analyzer for answering two different questions without confusing them:

1. **Where is my disk space going?**
2. **Where is space provably wasted by exact duplicate content?**

The application maps a selected folder into an interactive directory treemap, ranks duplicate-heavy hotspots, shows file-type composition and largest files, and exposes every SHA-256 verified duplicate family before any cleanup action is considered.

## What works now

- Native folder picker through Electron.
- Recursive filesystem traversal with loop-resistant directory handling and symbolic-link skipping.
- **Size-first duplicate pruning:** unique file sizes are never hashed.
- **Full SHA-256 verification:** same-size candidates are cryptographically verified before being called duplicates.
- Concurrent hashing with a persistent metadata/hash cache for much faster repeat scans.
- Hardlink-aware accounting: multiple paths to the same physical file are recognized as already shared storage rather than falsely reported as reclaimable copies.
- Separate logical, physical, and exact-duplicate-waste byte counts.
- Interactive directory treemap with two lenses:
  - **Duplicate waste** — rectangle area is reclaimable exact duplicate data.
  - **Physical size** — rectangle area is occupied physical data; color still communicates duplicate density.
- Ranked duplicate hotspots, file-type bars, top-file list, and expandable duplicate families.
- Reveal-in-folder actions for individual files.
- Scan cancellation and bounded reporting of unreadable paths.
- Read-only by design in this release: File Atlas does **not** delete, move, or hardlink files.

## Run it

Requirements: Node.js 18+ and npm.

```bash
npm install
npm start
```

Then choose a folder and click **Scan**.

## Tests

The scanner tests use only Node built-ins, so they can run without launching Electron:

```bash
npm test
npm run check
```

Tests cover exact duplicate verification, rejection of same-size non-matches, repeat-scan hash caching, and hardlink-aware physical-copy accounting.

## How duplicate waste is calculated

File Atlas does not pick an arbitrary path and call it "the original." For a SHA-256 group containing `N` distinct physical copies of a file of size `S`:

```text
reclaimable bytes = S × (N - 1)
```

If several paths are hardlinks to the same physical copy, those paths count as one physical copy. This prevents File Atlas from claiming savings that NTFS (or another filesystem) has already realized.

For the spatial bloat map, a group's reclaimable bytes are distributed across its physical copies (and then across hardlink aliases) only for visualization. The group-level reclaimable total remains exact.

## Design lineage

The rebuild uses independently implemented patterns validated by the three reference projects reviewed for this recovery:

- **CloneReaper Prime** — size-first candidate pruning, full content hashing, parallel work, safe/non-destructive analysis separation.
- **WinDedup / File-deduplication** — filesystem traversal discipline, hash caching, exact-hash grouping, and the distinction between analysis and destructive actions.
- **DeduplicateMinifilterDriver** — physical-content identity and hardlink/dedup awareness.

No kernel driver is required by File Atlas. A minifilter is useful for *preventing future duplicate writes*, but making a Windows driver a prerequisite would turn a portable analyzer into a privileged system component. That remains a separate optional future layer.

## Safety model

This release intentionally stops at **evidence + visualization**. It gives you a reliable map of what could be reclaimed, but it does not mutate the filesystem. The next cleanup layer should preserve this separation and add quarantine/dry-run/hardlink operations behind explicit review rather than coupling deletion to discovery.
