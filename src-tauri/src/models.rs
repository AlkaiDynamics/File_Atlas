use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRecord {
    pub path: String,
    pub relative_path: String,
    pub logical_bytes: u64,
    pub allocated_bytes: u64,
    pub modified_ms: u64,
    pub identity: String,
    pub link_count: u64,
    pub extension: String,
    pub reclaimable_bytes: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateMember {
    pub path: String,
    pub logical_bytes: u64,
    pub allocated_bytes: u64,
    pub identity: String,
    pub link_count: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
    pub hash: String,
    pub logical_bytes_each: u64,
    pub members: Vec<DuplicateMember>,
    pub physical_copies: usize,
    pub hardlink_aliases: usize,
    pub reclaimable_bytes: u64,
    pub keep_path: String,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryNode {
    pub name: String,
    pub path: String,
    pub logical_bytes: u64,
    pub allocated_bytes: u64,
    pub reclaimable_bytes: u64,
    pub file_count: u64,
    pub duplicate_file_count: u64,
    pub children: Vec<DirectoryNode>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryHotspot {
    pub path: String,
    pub logical_bytes: u64,
    pub allocated_bytes: u64,
    pub reclaimable_bytes: u64,
    pub file_count: u64,
    pub duplicate_file_count: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeStat {
    pub extension: String,
    pub logical_bytes: u64,
    pub allocated_bytes: u64,
    pub reclaimable_bytes: u64,
    pub file_count: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LargeFile {
    pub path: String,
    pub allocated_bytes: u64,
    pub logical_bytes: u64,
    pub modified_ms: u64,
    pub stale: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BloatSignal {
    pub kind: String,
    pub label: String,
    pub allocated_bytes: u64,
    pub file_count: u64,
    pub sample_paths: Vec<String>,
    pub confidence: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSummary {
    pub root: String,
    pub scanner_mode: String,
    pub files_scanned: usize,
    pub logical_bytes: u64,
    pub allocated_bytes: u64,
    pub reclaimable_bytes: u64,
    pub duplicate_groups: usize,
    pub duplicate_paths: usize,
    pub hardlink_aliases: usize,
    pub unreadable_entries: usize,
    pub elapsed_ms: u128,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub summary: ScanSummary,
    pub directory_tree: DirectoryNode,
    pub hotspots: Vec<DirectoryHotspot>,
    pub duplicates: Vec<DuplicateGroup>,
    pub types: Vec<TypeStat>,
    pub large_files: Vec<LargeFile>,
    pub signals: Vec<BloatSignal>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub phase: String,
    pub current: usize,
    pub total: Option<usize>,
    pub message: String,
}
