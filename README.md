# File Atlas

File Atlas is a Windows-first **storage forensics** desktop application. It answers four different questions without conflating them:

1. **What physically occupies the disk?**
2. **Where is byte-for-byte duplicate waste?**
3. **What directory structures are logically bloated?**
4. **Which caches, build outputs, dependency trees, backups, and giant/stale files deserve human review?**

The application is intentionally read-only at this stage. It does not delete, move, quarantine, or hardlink files.

## Architecture

- **Tauri 2** desktop shell with a static, dependency-light frontend.
- **Rust** scanning and analysis core.
- **Safe recursive traversal by default** via `walkdir`, with symlink/reparse-directory pruning.
- **Experimental NTFS MFT accelerator** behind the `mft-fast` feature; it is not enabled in the release build until hardlink-name completeness is verified.
- **Physical file identity** so hardlinks do not masquerade as duplicate physical storage.
- **Allocated bytes and logical bytes tracked separately.**
- **Persistent SQLite hash cache** in the OS cache directory.
- **Parallel hashing** with Rayon.
- **Exact duplicate pipeline:** size bucket → BLAKE3 head/tail prehash → full BLAKE3 → final byte-for-byte verification.
- **Three Atlas lenses:** `SPACE` (physical bytes), `WASTE` (verified reclaimable duplicate bytes), and `STRUCTURE` (logical path size).
- Candidate bloat signals are separate from verified duplicate waste. A dependency, cache, build, archive, or backup tree is a review target, not an automatic deletion claim.

## Why the final byte comparison exists

A cryptographic content hash is an extremely strong identity signal, but File Atlas treats it as candidate proof rather than destructive-grade final proof. Files with the same full BLAKE3 digest are still compared byte-for-byte before the UI labels them exact duplicates.

## Run

Prerequisites: Rust 1.85+, Node.js 20+, and the normal Tauri prerequisites for your platform.

```bash
npm install
npm run dev
```

The default desktop build always uses the completeness-first walker. The experimental MFT accelerator can be compiled with `--features mft-fast`, but is deliberately excluded from the release path for now.

## Tests

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm run check:ui
```

GitHub Actions runs Rust tests on Ubuntu and Windows plus a JavaScript syntax check.

## Analysis semantics

### Physical space
A physical file identity is counted once even when several hardlink paths reference it.

### Reclaimable exact-duplicate waste
For a byte-verified content group, paths are grouped by physical file identity. Hardlink aliases do not count as extra reclaimable copies. The estimate keeps one physical copy and sums redundant physical allocations.

### Candidate bloat
Pattern-based signals such as dependency trees, caches, build outputs, and backups are **not** verified waste. They are investigative leads only.

## Next hardening layer

The scanner interface is separated from analysis so USN Change Journal incremental refresh can be added without changing duplicate semantics or the evidence model. Cleanup actions should only be added behind a second trust boundary with re-stat/reverify checks, Recycle Bin or quarantine defaults, audit logging, and undo where supported.


## Current visualization

The v2 reference renderer is an expandable **hierarchical visual-mass list**. Each row represents a directory branch and carries a proportional bar under three interchangeable lenses:

- **SPACE** — allocated physical bytes.
- **WASTE** — byte-verified reclaimable duplicate allocation.
- **STRUCTURE** — logical path size.

This is intentionally the boring/correct renderer. A future infinite-canvas tree can use branch thickness and node size as visual mass while consuming the same evidence model.

## Validation

See [TESTING.md](TESTING.md) for the automated adversarial suite, manual Windows torture pass, and release gate.


## Dedupe-first workflow

Exact dedupe is the priority for v2. After a scan, File Atlas opens on the **WASTE** lens and supports:

- branch-to-duplicate drilldown: click a swollen directory branch to scope exact duplicate groups to that location;
- file-family filters for media, documents, archives, installers, developer files, and other content;
- minimum reclaimable-byte and physical-copy thresholds;
- path text filtering;
- path-sensitivity filtering for user-looking versus obvious system/application locations;
- explicit **EXACT · BYTE VERIFIED** evidence labels;
- explicit **REFERENCE** semantics: the reference path is only the physical copy used to anchor reclaimable-byte accounting and is never a deletion recommendation.

The objective is to make manual pruning faster and more confident before any destructive cleanup executor is introduced.
