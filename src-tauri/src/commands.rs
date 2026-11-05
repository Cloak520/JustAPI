use crate::http::{execute_request, HttpRequestPayload, HttpResponsePayload};
use tauri::command;

#[command]
pub fn ping() -> String {
    "Tauri 2.0 (Rust Core) 在线".to_string()
}

/// 执行 RESTful 请求
#[command]
pub async fn send_rest_request(payload: HttpRequestPayload) -> Result<HttpResponsePayload, String> {
    execute_request(payload).await
}

/// 基于 Rust 原生 serde_json 异步执行超高性能 JSON 格式化 (Pretty)
#[command]
pub async fn format_json_fast(raw: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let value: serde_json::Value = serde_json::from_str(&raw)
            .map_err(|e| format!("JSON 语法解析错误: {}", e))?;
        serde_json::to_string_pretty(&value)
            .map_err(|e| format!("格式化序列化失败: {}", e))
    })
    .await
    .map_err(|e| format!("线程调度错误: {}", e))?
}

/// 基于 Rust 原生 serde_json 异步执行超高性能 JSON 压缩 (Minify)
#[command]
pub async fn minify_json_fast(raw: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let value: serde_json::Value = serde_json::from_str(&raw)
            .map_err(|e| format!("JSON 语法解析错误: {}", e))?;
        serde_json::to_string(&value)
            .map_err(|e| format!("压缩序列化失败: {}", e))
    })
    .await
    .map_err(|e| format!("线程调度错误: {}", e))?
}
