use crate::plugins::{
    discover_all_plugins_with_bundled, ensure_plugins_dir, open_folder_in_os,
    read_bundled_plugin_assets, read_plugin_assets_from_root, remove_plugin_from_root,
    resolve_dev_bundled_plugins_dir, resolve_global_plugins_dir, resolve_project_plugins_dir,
    resolve_scope_plugins_dir, scaffold_example_plugin, ExternalPluginAssets,
    ExternalPluginsDiscoveryResult,
};
use tauri::command;

#[command]
pub async fn discover_external_plugins(
    project_path: Option<String>,
) -> Result<ExternalPluginsDiscoveryResult, String> {
    tokio::task::spawn_blocking(move || {
        let global_dir = resolve_global_plugins_dir();
        let project_dir = project_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(resolve_project_plugins_dir);
        let dev_bundled_dir = resolve_dev_bundled_plugins_dir();

        discover_all_plugins_with_bundled(
            global_dir.as_deref(),
            project_dir.as_deref(),
            dev_bundled_dir.as_deref(),
            true,
        )
    })
    .await
    .map_err(|e| format!("调度错误: {}", e))
}

#[command]
pub async fn read_external_plugin_assets(
    scope: String,
    dir_name: String,
    project_path: Option<String>,
) -> Result<ExternalPluginAssets, String> {
    tokio::task::spawn_blocking(move || {
        if scope == "bundled" {
            if let Some(dev_dir) = resolve_dev_bundled_plugins_dir() {
                if dev_dir.join(&dir_name).exists() {
                    return read_plugin_assets_from_root(&scope, &dev_dir, &dir_name);
                }
            }
            return read_bundled_plugin_assets(&dir_name);
        }

        let root = resolve_scope_plugins_dir(&scope, project_path.as_deref())?;
        read_plugin_assets_from_root(&scope, &root, &dir_name)
    })
    .await
    .map_err(|e| format!("调度错误: {}", e))?
}

#[command]
pub async fn open_external_plugins_dir(
    scope: String,
    project_path: Option<String>,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let root = resolve_scope_plugins_dir(&scope, project_path.as_deref())?;
        let dir = ensure_plugins_dir(&root)?;
        open_folder_in_os(&dir)?;
        Ok(dir.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("调度错误: {}", e))?
}

#[command]
pub async fn create_example_external_plugin(
    scope: String,
    project_path: Option<String>,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let root = resolve_scope_plugins_dir(&scope, project_path.as_deref())?;
        let created = scaffold_example_plugin(&root)?;
        Ok(created.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("调度错误: {}", e))?
}

#[command]
pub async fn remove_external_plugin(
    scope: String,
    dir_name: String,
    project_path: Option<String>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        if scope == "bundled" {
            return Err("随应用内置的官方插件不可移除，可在插件管理中使用开关禁用".to_string());
        }
        let root = resolve_scope_plugins_dir(&scope, project_path.as_deref())?;
        remove_plugin_from_root(&root, &dir_name)
    })
    .await
    .map_err(|e| format!("调度错误: {}", e))?
}
