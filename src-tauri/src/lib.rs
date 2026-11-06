pub mod commands;
pub mod http;
pub mod storage;
pub mod swagger;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(commands::RequestManager::default())
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::send_rest_request,
            commands::cancel_rest_request,
            commands::pick_file,
            commands::pick_project_folder,
            commands::load_project_from_dir,
            commands::save_project_config,
            commands::create_subproject,
            commands::save_subproject_config,
            commands::delete_subproject,
            commands::save_request_file,
            commands::delete_request_file,
            commands::record_history,
            commands::delete_history_item,
            commands::clear_history,
            commands::import_swagger_to_subproject,
            commands::refresh_swagger_subproject,
            commands::format_json_fast,
            commands::minify_json_fast,
            commands::save_response_to_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
