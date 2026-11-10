pub mod commands;
pub mod domain;
pub mod formatter;
pub mod importer;
pub mod plugins;
pub mod repository;
pub mod transport;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(commands::AppServices::default())
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::transport::send_rest_request,
            commands::transport::cancel_rest_request,
            commands::transport::pick_file,
            commands::transport::save_response_to_file,
            commands::workspace::pick_project_folder,
            commands::workspace::load_project_from_dir,
            commands::workspace::save_project_config,
            commands::workspace::create_subproject,
            commands::workspace::save_subproject_config,
            commands::workspace::delete_subproject,
            commands::workspace::save_request_file,
            commands::workspace::delete_request_file,
            commands::workspace::record_history,
            commands::workspace::delete_history_item,
            commands::workspace::clear_history,
            commands::importer::read_import_source,
            commands::importer::parse_structured_document,
            commands::importer::merge_and_save_collection,
            commands::formatter::format_json_fast,
            commands::formatter::minify_json_fast,
            commands::plugins::discover_external_plugins,
            commands::plugins::read_external_plugin_assets,
            commands::plugins::open_external_plugins_dir,
            commands::plugins::create_example_external_plugin,
            commands::plugins::remove_external_plugin,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
