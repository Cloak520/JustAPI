use crate::commands::AppServices;
use crate::domain::{CollectionSyncSource, ImportedCollection, MergeStats};
use crate::importer::merge::smart_merge;
use crate::importer::{fetch_raw_source, parse_json_or_yaml};
use crate::repository::WorkspaceRepository;
use std::sync::Arc;
use tauri::command;

/// 通用导入源读取：支持远程 HTTP(S) URL 与本地文件路径（避免前端 CORS 限制）
#[command]
pub async fn read_import_source(source: String) -> Result<String, String> {
    fetch_raw_source(&source).await
}

/// 将 JSON 或 YAML 文档解析为结构化 JSON Value（供外置集合导入插件复用）
#[command]
pub async fn parse_structured_document(raw_text: String) -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(move || parse_json_or_yaml(&raw_text))
        .await
        .map_err(|e| format!("调度错误: {}", e))?
}

/// 通用集合无损合并与落盘：接收任意集合导入插件产出的标准化 ImportedCollection 并执行 smart_merge
#[command]
pub async fn merge_and_save_collection(
    project_path: String,
    dir_name: String,
    collection: ImportedCollection,
    sync_source: Option<CollectionSyncSource>,
    services: tauri::State<'_, AppServices>,
) -> Result<MergeStats, String> {
    let repo = Arc::clone(&services.repository);
    tokio::task::spawn_blocking(move || {
        let project = repo.load_project(&project_path)?;
        let sub = project
            .sub_projects
            .iter()
            .find(|s| s.dir_name == dir_name)
            .ok_or_else(|| format!("未找到子项目目录: {}", dir_name))?;

        let merged = smart_merge(&sub.requests, collection.requests);

        for req in &merged.requests {
            let fname = req
                .file_name
                .clone()
                .unwrap_or_else(|| format!("{}.json", req.id));
            repo.save_request(&project_path, &dir_name, &fname, req.clone())?;
        }

        let mut updated_config = sub.config.clone();
        if let Some(sync) = sync_source {
            if sync.importer_id == "justapi.swagger" || collection.source_format == "openapi" {
                updated_config.swagger_source_url = Some(sync.source.clone());
            } else {
                updated_config.swagger_source_url = None;
            }
            updated_config.collection_source = Some(sync);
        }
        if updated_config.base_url.is_empty() {
            if let Some(ref b) = collection.base_url {
                updated_config.base_url = b.clone();
            }
        }
        repo.save_subproject_config(&project_path, &dir_name, updated_config)?;

        Ok(merged.stats)
    })
    .await
    .map_err(|e| format!("调度错误: {}", e))?
}
