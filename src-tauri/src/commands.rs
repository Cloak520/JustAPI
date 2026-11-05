use crate::http::{execute_request, HttpRequestPayload, HttpResponsePayload};
use crate::storage::{
    self, FullProjectData, HistoryItem, ProjectMetadata, SavedRequest, SubProjectMetadata,
};
use crate::swagger::{self, MergeStats};
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

/// 导入 Swagger/OpenAPI 并无损合并至指定子项目
#[command]
pub async fn import_swagger_to_subproject(
    project_path: String,
    dir_name: String,
    source: String,
    sync_project_base_url: Option<bool>,
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

    // 5. 更新子项目的 swagger_source_url 与 base_url (若原为空)
    let mut updated_config = sub.config.clone();
    updated_config.swagger_source_url = Some(source.clone());
    if updated_config.base_url.is_empty() {
        if let Some(ref b) = parsed.base_url {
            updated_config.base_url = b.clone();
        }
    }
    storage::save_subproject_config(&project_path, &dir_name, updated_config)?;

    // 6. 自动将 Swagger 解析出的 baseUrl 更新到主项目根目录的 .justapi/project.json 中
    if let Some(ref b) = parsed.base_url {
        let clean_base = b.trim();
        if !clean_base.is_empty() {
            let should_sync = sync_project_base_url.unwrap_or(true);
            let mut proj_config = project.config.clone();
            if should_sync || proj_config.base_url.is_empty() || proj_config.base_url == "https://httpbin.org" {
                proj_config.base_url = clean_base.to_string();
                storage::save_project_config(&project_path, proj_config)?;
            }
        }
    }

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
