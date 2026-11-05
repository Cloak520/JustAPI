use crate::http::{execute_request, HttpRequestPayload, HttpResponsePayload};
use crate::storage::{
    self, FullProjectData, HistoryItem, ProjectMetadata, SavedRequest, SubProjectMetadata,
};
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

/// 原生文件选择对话框，选择主项目目录
#[command]
pub async fn pick_project_folder() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(storage::pick_folder)
        .await
        .map_err(|e| format!("文件对话框调度错误: {}", e))?
}

/// 加载并初始化主项目目录树
#[command]
pub async fn load_project_from_dir(path: String) -> Result<FullProjectData, String> {
    tokio::task::spawn_blocking(move || storage::load_project_from_dir(&path))
        .await
        .map_err(|e| format!("调度错误: {}", e))?
}

/// 保存主项目配置
#[command]
pub async fn save_project_config(path: String, config: ProjectMetadata) -> Result<(), String> {
    tokio::task::spawn_blocking(move || storage::save_project_config(&path, config))
        .await
        .map_err(|e| format!("调度错误: {}", e))?
}

/// 创建新子项目
#[command]
pub async fn create_subproject(
    project_path: String,
    dir_name: String,
    config: SubProjectMetadata,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || storage::create_subproject(&project_path, &dir_name, config))
        .await
        .map_err(|e| format!("调度错误: {}", e))?
}

/// 保存子项目配置
#[command]
pub async fn save_subproject_config(
    project_path: String,
    dir_name: String,
    config: SubProjectMetadata,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || storage::save_subproject_config(&project_path, &dir_name, config))
        .await
        .map_err(|e| format!("调度错误: {}", e))?
}

/// 删除子项目目录
#[command]
pub async fn delete_subproject(project_path: String, dir_name: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || storage::delete_subproject(&project_path, &dir_name))
        .await
        .map_err(|e| format!("调度错误: {}", e))?
}

/// 保存单个请求到指定子项目
#[command]
pub async fn save_request_file(
    project_path: String,
    dir_name: String,
    file_name: String,
    request: SavedRequest,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        storage::save_request_file(&project_path, &dir_name, &file_name, request)
    })
    .await
    .map_err(|e| format!("调度错误: {}", e))?
}

/// 删除单个请求文件
#[command]
pub async fn delete_request_file(
    project_path: String,
    dir_name: String,
    file_name: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || storage::delete_request_file(&project_path, &dir_name, &file_name))
        .await
        .map_err(|e| format!("调度错误: {}", e))?
}

/// 追加一条历史记录
#[command]
pub async fn record_history(project_path: String, item: HistoryItem) -> Result<(), String> {
    tokio::task::spawn_blocking(move || storage::append_history(&project_path, item))
        .await
        .map_err(|e| format!("调度错误: {}", e))?
}

/// 清空历史记录
#[command]
pub async fn clear_history(project_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || storage::clear_history(&project_path))
        .await
        .map_err(|e| format!("调度错误: {}", e))?
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
