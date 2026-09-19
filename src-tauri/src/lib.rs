mod cache;
mod duplicates;
mod engine;
mod models;
mod scanner;
#[cfg(test)]
mod regression_tests;

use models::{ScanProgress, ScanReport};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

#[tauri::command]
async fn scan_path(app: AppHandle, path: String) -> Result<ScanReport, String> {
    let scan_path = PathBuf::from(path);
    let progress_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        engine::scan_root(&scan_path, |progress: ScanProgress| {
            let _ = progress_app.emit("scan-progress", progress);
        })
    })
    .await
    .map_err(|e| format!("Scan worker failed: {e}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![scan_path])
        .run(tauri::generate_context!())
        .expect("error while running File Atlas");
}
