use crate::cache::HashCache;
use crate::duplicates::find_exact_duplicates;
use crate::engine::scan_root;
use crate::models::ScanProgress;
use crate::scanner::collect_files;
use std::fs;
use std::io::{Seek, SeekFrom, Write};
use std::path::Path;
use std::thread;
use std::time::Duration;
use tempfile::tempdir;

fn silent(_: ScanProgress) {}

fn write(path: &Path, bytes: &[u8]) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, bytes).unwrap();
}

#[test]
fn exact_duplicates_across_directories_are_verified_and_counted() {
    let dir = tempdir().unwrap();
    let a = dir.path().join("one").join("alpha.bin");
    let b = dir.path().join("two").join("beta.bin");
    write(&a, b"verified duplicate payload");
    write(&b, b"verified duplicate payload");

    let report = scan_root(dir.path(), silent).unwrap();
    assert_eq!(report.duplicates.len(), 1);
    assert_eq!(report.duplicates[0].physical_copies, 2);
    assert_eq!(report.duplicates[0].hardlink_aliases, 0);
    assert!(report.duplicates[0].reclaimable_bytes > 0);
    assert_eq!(report.summary.reclaimable_bytes, report.duplicates[0].reclaimable_bytes);
}

#[test]
fn same_size_different_content_is_never_duplicate_waste() {
    let dir = tempdir().unwrap();
    write(&dir.path().join("a.bin"), b"AAAA");
    write(&dir.path().join("b.bin"), b"BBBB");

    let report = scan_root(dir.path(), silent).unwrap();
    assert!(report.duplicates.is_empty());
    assert_eq!(report.summary.reclaimable_bytes, 0);
}

#[test]
fn identical_head_and_tail_but_changed_middle_is_not_a_duplicate() {
    let dir = tempdir().unwrap();
    let a = dir.path().join("a.bin");
    let b = dir.path().join("b.bin");
    let mut left = vec![7u8; 256 * 1024];
    let mut right = left.clone();
    left[128 * 1024] = 1;
    right[128 * 1024] = 2;
    write(&a, &left);
    write(&b, &right);

    let report = scan_root(dir.path(), silent).unwrap();
    assert!(report.duplicates.is_empty());
}

#[test]
fn hardlinks_alone_do_not_create_reclaimable_duplicate_waste() {
    let dir = tempdir().unwrap();
    let source = dir.path().join("original.bin");
    let alias = dir.path().join("alias.bin");
    write(&source, b"one physical file");
    fs::hard_link(&source, &alias).unwrap();

    let inventory = collect_files(dir.path(), &silent).unwrap();
    let one_physical_allocation = inventory.files[0].allocated_bytes;
    let report = scan_root(dir.path(), silent).unwrap();
    assert_eq!(report.summary.files_scanned, 2);
    assert_eq!(report.summary.hardlink_aliases, 1);
    assert!(report.duplicates.is_empty());
    assert_eq!(report.summary.reclaimable_bytes, 0);
    assert_eq!(report.summary.allocated_bytes, one_physical_allocation);
}

#[test]
fn hardlink_alias_plus_physical_copy_counts_only_one_redundant_physical_copy() {
    let dir = tempdir().unwrap();
    let source = dir.path().join("original.bin");
    let alias = dir.path().join("alias.bin");
    let copy = dir.path().join("copy.bin");
    write(&source, b"three paths but two physical files");
    fs::hard_link(&source, &alias).unwrap();
    fs::copy(&source, &copy).unwrap();

    let report = scan_root(dir.path(), silent).unwrap();
    assert_eq!(report.duplicates.len(), 1);
    let group = &report.duplicates[0];
    assert_eq!(group.members.len(), 3);
    assert_eq!(group.physical_copies, 2);
    assert_eq!(group.hardlink_aliases, 1);
    assert!(group.reclaimable_bytes > 0);
}

#[test]
fn zero_byte_files_do_not_inflate_duplicate_waste() {
    let dir = tempdir().unwrap();
    write(&dir.path().join("empty-a"), b"");
    write(&dir.path().join("empty-b"), b"");

    let report = scan_root(dir.path(), silent).unwrap();
    assert!(report.duplicates.is_empty());
    assert_eq!(report.summary.reclaimable_bytes, 0);
}

#[test]
fn stale_inventory_record_is_rejected_after_file_changes() {
    let dir = tempdir().unwrap();
    let a = dir.path().join("a.bin");
    let b = dir.path().join("b.bin");
    write(&a, b"same-size");
    write(&b, b"same-size");

    let mut inventory = collect_files(dir.path(), &silent).unwrap();
    assert_eq!(inventory.files.len(), 2);
    thread::sleep(Duration::from_millis(5));
    write(&b, b"different");

    let cache = HashCache::open().unwrap();
    let groups = find_exact_duplicates(&mut inventory.files, &cache, &silent);
    assert!(groups.is_empty(), "changed files must not survive a stale metadata snapshot");
}

#[test]
fn unicode_and_long_names_survive_inventory_and_reporting() {
    let dir = tempdir().unwrap();
    let nested = dir
        .path()
        .join("資料-δelta-🌌")
        .join("a".repeat(120))
        .join("b".repeat(80));
    let file = nested.join("résumé-文件.txt");
    write(&file, b"unicode path");

    let report = scan_root(dir.path(), silent).unwrap();
    assert_eq!(report.summary.files_scanned, 1);
    assert!(report.large_files.is_empty());
    assert!(report.directory_tree.logical_bytes >= 12);
}

#[cfg(unix)]
#[test]
fn symlink_to_file_outside_root_is_not_followed_or_counted() {
    use std::os::unix::fs::symlink;
    let scan = tempdir().unwrap();
    let outside = tempdir().unwrap();
    let target = outside.path().join("secret.bin");
    write(&target, b"outside");
    symlink(&target, scan.path().join("link.bin")).unwrap();

    let inventory = collect_files(scan.path(), &silent).unwrap();
    assert!(inventory.files.is_empty());
}

#[test]
fn sparse_file_reports_logical_size_without_crashing_accounting() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("sparse.bin");
    let mut file = fs::File::create(&path).unwrap();
    file.seek(SeekFrom::Start(8 * 1024 * 1024 - 1)).unwrap();
    file.write_all(&[0]).unwrap();
    drop(file);

    let inventory = collect_files(dir.path(), &silent).unwrap();
    assert_eq!(inventory.files.len(), 1);
    assert_eq!(inventory.files[0].logical_bytes, 8 * 1024 * 1024);
}

#[test]
fn candidate_bloat_is_not_automatically_counted_as_verified_waste() {
    let dir = tempdir().unwrap();
    for n in 0..20 {
        write(
            &dir.path().join("project").join("node_modules").join(format!("pkg-{n}.js")),
            format!("unique package {n}").as_bytes(),
        );
    }

    let report = scan_root(dir.path(), silent).unwrap();
    assert_eq!(report.summary.reclaimable_bytes, 0);
    assert!(report.signals.iter().any(|signal| signal.kind == "dependencies"));
}

#[test]
fn deep_tree_scan_completes_without_losing_files() {
    let dir = tempdir().unwrap();
    let mut path = dir.path().to_path_buf();
    for depth in 0..18 {
        path.push(format!("level-{depth}"));
    }
    for n in 0..50 {
        write(&path.join(format!("file-{n}.dat")), format!("payload-{n}").as_bytes());
    }

    let report = scan_root(dir.path(), silent).unwrap();
    assert_eq!(report.summary.files_scanned, 50);
    assert_eq!(report.summary.reclaimable_bytes, 0);
}

#[test]
fn moderate_many_file_smoke_scan_has_correct_count_and_no_false_waste() {
    let dir = tempdir().unwrap();
    for n in 0..1000 {
        write(
            &dir.path().join(format!("bucket-{}", n % 20)).join(format!("file-{n}.txt")),
            format!("unique-{n:08}").as_bytes(),
        );
    }

    let report = scan_root(dir.path(), silent).unwrap();
    assert_eq!(report.summary.files_scanned, 1000);
    assert_eq!(report.summary.reclaimable_bytes, 0);
}


#[test]
fn scan_rejects_missing_and_non_directory_roots() {
    let dir = tempdir().unwrap();
    let file = dir.path().join("not-a-directory.txt");
    write(&file, b"x");
    let missing = dir.path().join("does-not-exist");

    assert!(scan_root(&file, silent).is_err());
    assert!(scan_root(&missing, silent).is_err());
}

#[cfg(unix)]
#[test]
fn directory_symlink_is_not_followed_into_external_tree() {
    use std::os::unix::fs::symlink;
    let scan = tempdir().unwrap();
    let outside = tempdir().unwrap();
    write(&outside.path().join("nested").join("outside.bin"), b"outside");
    symlink(outside.path(), scan.path().join("external-dir")).unwrap();

    let report = scan_root(scan.path(), silent).unwrap();
    assert_eq!(report.summary.files_scanned, 0);
}

#[test]
fn production_scan_modules_have_no_user_file_mutation_primitives() {
    // Cache writes are intentionally isolated in cache.rs. The scanner/analyzer
    // side of the trust boundary must remain read-only until cleanup is designed.
    let sources = [
        include_str!("scanner.rs"),
        include_str!("engine.rs"),
        include_str!("duplicates.rs")
            .split("#[cfg(test)]")
            .next()
            .unwrap_or(""),
    ];
    let forbidden = [
        "remove_file(",
        "remove_dir(",
        "remove_dir_all(",
        "hard_link(",
        "fs::write(",
        "File::create(",
        "OpenOptions",
        "set_len(",
    ];

    for source in sources {
        for token in forbidden {
            assert!(
                !source.contains(token),
                "production analysis code contains forbidden mutation primitive: {token}"
            );
        }
    }
}
