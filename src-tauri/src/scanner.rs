use crate::models::{FileRecord, ScanProgress};
use rayon::prelude::*;
use std::collections::HashMap;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use walkdir::WalkDir;

pub struct ScanInventory {
    pub files: Vec<FileRecord>,
    pub mode: String,
    pub unreadable: usize,
    pub warnings: Vec<String>,
}

pub fn collect_files<F>(root: &Path, progress: &F) -> Result<ScanInventory, String>
where
    F: Fn(ScanProgress) + Sync,
{
    if !root.exists() {
        return Err(format!("Scan root does not exist: {}", root.display()));
    }
    if !root.is_dir() {
        return Err(format!("Scan root is not a directory: {}", root.display()));
    }

    #[cfg(all(windows, feature = "mft-fast"))]
    {
        match collect_windows_mft(root, progress) {
            Ok(inventory) => return Ok(inventory),
            Err(err) => {
                progress(ScanProgress {
                    phase: "index".into(),
                    current: 0,
                    total: None,
                    message: format!("MFT fast path unavailable ({err}); using safe directory walk."),
                });
                let mut fallback = collect_walk(root, progress)?;
                fallback.warnings.push(format!(
                    "NTFS MFT fast path was unavailable, so File Atlas used recursive traversal instead: {err}"
                ));
                return Ok(fallback);
            }
        }
    }

    #[cfg(not(windows))]
    collect_walk(root, progress)
}

fn collect_walk<F>(root: &Path, progress: &F) -> Result<ScanInventory, String>
where
    F: Fn(ScanProgress) + Sync,
{
    progress(ScanProgress {
        phase: "index".into(),
        current: 0,
        total: None,
        message: "Enumerating filesystem".into(),
    });

    let mut paths = Vec::new();
    let mut unreadable = 0usize;
    let walker = WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| !skip_walk_entry(entry.path(), entry.file_type().is_dir()));
    for entry in walker {
        match entry {
            Ok(entry) => {
                if entry.file_type().is_file() {
                    paths.push(entry.into_path());
                    if paths.len() % 10_000 == 0 {
                        progress(ScanProgress {
                            phase: "index".into(),
                            current: paths.len(),
                            total: None,
                            message: format!("Indexed {} files", paths.len()),
                        });
                    }
                }
            }
            Err(_) => unreadable += 1,
        }
    }

    let total = paths.len();
    progress(ScanProgress {
        phase: "metadata".into(),
        current: 0,
        total: Some(total),
        message: "Reading file metadata".into(),
    });

    let records: Vec<_> = paths
        .par_iter()
        .filter_map(|path| metadata_record(root, path).ok())
        .collect();
    unreadable += total.saturating_sub(records.len());

    Ok(ScanInventory {
        files: records,
        mode: "walk".into(),
        unreadable,
        warnings: Vec::new(),
    })
}

fn skip_walk_entry(path: &Path, is_dir: bool) -> bool {
    if !is_dir {
        return false;
    }
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(_) => return false,
    };
    is_reparse_or_symlink(&metadata)
}

fn metadata_record(root: &Path, path: &Path) -> Result<FileRecord, std::io::Error> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.file_type().is_file() || is_reparse_or_symlink(&metadata) {
        return Err(std::io::Error::other("not a regular file"));
    }

    let logical_bytes = metadata.len();
    let modified_ns = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_nanos().min(u64::MAX as u128) as u64)
        .unwrap_or(0);
    let modified_ms = modified_ns / 1_000_000;
    let (identity, allocated_bytes, link_count) = physical_info(path, &metadata)?;
    let relative_path = path
        .strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string();
    let extension = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| format!(".{}", s.to_ascii_lowercase()))
        .unwrap_or_else(|| "[no extension]".into());

    Ok(FileRecord {
        path: path.to_string_lossy().to_string(),
        relative_path,
        logical_bytes,
        allocated_bytes,
        modified_ms,
        modified_ns,
        identity,
        link_count,
        extension,
        reclaimable_bytes: 0,
    })
}

#[cfg(unix)]
fn physical_info(path: &Path, metadata: &fs::Metadata) -> Result<(String, u64, u64), std::io::Error> {
    use std::os::unix::fs::MetadataExt;
    let identity = format!("{}:{}", metadata.dev(), metadata.ino());
    let allocated = metadata.blocks().saturating_mul(512);
    let links = metadata.nlink();
    let _ = path;
    Ok((identity, allocated, links))
}

#[cfg(windows)]
fn physical_info(path: &Path, metadata: &fs::Metadata) -> Result<(String, u64, u64), std::io::Error> {
    use std::fs::File;
    use std::mem::{size_of, zeroed};
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Foundation::HANDLE;
    use windows_sys::Win32::Storage::FileSystem::{
        GetFileInformationByHandle, GetFileInformationByHandleEx, BY_HANDLE_FILE_INFORMATION,
        FILE_STANDARD_INFO, FileStandardInfo,
    };

    let file = File::open(path)?;
    let handle = file.as_raw_handle() as HANDLE;
    let mut basic: BY_HANDLE_FILE_INFORMATION = unsafe { zeroed() };
    if unsafe { GetFileInformationByHandle(handle, &mut basic) } == 0 {
        return Err(std::io::Error::last_os_error());
    }
    let file_index = ((basic.nFileIndexHigh as u64) << 32) | basic.nFileIndexLow as u64;
    let identity = format!("{}:{}", basic.dwVolumeSerialNumber, file_index);

    let mut standard: FILE_STANDARD_INFO = unsafe { zeroed() };
    let allocated = if unsafe {
        GetFileInformationByHandleEx(
            handle,
            FileStandardInfo,
            &mut standard as *mut _ as *mut core::ffi::c_void,
            size_of::<FILE_STANDARD_INFO>() as u32,
        )
    } != 0
    {
        standard.AllocationSize.max(0) as u64
    } else {
        metadata.len()
    };
    Ok((identity, allocated, basic.nNumberOfLinks as u64))
}

#[cfg(not(any(unix, windows)))]
fn physical_info(path: &Path, metadata: &fs::Metadata) -> Result<(String, u64, u64), std::io::Error> {
    Ok((path.to_string_lossy().to_string(), metadata.len(), 1))
}

#[cfg(windows)]
fn is_reparse_or_symlink(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x00000400;
    metadata.file_type().is_symlink()
        || (metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT) != 0
}

#[cfg(not(windows))]
fn is_reparse_or_symlink(metadata: &fs::Metadata) -> bool {
    metadata.file_type().is_symlink()
}

#[cfg(all(windows, feature = "mft-fast"))]
#[derive(Clone)]
struct MftNode {
    parent_fid: u64,
    name: OsString,
    is_dir: bool,
}

#[cfg(all(windows, feature = "mft-fast"))]
fn collect_windows_mft<F>(root: &Path, progress: &F) -> Result<ScanInventory, String>
where
    F: Fn(ScanProgress) + Sync,
{
    use usn_journal_rs::volume::Volume;

    let root_text = root.to_string_lossy();
    let bytes = root_text.as_bytes();
    if bytes.len() < 2 || bytes[1] != b':' || !bytes[0].is_ascii_alphabetic() {
        return Err("selected path is not on a drive-letter volume".into());
    }
    let drive = bytes[0] as char;
    progress(ScanProgress {
        phase: "index".into(),
        current: 0,
        total: None,
        message: format!("Reading {drive}: NTFS Master File Table"),
    });

    let volume = Volume::from_drive_letter(drive).map_err(|e| e.to_string())?;
    let mft = volume.mft();
    let mut nodes: HashMap<u64, MftNode> = HashMap::new();
    let mut unreadable = 0usize;
    for (index, item) in mft.iter().enumerate() {
        match item {
            Ok(entry) => {
                nodes.insert(
                    entry.fid,
                    MftNode {
                        parent_fid: entry.parent_fid,
                        name: entry.file_name,
                        is_dir: entry.is_dir(),
                    },
                );
                if index > 0 && index % 100_000 == 0 {
                    progress(ScanProgress {
                        phase: "index".into(),
                        current: index,
                        total: None,
                        message: format!("Read {index} MFT records"),
                    });
                }
            }
            Err(_) => unreadable += 1,
        }
    }

    let root_norm = normalize_windows_path(root);
    let drive_root = PathBuf::from(format!("{}:\\", drive.to_ascii_uppercase()));
    let file_ids: Vec<u64> = nodes
        .iter()
        .filter_map(|(fid, node)| (!node.is_dir).then_some(*fid))
        .collect();
    let paths: Vec<PathBuf> = file_ids
        .par_iter()
        .filter_map(|fid| resolve_mft_path(*fid, &nodes, &drive_root))
        .filter(|path| is_within_windows_root(path, &root_norm))
        .collect();

    let total = paths.len();
    progress(ScanProgress {
        phase: "metadata".into(),
        current: 0,
        total: Some(total),
        message: format!("Resolving metadata for {total} indexed files"),
    });
    let records: Vec<FileRecord> = paths
        .par_iter()
        .filter_map(|path| metadata_record(root, path).ok())
        .collect();
    unreadable += total.saturating_sub(records.len());

    Ok(ScanInventory {
        files: records,
        mode: "ntfs-mft".into(),
        unreadable,
        warnings: Vec::new(),
    })
}

#[cfg(all(windows, feature = "mft-fast"))]
fn resolve_mft_path(fid: u64, nodes: &HashMap<u64, MftNode>, drive_root: &Path) -> Option<PathBuf> {
    let mut current = fid;
    let mut parts: Vec<OsString> = Vec::new();
    for _ in 0..1024 {
        if current == 5 {
            break;
        }
        let node = nodes.get(&current)?;
        if node.name != "." && !node.name.is_empty() {
            parts.push(node.name.clone());
        }
        if node.parent_fid == current {
            break;
        }
        current = node.parent_fid;
    }
    parts.reverse();
    let mut path = drive_root.to_path_buf();
    for part in parts {
        path.push(part);
    }
    Some(path)
}

#[cfg(all(windows, feature = "mft-fast"))]
fn normalize_windows_path(path: &Path) -> String {
    path.to_string_lossy().replace('/', "\\").to_ascii_lowercase()
}

#[cfg(all(windows, feature = "mft-fast"))]
fn is_within_windows_root(path: &Path, normalized_root: &str) -> bool {
    let path = normalize_windows_path(path);
    let root = normalized_root.trim_end_matches('\\');
    path == root || path.starts_with(&format!("{root}\\"))
}
