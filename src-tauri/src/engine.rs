use crate::cache::HashCache;
use crate::duplicates::find_exact_duplicates;
use crate::models::{
    BloatSignal, DirectoryHotspot, DirectoryNode, FileRecord, LargeFile, ScanProgress, ScanReport,
    ScanSummary, TypeStat,
};
use crate::scanner::collect_files;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::Path;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Default)]
struct DirAccumulator {
    name: String,
    path: String,
    logical_bytes: u64,
    allocated_bytes: u64,
    reclaimable_bytes: u64,
    file_count: u64,
    duplicate_file_count: u64,
    children: BTreeMap<String, DirAccumulator>,
}

pub fn scan_root<F>(root: &Path, progress: F) -> Result<ScanReport, String>
where
    F: Fn(ScanProgress) + Sync,
{
    let started = Instant::now();
    let root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let mut inventory = collect_files(&root, &progress)?;
    // Stable ordering makes physical-byte attribution deterministic when one
    // physical file has hardlink paths in multiple directories.
    inventory.files.sort_by(|a, b| a.path.cmp(&b.path));
    let cache = match HashCache::open() {
        Ok(cache) => cache,
        Err(error) => {
            inventory.warnings.push(format!(
                "Persistent hash cache unavailable; using an in-memory cache for this scan: {error}"
            ));
            HashCache::memory()
                .map_err(|memory_error| format!("Unable to initialize hash cache: {memory_error}"))?
        }
    };
    let duplicates = find_exact_duplicates(&mut inventory.files, &cache, &progress);

    progress(ScanProgress {
        phase: "aggregate".into(),
        current: 0,
        total: None,
        message: "Building physical-space and waste maps".into(),
    });

    let allocated_bytes = physical_total(&inventory.files);
    let logical_bytes = inventory.files.iter().map(|f| f.logical_bytes).sum();
    let reclaimable_bytes = duplicates.iter().map(|g| g.reclaimable_bytes).sum();
    let unique_physical_files = inventory
        .files
        .iter()
        .map(|file| file.identity.as_str())
        .collect::<HashSet<_>>()
        .len();
    let hardlink_aliases = inventory.files.len().saturating_sub(unique_physical_files);
    let duplicate_paths = duplicates.iter().map(|g| g.members.len()).sum();

    let (directory_tree, hotspots) = build_directory_views(&root, &inventory.files);
    let types = build_type_stats(&inventory.files);
    let large_files = build_large_files(&inventory.files);
    let signals = build_bloat_signals(&inventory.files);

    progress(ScanProgress {
        phase: "done".into(),
        current: inventory.files.len(),
        total: Some(inventory.files.len()),
        message: "Analysis complete".into(),
    });

    Ok(ScanReport {
        summary: ScanSummary {
            root: root.to_string_lossy().to_string(),
            scanner_mode: inventory.mode,
            files_scanned: inventory.files.len(),
            logical_bytes,
            allocated_bytes,
            reclaimable_bytes,
            duplicate_groups: duplicates.len(),
            duplicate_paths,
            hardlink_aliases,
            unreadable_entries: inventory.unreadable,
            elapsed_ms: started
                .elapsed()
                .as_millis()
                .min(u64::MAX as u128) as u64,
        },
        directory_tree,
        hotspots,
        duplicates,
        types,
        large_files,
        signals,
        warnings: inventory.warnings,
    })
}

fn physical_total(files: &[FileRecord]) -> u64 {
    let mut seen = HashSet::new();
    files
        .iter()
        .filter_map(|file| seen.insert(file.identity.clone()).then_some(file.allocated_bytes))
        .sum()
}

fn build_directory_views(root: &Path, files: &[FileRecord]) -> (DirectoryNode, Vec<DirectoryHotspot>) {
    let mut root_acc = DirAccumulator {
        name: root
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| root.to_string_lossy().to_string()),
        path: root.to_string_lossy().to_string(),
        ..Default::default()
    };
    let mut physical_seen = HashSet::new();

    for file in files {
        let physical_bytes = if physical_seen.insert(file.identity.clone()) {
            file.allocated_bytes
        } else {
            0
        };
        root_acc.logical_bytes = root_acc.logical_bytes.saturating_add(file.logical_bytes);
        root_acc.allocated_bytes = root_acc.allocated_bytes.saturating_add(physical_bytes);
        root_acc.reclaimable_bytes = root_acc.reclaimable_bytes.saturating_add(file.reclaimable_bytes);
        root_acc.file_count += 1;
        if file.reclaimable_bytes > 0 {
            root_acc.duplicate_file_count += 1;
        }

        let relative = Path::new(&file.relative_path);
        let parent = relative.parent().unwrap_or_else(|| Path::new(""));
        let mut cursor = &mut root_acc;
        let mut accumulated_path = root.to_path_buf();
        for component in parent.components() {
            let name = component.as_os_str().to_string_lossy().to_string();
            if name.is_empty() {
                continue;
            }
            accumulated_path.push(&name);
            cursor = cursor.children.entry(name.clone()).or_insert_with(|| DirAccumulator {
                name: name.clone(),
                path: accumulated_path.to_string_lossy().to_string(),
                ..Default::default()
            });
            cursor.logical_bytes = cursor.logical_bytes.saturating_add(file.logical_bytes);
            cursor.allocated_bytes = cursor.allocated_bytes.saturating_add(physical_bytes);
            cursor.reclaimable_bytes = cursor.reclaimable_bytes.saturating_add(file.reclaimable_bytes);
            cursor.file_count += 1;
            if file.reclaimable_bytes > 0 {
                cursor.duplicate_file_count += 1;
            }
        }
    }

    let mut hotspots = Vec::new();
    collect_hotspots(&root_acc, &mut hotspots);
    hotspots.sort_by_key(|h| std::cmp::Reverse((h.reclaimable_bytes, h.allocated_bytes)));
    hotspots.truncate(80);
    (to_node(root_acc, 0), hotspots)
}

fn collect_hotspots(node: &DirAccumulator, out: &mut Vec<DirectoryHotspot>) {
    if !node.path.is_empty() {
        out.push(DirectoryHotspot {
            path: node.path.clone(),
            logical_bytes: node.logical_bytes,
            allocated_bytes: node.allocated_bytes,
            reclaimable_bytes: node.reclaimable_bytes,
            file_count: node.file_count,
            duplicate_file_count: node.duplicate_file_count,
        });
    }
    for child in node.children.values() {
        collect_hotspots(child, out);
    }
}

fn to_node(mut acc: DirAccumulator, depth: usize) -> DirectoryNode {
    let mut children: Vec<DirAccumulator> = std::mem::take(&mut acc.children).into_values().collect();
    children.sort_by_key(|child| {
        std::cmp::Reverse((
            child.reclaimable_bytes,
            child.allocated_bytes,
            child.logical_bytes,
        ))
    });

    // Preserve the complete directory hierarchy in the evidence model.
    // Rendering limits belong in the UI; synthesizing "[other]" nodes here
    // makes path-scoped dedupe queries lossy and potentially misleading.
    let visible = children
        .into_iter()
        .map(|child| to_node(child, depth.saturating_add(1)))
        .collect();

    DirectoryNode {
        name: std::mem::take(&mut acc.name),
        path: std::mem::take(&mut acc.path),
        logical_bytes: acc.logical_bytes,
        allocated_bytes: acc.allocated_bytes,
        reclaimable_bytes: acc.reclaimable_bytes,
        file_count: acc.file_count,
        duplicate_file_count: acc.duplicate_file_count,
        children: visible,
    }
}

fn build_type_stats(files: &[FileRecord]) -> Vec<TypeStat> {
    let mut stats: HashMap<String, TypeStat> = HashMap::new();
    let mut physical_seen = HashSet::new();
    for file in files {
        let stat = stats.entry(file.extension.clone()).or_insert(TypeStat {
            extension: file.extension.clone(),
            logical_bytes: 0,
            allocated_bytes: 0,
            reclaimable_bytes: 0,
            file_count: 0,
        });
        stat.logical_bytes = stat.logical_bytes.saturating_add(file.logical_bytes);
        if physical_seen.insert(file.identity.clone()) {
            stat.allocated_bytes = stat.allocated_bytes.saturating_add(file.allocated_bytes);
        }
        stat.reclaimable_bytes = stat.reclaimable_bytes.saturating_add(file.reclaimable_bytes);
        stat.file_count += 1;
    }
    let mut values: Vec<_> = stats.into_values().collect();
    values.sort_by_key(|s| std::cmp::Reverse(s.allocated_bytes));
    values.truncate(40);
    values
}

fn build_large_files(files: &[FileRecord]) -> Vec<LargeFile> {
    const LARGE_THRESHOLD: u64 = 100 * 1024 * 1024;
    let stale_cutoff = SystemTime::now()
        .checked_sub(Duration::from_secs(365 * 24 * 60 * 60))
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let mut by_identity: HashMap<&str, Vec<&FileRecord>> = HashMap::new();
    for file in files.iter().filter(|file| file.allocated_bytes >= LARGE_THRESHOLD) {
        by_identity.entry(file.identity.as_str()).or_default().push(file);
    }

    let mut large: Vec<_> = by_identity
        .into_values()
        .filter_map(|mut paths| {
            paths.sort_by(|a, b| a.path.cmp(&b.path));
            let file = *paths.first()?;
            Some(LargeFile {
                path: file.path.clone(),
                allocated_bytes: file.allocated_bytes,
                logical_bytes: file.logical_bytes,
                modified_ms: file.modified_ms,
                stale: file.modified_ms > 0 && file.modified_ms < stale_cutoff,
                path_count: paths.len(),
            })
        })
        .collect();

    large.sort_by_key(|file| std::cmp::Reverse(file.allocated_bytes));
    large.truncate(80);
    large
}

fn build_bloat_signals(files: &[FileRecord]) -> Vec<BloatSignal> {
    #[derive(Default)]
    struct SignalAcc {
        allocated_bytes: u64,
        file_count: u64,
        samples: Vec<String>,
        identities: HashSet<String>,
    }

    let patterns: [(&str, &str, &[&str], &str); 4] = [
        (
            "dependencies",
            "Regenerable dependency trees",
            &["node_modules", ".venv", "venv", ".gradle", "vendor"],
            "medium",
        ),
        (
            "build-output",
            "Build and generated output",
            &["dist", "build", "target", "out", ".next", ".turbo"],
            "medium",
        ),
        (
            "cache-temp",
            "Caches and temporary data",
            &["cache", ".cache", "tmp", "temp", "__pycache__"],
            "medium",
        ),
        (
            "backup-archive",
            "Backup or archive concentrations",
            &["backup", "backups", "archive", "archives"],
            "low",
        ),
    ];

    let mut accs: HashMap<&str, SignalAcc> = HashMap::new();
    for file in files {
        let components: Vec<String> = Path::new(&file.path)
            .components()
            .map(|c| c.as_os_str().to_string_lossy().to_ascii_lowercase())
            .collect();
        for (kind, _, needles, _) in patterns {
            if needles.iter().any(|needle| components.iter().any(|part| part == needle)) {
                let acc = accs.entry(kind).or_default();
                if acc.identities.insert(file.identity.clone()) {
                    acc.allocated_bytes = acc.allocated_bytes.saturating_add(file.allocated_bytes);
                }
                acc.file_count += 1;
                if acc.samples.len() < 6 {
                    acc.samples.push(file.path.clone());
                }
            }
        }
    }

    let mut signals = Vec::new();
    for (kind, label, _, confidence) in patterns {
        if let Some(acc) = accs.remove(kind) {
            if acc.file_count > 0 {
                signals.push(BloatSignal {
                    kind: kind.into(),
                    label: label.into(),
                    allocated_bytes: acc.allocated_bytes,
                    file_count: acc.file_count,
                    sample_paths: acc.samples,
                    confidence: confidence.into(),
                });
            }
        }
    }
    signals.sort_by_key(|signal| std::cmp::Reverse(signal.allocated_bytes));
    signals
}


#[cfg(test)]
mod tests {
    use super::*;

    fn synthetic_file(path: &str, identity: &str, allocated_bytes: u64) -> FileRecord {
        FileRecord {
            path: path.into(),
            relative_path: path.into(),
            logical_bytes: allocated_bytes,
            allocated_bytes,
            modified_ms: 0,
            modified_ns: 0,
            identity: identity.into(),
            link_count: 2,
            extension: ".bin".into(),
            reclaimable_bytes: 0,
        }
    }

    #[test]
    fn large_files_count_one_physical_identity_once() {
        let large = 128 * 1024 * 1024;
        let files = vec![
            synthetic_file("a/large.bin", "same-physical-file", large),
            synthetic_file("b/alias.bin", "same-physical-file", large),
        ];

        let result = build_large_files(&files);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].allocated_bytes, large);
        assert_eq!(result[0].path_count, 2);
    }
}
