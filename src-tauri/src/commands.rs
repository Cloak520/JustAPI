use crate::http::{execute_request, HttpRequestPayload, HttpResponsePayload};
use crate::storage::{
    self, FullProjectData, HistoryItem, ProjectMetadata, SavedRequest, SubProjectMetadata,
};
use crate::swagger::{self, MergeStats};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::command;
use tokio::task::AbortHandle;

#[derive(Default)]
pub struct RequestManager {
    handles: Mutex<HashMap<String, AbortHandle>>,
}

#[command]
pub fn ping() -> String {
    "Tauri 2.0 (Rust Core) 在线".to_string()
}

/// 执行 RESTful 请求 (接入 Tokio 异步任务与 AbortHandle，支持中途取消)
#[command]
pub async fn send_rest_request(
    request_id: String,
    payload: HttpRequestPayload,
    manager: tauri::State<'_, RequestManager>,
) -> Result<HttpResponsePayload, String> {
    let task = tokio::spawn(async move {
        execute_request(payload).await
    });

    {
        let mut map = manager.handles.lock().unwrap();
        map.insert(request_id.clone(), task.abort_handle());
    }

    let res = task.await;

    {
        let mut map = manager.handles.lock().unwrap();
        map.remove(&request_id);
    }

    match res {
        Ok(inner_res) => inner_res,
        Err(join_err) => {
            if join_err.is_cancelled() {
                Err("请求已由用户手动取消 (Request Cancelled)".to_string())
            } else {
                Err(format!("任务执行异常: {}", join_err))
            }
        }
    }
}

/// 手动取消正在进行中的 RESTful 请求
#[command]
pub fn cancel_rest_request(
    request_id: String,
    manager: tauri::State<'_, RequestManager>,
) -> bool {
    let mut map = manager.handles.lock().unwrap();
    if let Some(handle) = map.remove(&request_id) {
        handle.abort();
        true
    } else {
        false
    }
}

/// 原生文件选择对话框，选择上传文件
#[command]
pub async fn pick_file() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(|| {
        let file = rfd::FileDialog::new()
            .set_title("选择上传文件")
            .pick_file();
        Ok(file.map(|p| p.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| format!("文件对话框调度错误: {}", e))?
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

/// 删除单条历史记录
#[command]
pub async fn delete_history_item(project_path: String, item_id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || storage::delete_history_item(&project_path, &item_id))
        .await
        .map_err(|e| format!("调度错误: {}", e))?
}

/// 导入 Swagger/OpenAPI 并无损合并至指定子项目
#[command]
pub async fn import_swagger_to_subproject(
    project_path: String,
    dir_name: String,
    source: String,
    _sync_project_base_url: Option<bool>,
) -> Result<MergeStats, String> {
    // 1. 获取并解析 Swagger
    let parsed = swagger::fetch_and_parse_swagger(&source).await?;

    // 2. 读取该子项目现有的所有接口
    let project = storage::load_project_from_dir(&project_path)?;
    let sub = project
        .sub_projects
        .iter()
        .find(|s| s.dir_name == dir_name)
        .ok_or_else(|| format!("未找到子项目目录: {}", dir_name))?;

    // 3. 执行 Smart Merge
    let merged = swagger::smart_merge(&sub.requests, parsed.requests);

    // 4. 将合并后的请求写回磁盘
    for req in &merged.requests {
        let fname = req.file_name.clone().unwrap_or_else(|| format!("{}.json", req.id));
        storage::save_request_file(&project_path, &dir_name, &fname, req.clone())?;
    }

    // 5. 更新子项目的 swagger_source_url 与 base_url (若子项目原 base_url 为空)
    let mut updated_config = sub.config.clone();
    updated_config.swagger_source_url = Some(source.clone());
    if updated_config.base_url.is_empty() {
        if let Some(ref b) = parsed.base_url {
            updated_config.base_url = b.clone();
        }
    }
    storage::save_subproject_config(&project_path, &dir_name, updated_config)?;

    // 注：导入 Swagger 时无需修改主项目根目录 project.json 的 BaseURL，保持主项目 BaseURL 独立稳定

    Ok(merged.stats)
}

/// 一键无损刷新子项目的 Swagger API
#[command]
pub async fn refresh_swagger_subproject(
    project_path: String,
    dir_name: String,
) -> Result<MergeStats, String> {
    let project = storage::load_project_from_dir(&project_path)?;
    let sub = project
        .sub_projects
        .iter()
        .find(|s| s.dir_name == dir_name)
        .ok_or_else(|| format!("未找到子项目目录: {}", dir_name))?;

    let source = sub
        .config
        .swagger_source_url
        .as_ref()
        .ok_or_else(|| "该子项目未绑定 Swagger Source URL，请先执行导入".to_string())?
        .clone();

    import_swagger_to_subproject(project_path, dir_name, source, Some(false)).await
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

/// 打开系统原生保存文件对话框，将响应内容另存为本地文件
#[command]
pub async fn save_response_to_file(
    default_filename: String,
    content: Option<String>,
    use_raw_bytes: Option<bool>,
) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
        let mut dialog = rfd::FileDialog::new().set_title("另存为本地文件");

        let default_name = default_filename.trim();
        if !default_name.is_empty() {
            dialog = dialog.set_file_name(default_name);
        }

        if let Some(path) = dialog.save_file() {
            let bytes_to_write = if use_raw_bytes.unwrap_or(false) {
                if let Ok(lock) = crate::http::LAST_RESPONSE_BYTES.lock() {
                    lock.clone().unwrap_or_else(|| {
                        content.as_ref().map(|s| s.as_bytes().to_vec()).unwrap_or_default()
                    })
                } else {
                    content.as_ref().map(|s| s.as_bytes().to_vec()).unwrap_or_default()
                }
            } else {
                content.as_ref().map(|s| s.as_bytes().to_vec()).unwrap_or_default()
            };

            std::fs::write(&path, &bytes_to_write)
                .map_err(|e| format!("保存文件失败: {}", e))?;
            Ok(Some(path.to_string_lossy().to_string()))
        } else {
            Ok(None)
        }
    })
    .await
    .map_err(|e| format!("调度错误: {}", e))?
}
