use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct CachedHashes {
    pub prehash: Option<String>,
    pub full_hash: Option<String>,
}

pub struct HashCache {
    conn: Mutex<Connection>,
}

impl HashCache {
    pub fn open() -> rusqlite::Result<Self> {
        let path = cache_path();
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS hash_cache (
                identity TEXT NOT NULL,
                size INTEGER NOT NULL,
                modified_ms INTEGER NOT NULL,
                prehash TEXT,
                full_hash TEXT,
                PRIMARY KEY(identity, size, modified_ms)
            );
            CREATE INDEX IF NOT EXISTS idx_hash_cache_lookup
            ON hash_cache(identity, size, modified_ms);",
        )?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    pub fn get(&self, identity: &str, size: u64, modified_ms: u64) -> Option<CachedHashes> {
        self.conn
            .lock()
            .query_row(
                "SELECT prehash, full_hash FROM hash_cache
                 WHERE identity = ?1 AND size = ?2 AND modified_ms = ?3",
                params![identity, size as i64, modified_ms as i64],
                |row| {
                    Ok(CachedHashes {
                        prehash: row.get(0)?,
                        full_hash: row.get(1)?,
                    })
                },
            )
            .optional()
            .ok()
            .flatten()
    }

    pub fn put_prehash(&self, identity: &str, size: u64, modified_ms: u64, prehash: &str) {
        let _ = self.conn.lock().execute(
            "INSERT INTO hash_cache(identity, size, modified_ms, prehash)
             VALUES(?1, ?2, ?3, ?4)
             ON CONFLICT(identity, size, modified_ms)
             DO UPDATE SET prehash = excluded.prehash",
            params![identity, size as i64, modified_ms as i64, prehash],
        );
    }

    pub fn put_full_hash(
        &self,
        identity: &str,
        size: u64,
        modified_ms: u64,
        prehash: &str,
        full_hash: &str,
    ) {
        let _ = self.conn.lock().execute(
            "INSERT INTO hash_cache(identity, size, modified_ms, prehash, full_hash)
             VALUES(?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(identity, size, modified_ms)
             DO UPDATE SET prehash = excluded.prehash, full_hash = excluded.full_hash",
            params![identity, size as i64, modified_ms as i64, prehash, full_hash],
        );
    }
}

fn cache_path() -> PathBuf {
    #[cfg(windows)]
    if let Ok(base) = std::env::var("LOCALAPPDATA") {
        return PathBuf::from(base).join("FileAtlas").join("hash-cache.sqlite3");
    }

    if let Ok(base) = std::env::var("XDG_CACHE_HOME") {
        return PathBuf::from(base).join("file-atlas").join("hash-cache.sqlite3");
    }
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home)
            .join(".cache")
            .join("file-atlas")
            .join("hash-cache.sqlite3");
    }
    std::env::temp_dir().join("file-atlas-hash-cache.sqlite3")
}
