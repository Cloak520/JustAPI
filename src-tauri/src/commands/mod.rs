pub mod formatter;
pub mod importer;
pub mod plugins;
pub mod transport;
pub mod workspace;

use crate::repository::LocalFsRepository;
use crate::transport::ReqwestTransport;
use std::sync::Arc;

/// 全局应用状态容器，注入各领域服务与持久化仓库
pub struct AppServices {
    pub transport: Arc<ReqwestTransport>,
    pub repository: Arc<LocalFsRepository>,
}

impl Default for AppServices {
    fn default() -> Self {
        Self {
            transport: Arc::new(ReqwestTransport::new()),
            repository: Arc::new(LocalFsRepository::new()),
        }
    }
}

#[tauri::command]
pub fn ping() -> String {
    "Tauri 2.0 (Rust Core) 在线".to_string()
}
