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
- **NTFS MFT fast path on Windows** using `usn-journal-rs` when the selected path is on a drive-letter volume and the process has the required privileges.
- **Safe recursive fallback** via `walkdir`.
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

On Windows, running elevated lets File Atlas attempt the NTFS MFT accelerator. If unavailable, it automatically falls back to normal traversal and reports which scanner was used.

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
