use crate::commands::AppServices;
use crate::domain::{HttpRequestPayload, HttpResponsePayload};
use tauri::command;

#[command]
pub async fn send_rest_request(
    request_id: String,
    payload: HttpRequestPayload,
    services: tauri::State<'_, AppServices>,
) -> Result<HttpResponsePayload, String> {
    services.transport.send_cancellable(request_id, payload).await
}

#[command]
pub fn cancel_rest_request(
    request_id: String,
    services: tauri::State<'_, AppServices>,
) -> bool {
    services.transport.cancel(&request_id)
}

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

#[command]
pub async fn save_response_to_file(
    default_filename: String,
    content: Option<String>,
    use_raw_bytes: Option<bool>,
    request_id: Option<String>,
    services: tauri::State<'_, AppServices>,
) -> Result<Option<String>, String> {
    let cached_bytes = if use_raw_bytes.unwrap_or(false) {
        services
            .transport
            .get_cached_response_bytes(request_id.as_deref())
    } else {
        None
    };

    tokio::task::spawn_blocking(move || {
        let mut dialog = rfd::FileDialog::new().set_title("另存为本地文件");

        let default_name = default_filename.trim();
        if !default_name.is_empty() {
            dialog = dialog.set_file_name(default_name);
        }

        if let Some(path) = dialog.save_file() {
            let bytes_to_write = cached_bytes.unwrap_or_else(|| {
                content
                    .as_ref()
                    .map(|s| s.as_bytes().to_vec())
                    .unwrap_or_default()
            });

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

