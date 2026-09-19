use crate::cache::HashCache;
use crate::models::{DuplicateGroup, DuplicateMember, FileRecord, ScanProgress};
use crate::scanner::current_file_state;
use rayon::prelude::*;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::time::UNIX_EPOCH;

const PREHASH_CHUNK: usize = 64 * 1024;
const FULL_HASH_CHUNK: usize = 1024 * 1024;
const VERIFY_CHUNK: usize = 1024 * 1024;

pub fn find_exact_duplicates<F>(
    files: &mut [FileRecord],
    cache: &HashCache,
    progress: &F,
) -> Vec<DuplicateGroup>
where
    F: Fn(ScanProgress) + Sync,
{
    // Hash each physical file identity once. Hardlink aliases are expanded back
    // into evidence only after redundant physical copies have been verified.
    let mut identity_members: HashMap<String, Vec<usize>> = HashMap::new();
    for (idx, file) in files.iter().enumerate() {
        identity_members.entry(file.identity.clone()).or_default().push(idx);
    }
    let representatives: Vec<usize> = identity_members
        .values()
        .filter_map(|members| members.first().copied())
        .collect();

    let mut by_size: HashMap<u64, Vec<usize>> = HashMap::new();
    for idx in representatives {
        let file = &files[idx];
        if file.logical_bytes > 0 {
            by_size.entry(file.logical_bytes).or_default().push(idx);
        }
    }
    let candidate_indices: Vec<usize> = by_size
        .values()
        .filter(|indices| indices.len() > 1)
        .flat_map(|indices| indices.iter().copied())
        .collect();

    progress(ScanProgress {
        phase: "prehash".into(),
        current: 0,
        total: Some(candidate_indices.len()),
        message: format!(
            "Prehashing {} size-matched physical files",
            candidate_indices.len()
        ),
    });

    let prehashed: Vec<(usize, String)> = candidate_indices
        .par_iter()
        .filter_map(|idx| {
            let file = &files[*idx];
            if !record_is_current(file) {
                return None;
            }
            let cached = cache.get(
                &file.identity,
                file.logical_bytes,
                file.modified_ns,
                file.change_stamp,
            );
            if let Some(prehash) = cached.and_then(|entry| entry.prehash) {
                return record_is_current(file).then_some((*idx, prehash));
            }
            let prehash = prehash_file(Path::new(&file.path), file.logical_bytes).ok()?;
            if !record_is_current(file) {
                return None;
            }
            cache.put_prehash(
                &file.identity,
                file.logical_bytes,
                file.modified_ns,
                file.change_stamp,
                &prehash,
            );
            Some((*idx, prehash))
        })
        .collect();

    let mut by_prehash: HashMap<(u64, String), Vec<usize>> = HashMap::new();
    for (idx, prehash) in prehashed {
        by_prehash
            .entry((files[idx].logical_bytes, prehash))
            .or_default()
            .push(idx);
    }
    let full_candidates: Vec<(usize, String)> = by_prehash
        .into_iter()
        .filter(|(_, indices)| indices.len() > 1)
        .flat_map(|((_, prehash), indices)| {
            indices
                .into_iter()
                .map(move |idx| (idx, prehash.clone()))
        })
        .collect();

    progress(ScanProgress {
        phase: "hash".into(),
        current: 0,
        total: Some(full_candidates.len()),
        message: format!(
            "Cryptographically hashing {} candidates",
            full_candidates.len()
        ),
    });

    let full_hashed: Vec<(usize, String)> = full_candidates
        .par_iter()
        .filter_map(|(idx, prehash)| {
            let file = &files[*idx];
            if !record_is_current(file) {
                return None;
            }
            if let Some(full_hash) = cache
                .get(&file.identity, file.logical_bytes, file.modified_ns)
                .and_then(|entry| entry.full_hash)
            {
                return record_is_current(file).then_some((*idx, full_hash));
            }
            let full_hash = full_hash_file(Path::new(&file.path)).ok()?;
            if !record_is_current(file) {
                return None;
            }
            cache.put_full_hash(
                &file.identity,
                file.logical_bytes,
                file.modified_ns,
                file.change_stamp,
                prehash,
                &full_hash,
            );
            Some((*idx, full_hash))
        })
        .collect();

    let mut by_hash: HashMap<String, Vec<usize>> = HashMap::new();
    for (idx, hash) in full_hashed {
        by_hash.entry(hash).or_default().push(idx);
    }

    progress(ScanProgress {
        phase: "verify".into(),
        current: 0,
        total: None,
        message: "Byte-verifying cryptographic matches".into(),
    });

    let mut groups = Vec::new();
    for (hash, representatives) in by_hash
        .into_iter()
        .filter(|(_, indices)| indices.len() > 1)
    {
        for physical_bucket in split_by_byte_identity(&representatives, files) {
            if physical_bucket.len() < 2 {
                continue;
            }

            let expanded: Vec<usize> = physical_bucket
                .iter()
                .flat_map(|idx| {
                    identity_members
                        .get(&files[*idx].identity)
                        .into_iter()
                        .flatten()
                        .copied()
                })
                .collect();

            let group = build_group(hash.clone(), &expanded, files);
            mark_reclaimable(&group, files);
            groups.push(group);
        }
    }
    groups.sort_by_key(|group| std::cmp::Reverse(group.reclaimable_bytes));
    groups
}

fn prehash_file(path: &Path, size: u64) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = blake3::Hasher::new();
    hasher.update(&size.to_le_bytes());

    let head_len = usize::try_from(size.min(PREHASH_CHUNK as u64)).unwrap_or(PREHASH_CHUNK);
    let mut head = vec![0u8; head_len];
    if head_len > 0 {
        file.read_exact(&mut head)?;
        hasher.update(&head);
    }

    if size > PREHASH_CHUNK as u64 {
        let tail_len = usize::try_from(size.min(PREHASH_CHUNK as u64)).unwrap_or(PREHASH_CHUNK);
        file.seek(SeekFrom::End(-(tail_len as i64)))?;
        let mut tail = vec![0u8; tail_len];
        file.read_exact(&mut tail)?;
        hasher.update(&tail);
    }
    Ok(hasher.finalize().to_hex().to_string())
}

fn full_hash_file(path: &Path) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = blake3::Hasher::new();
    let mut buffer = vec![0u8; FULL_HASH_CHUNK];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher.finalize().to_hex().to_string())
}

fn split_by_byte_identity(indices: &[usize], files: &[FileRecord]) -> Vec<Vec<usize>> {
    let mut buckets: Vec<Vec<usize>> = Vec::new();
    'outer: for idx in indices {
        if !record_is_current(&files[*idx]) {
            continue;
        }
        for bucket in &mut buckets {
            let anchor = bucket[0];
            if !record_is_current(&files[anchor]) {
                continue;
            }
            if files_equal(
                Path::new(&files[anchor].path),
                Path::new(&files[*idx].path),
            )
            .unwrap_or(false)
                && record_is_current(&files[anchor])
                && record_is_current(&files[*idx])
            {
                bucket.push(*idx);
                continue 'outer;
            }
        }
        buckets.push(vec![*idx]);
    }
    buckets
}

fn files_equal(left: &Path, right: &Path) -> std::io::Result<bool> {
    let left_before = file_stamp(left)?;
    let right_before = file_stamp(right)?;
    if left_before.0 != right_before.0 {
        return Ok(false);
    }

    let mut a = File::open(left)?;
    let mut b = File::open(right)?;
    let mut ba = vec![0u8; VERIFY_CHUNK];
    let mut bb = vec![0u8; VERIFY_CHUNK];
    let equal = loop {
        let ra = a.read(&mut ba)?;
        let rb = b.read(&mut bb)?;
        if ra != rb {
            break false;
        }
        if ra == 0 {
            break true;
        }
        if ba[..ra] != bb[..rb] {
            break false;
        }
    };

    if !equal {
        return Ok(false);
    }

    // A file that changed while verification was in progress is not evidence.
    let left_after = file_stamp(left)?;
    let right_after = file_stamp(right)?;
    Ok(left_before == left_after && right_before == right_after)
}

fn record_is_current(file: &FileRecord) -> bool {
    current_file_state(Path::new(&file.path))
        .map(|(size, modified_ns, change_stamp, identity)| {
            size == file.logical_bytes
                && modified_ns == file.modified_ns
                && change_stamp == file.change_stamp
                && identity == file.identity
        })
        .unwrap_or(false)
}

fn file_stamp(path: &Path) -> std::io::Result<(u64, u64)> {
    let metadata = fs::metadata(path)?;
    let modified_ns = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_nanos().min(u64::MAX as u128) as u64)
        .unwrap_or(0);
    Ok((metadata.len(), modified_ns))
}

fn build_group(hash: String, indices: &[usize], files: &[FileRecord]) -> DuplicateGroup {
    let members: Vec<DuplicateMember> = indices
        .iter()
        .map(|idx| {
            let file = &files[*idx];
            DuplicateMember {
                path: file.path.clone(),
                logical_bytes: file.logical_bytes,
                allocated_bytes: file.allocated_bytes,
                identity: file.identity.clone(),
                link_count: file.link_count,
            }
        })
        .collect();

    let mut physical: HashMap<String, (u64, String)> = HashMap::new();
    for member in &members {
        physical
            .entry(member.identity.clone())
            .or_insert((member.allocated_bytes, member.path.clone()));
    }
    let physical_copies = physical.len();
    let hardlink_aliases = members.len().saturating_sub(physical_copies);
    let mut physical_values: Vec<(String, u64, String)> = physical
        .into_iter()
        .map(|(identity, (allocated, path))| (identity, allocated, path))
        .collect();
    physical_values.sort_by_key(|(_, allocated, path)| (*allocated, path.clone()));

    let keep_path = physical_values
        .first()
        .map(|(_, _, path)| path.clone())
        .unwrap_or_default();
    let reclaimable_bytes = physical_values
        .iter()
        .skip(1)
        .map(|(_, bytes, _)| *bytes)
        .sum();

    DuplicateGroup {
        hash,
        logical_bytes_each: members.first().map(|m| m.logical_bytes).unwrap_or(0),
        members,
        physical_copies,
        hardlink_aliases,
        reclaimable_bytes,
        keep_path,
    }
}

fn mark_reclaimable(group: &DuplicateGroup, files: &mut [FileRecord]) {
    let keep_identity = group
        .members
        .iter()
        .find(|member| member.path == group.keep_path)
        .map(|member| member.identity.as_str());

    let mut redundant: HashMap<String, Vec<&DuplicateMember>> = HashMap::new();
    for member in &group.members {
        if Some(member.identity.as_str()) != keep_identity {
            redundant
                .entry(member.identity.clone())
                .or_default()
                .push(member);
        }
    }

    for members in redundant.values_mut() {
        members.sort_by(|a, b| a.path.cmp(&b.path));
        let allocated = members
            .first()
            .map(|member| member.allocated_bytes)
            .unwrap_or(0);
        let count = members.len() as u64;
        if count == 0 {
            continue;
        }

        // A hardlinked physical copy is reclaimable only when its aliases are
        // collectively resolved. Split its visual attribution across aliases so
        // directory WASTE totals remain additive without pretending one alias
        // alone would free the entire allocation.
        let base = allocated / count;
        let remainder = allocated % count;
        for (index, member) in members.iter().enumerate() {
            if let Some(file) = files.iter_mut().find(|file| file.path == member.path) {
                file.reclaimable_bytes =
                    base + u64::from((index as u64) < remainder);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn record(path: &Path, identity: &str) -> FileRecord {
        let metadata = fs::metadata(path).unwrap();
        let modified_ns = metadata
            .modified()
            .unwrap()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos() as u64;
        FileRecord {
            path: path.to_string_lossy().to_string(),
            relative_path: path.file_name().unwrap().to_string_lossy().to_string(),
            logical_bytes: metadata.len(),
            allocated_bytes: metadata.len(),
            modified_ms: modified_ns / 1_000_000,
            modified_ns,
            change_stamp: 0,
            identity: identity.into(),
            link_count: 1,
            extension: ".bin".into(),
            reclaimable_bytes: 0,
        }
    }

    #[test]
    fn final_byte_verifier_splits_non_identical_files_even_inside_same_candidate_bucket() {
        let dir = tempdir().unwrap();
        let a = dir.path().join("a.bin");
        let b = dir.path().join("b.bin");
        let c = dir.path().join("c.bin");
        fs::write(&a, b"same").unwrap();
        fs::write(&b, b"same").unwrap();
        fs::write(&c, b"diff").unwrap();
        let files = vec![record(&a, "a"), record(&b, "b"), record(&c, "c")];
        let buckets = split_by_byte_identity(&[0, 1, 2], &files);
        assert_eq!(buckets.len(), 2);
        assert!(buckets.iter().any(|bucket| bucket.len() == 2));
    }

    #[test]
    fn verifier_rejects_size_mismatch() {
        let dir = tempdir().unwrap();
        let a = dir.path().join("a.bin");
        let b = dir.path().join("b.bin");
        fs::write(&a, b"1234").unwrap();
        fs::write(&b, b"12345").unwrap();
        assert!(!files_equal(&a, &b).unwrap());
    }
}
