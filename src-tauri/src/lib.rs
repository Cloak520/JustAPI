pub mod commands;
pub mod http;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::send_rest_request,
            commands::format_json_fast,
            commands::minify_json_fast,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
