pub mod commands;
pub mod http;
pub mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::send_rest_request,
            commands::pick_project_folder,
            commands::load_project_from_dir,
            commands::save_project_config,
            commands::create_subproject,
            commands::save_subproject_config,
            commands::delete_subproject,
            commands::save_request_file,
            commands::delete_request_file,
            commands::record_history,
            commands::clear_history,
            commands::format_json_fast,
            commands::minify_json_fast,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
