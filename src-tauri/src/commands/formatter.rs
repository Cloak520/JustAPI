use crate::formatter;
use tauri::command;

#[command]
pub async fn format_json_fast(raw: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || formatter::format_json(&raw))
        .await
        .map_err(|e| format!("线程调度错误: {}", e))?
}

#[command]
pub async fn minify_json_fast(raw: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || formatter::minify_json(&raw))
        .await
        .map_err(|e| format!("线程调度错误: {}", e))?
}

