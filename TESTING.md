# File Atlas Safety & Validation Matrix

File Atlas v2 is intentionally read-only. The test strategy is built around two questions:

1. Can the analyzer report the wrong thing convincingly?
2. Can the analyzer touch user files when it should only observe them?

The answer to both must stay **no** before cleanup features are considered.

## Automated regression coverage

The Rust suite in `src-tauri/src/regression_tests.rs` covers:

| Risk | Expected invariant |
|---|---|
| Exact duplicates in different folders | One verified group, one physical copy retained conceptually, redundant allocation measured |
| Same-size but different content | Never labeled duplicate waste |
| Same head/tail with changed middle | Full hash + final byte verification prevents false match |
| Hardlink aliases only | Count paths, count one physical allocation, report zero reclaimable duplicate waste |
| Hardlink alias + real physical copy | Count one hardlink alias and exactly one redundant physical copy |
| Zero-byte files | Do not create meaningless reclaimable waste |
| File changes after inventory | Stale evidence is rejected |
| File disappears after inventory | Scan degrades safely without false evidence |
| Unicode and long paths | Inventory/reporting survives non-ASCII and long path components |
| Symlink to external file | Not followed into outside content |
| Directory symlink | Not traversed outside selected tree |
| Sparse file | Logical size survives; allocation accounting remains independent |
| Cache/dependency/build-pattern folders | May be flagged as candidates but never promoted to verified duplicate waste |
| Deep directory hierarchy | Scan completes without dropping files |
| Many-file smoke fixture | Correct file count, no false duplicate waste |
| Missing path / file passed as root | Rejected cleanly |
| Handle lifecycle | Files can be renamed immediately after analysis |
| Read-only trust boundary | Production scan/analyzer code fails the suite if destructive file APIs are introduced |

Additional unit tests exercise the final byte verifier directly.

## CI gates

`.github/workflows/safety-gate.yml` defines:

- UI JavaScript syntax + JSON config validation.
- Linux Rust regression suite.
- Windows Rust regression suite.
- Windows compile check for the experimental `mft-fast` feature.
- Full Windows Tauri desktop build.
- Upload of the resulting `file-atlas.exe` when the desktop build succeeds.

### Current GitHub Actions note

As of September 19, 2026, the repository's GitHub-hosted runs are failing before any workflow step begins (empty step lists / no runner execution). That is a CI-infrastructure/startup condition, not a test result. The workflow is retained so it can execute automatically when runner provisioning recovers.

## Manual Windows torture pass before calling v2 stable

These require a real Windows/NTFS machine because CI cannot faithfully simulate every storage feature.

1. **Normal user folder**
   - Scan a medium folder with known sizes.
   - Compare several directory totals against Explorer/PowerShell.
   - Confirm SPACE / WASTE / STRUCTURE lenses remain internally consistent.

2. **Known duplicate fixture**
   - Create 2–3 real copies in different folders.
   - Create an NTFS hardlink alias to one copy.
   - Confirm the alias does not inflate physical or reclaimable bytes.

3. **Junction/reparse fixture**
   - Put a junction under the selected root pointing elsewhere.
   - Confirm File Atlas does not traverse through it.

4. **Sparse file**
   - Create a sparse file with large logical size and small allocation.
   - Confirm logical and allocated values are visibly different.

5. **Compressed NTFS file/folder**
   - Scan compressed content and compare allocation against Windows-reported allocation.

6. **Cloud placeholder folder**
   - Test OneDrive or another Files On-Demand location.
   - Confirm File Atlas does not unexpectedly hydrate/download placeholder content.
   - Treat skipped reparse-backed entries as uncertainty, not zero-size proof.

7. **Access-denied subtree**
   - Include a directory the current process cannot enumerate.
   - Confirm the scan completes and reports excluded/unreadable entries.

8. **Live-changing workload**
   - Scan a folder while another process writes/renames files.
   - Confirm no crash and no changing file becomes exact-duplicate evidence.

9. **Large-tree performance**
   - 100k files, then 1M+ if practical.
   - Measure index time, hash time, peak RAM, and UI responsiveness separately.

10. **Whole-drive smoke test**
    - Only after the preceding cases pass.
    - Run read-only against a noncritical drive first, then a system drive.
    - Compare total enumerated allocation with independent tools while remembering File Atlas intentionally skips reparse-backed content in the safe release path.

## MFT accelerator policy

The `mft-fast` feature is **not enabled in the default desktop release**.

Reason: MFT/USN enumeration is fast, but NTFS permits several directory entries (hardlinks) to reference one file. Until File Atlas explicitly expands and verifies every hardlink name, using MFT enumeration as the release source of filesystem structure could omit visible paths.

The experimental feature is compile-checked separately so the accelerator can evolve without compromising the correctness-first scanner.

## Release gate

Do not call the build stable until all of the following are true:

- Automated suite passes on Windows and Linux.
- Windows desktop build succeeds.
- Known-duplicate fixture matches expected bytes.
- Hardlinks do not inflate physical/waste totals.
- Reparse/junction traversal stays inside the intended boundary.
- Live-changing files do not produce false exact matches.
- No user-file mutation capability exists in the production scan/analyzer path.
- Manual scan of a representative real machine completes without UI lockup or materially unexplained totals.
