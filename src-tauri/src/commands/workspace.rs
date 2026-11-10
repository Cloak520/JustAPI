use crate::commands::AppServices;
use crate::domain::{
    FullProjectData, HistoryItem, ProjectMetadata, SavedRequest, SubProjectMetadata,
};
use crate::repository::{self, WorkspaceRepository};
use std::sync::Arc;
use tauri::command;

#[command]
pub async fn pick_project_folder() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(repository::pick_folder)
        .await
        .map_err(|e| format!("文件对话框调度错误: {}", e))?
}

#[command]
pub async fn load_project_from_dir(
    path: String,
    services: tauri::State<'_, AppServices>,
) -> Result<FullProjectData, String> {
    let repo = Arc::clone(&services.repository);
    tokio::task::spawn_blocking(move || repo.load_project(&path))
        .await
        .map_err(|e| format!("调度错误: {}", e))?
}

#[command]
pub async fn save_project_config(
    path: String,
    config: ProjectMetadata,
    services: tauri::State<'_, AppServices>,
) -> Result<(), String> {
    let repo = Arc::clone(&services.repository);
    tokio::task::spawn_blocking(move || repo.save_project_config(&path, config))
        .await
        .map_err(|e| format!("调度错误: {}", e))?
}

#[command]
pub async fn create_subproject(
    project_path: String,
    dir_name: String,
    config: SubProjectMetadata,
    services: tauri::State<'_, AppServices>,
) -> Result<(), String> {
    let repo = Arc::clone(&services.repository);
    tokio::task::spawn_blocking(move || repo.create_subproject(&project_path, &dir_name, config))
        .await
        .map_err(|e| format!("调度错误: {}", e))?
}

#[command]
pub async fn save_subproject_config(
    project_path: String,
    dir_name: String,
    config: SubProjectMetadata,
    services: tauri::State<'_, AppServices>,
) -> Result<(), String> {
    let repo = Arc::clone(&services.repository);
    tokio::task::spawn_blocking(move || {
        repo.save_subproject_config(&project_path, &dir_name, config)
    })
    .await
    .map_err(|e| format!("调度错误: {}", e))?
}

#[command]
pub async fn delete_subproject(
    project_path: String,
    dir_name: String,
    services: tauri::State<'_, AppServices>,
) -> Result<(), String> {
    let repo = Arc::clone(&services.repository);
    tokio::task::spawn_blocking(move || repo.delete_subproject(&project_path, &dir_name))
        .await
        .map_err(|e| format!("调度错误: {}", e))?
}

#[command]
pub async fn save_request_file(
    project_path: String,
    dir_name: String,
    file_name: String,
    request: SavedRequest,
    services: tauri::State<'_, AppServices>,
) -> Result<(), String> {
    let repo = Arc::clone(&services.repository);
    tokio::task::spawn_blocking(move || {
        repo.save_request(&project_path, &dir_name, &file_name, request)
    })
    .await
    .map_err(|e| format!("调度错误: {}", e))?
}

#[command]
pub async fn delete_request_file(
    project_path: String,
    dir_name: String,
    file_name: String,
    services: tauri::State<'_, AppServices>,
) -> Result<(), String> {
    let repo = Arc::clone(&services.repository);
    tokio::task::spawn_blocking(move || repo.delete_request(&project_path, &dir_name, &file_name))
        .await
        .map_err(|e| format!("调度错误: {}", e))?
}

#[command]
pub async fn record_history(
    project_path: String,
    item: HistoryItem,
    services: tauri::State<'_, AppServices>,
) -> Result<(), String> {
    let repo = Arc::clone(&services.repository);
    tokio::task::spawn_blocking(move || repo.append_history(&project_path, item))
        .await
        .map_err(|e| format!("调度错误: {}", e))?
}

#[command]
pub async fn clear_history(
    project_path: String,
    services: tauri::State<'_, AppServices>,
) -> Result<(), String> {
    let repo = Arc::clone(&services.repository);
    tokio::task::spawn_blocking(move || repo.clear_history(&project_path))
        .await
        .map_err(|e| format!("调度错误: {}", e))?
}

#[command]
pub async fn delete_history_item(
    project_path: String,
    item_id: String,
    services: tauri::State<'_, AppServices>,
) -> Result<(), String> {
    let repo = Arc::clone(&services.repository);
    tokio::task::spawn_blocking(move || repo.delete_history_item(&project_path, &item_id))
        .await
        .map_err(|e| format!("调度错误: {}", e))?
}
