use crate::domain::{
    CURRENT_SCHEMA_VERSION, EnvironmentItem, FullProjectData, HistoryItem, KeyValueItem,
    NetworkSettingsItem, ProjectMetadata, SavedRequest, SubProjectData, SubProjectMetadata,
};
use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};

/// 工作区存储仓库 Trait：解耦文件协议与持久化存储实现
pub trait WorkspaceRepository: Send + Sync {
    fn load_project(&self, root: &str) -> Result<FullProjectData, String>;
    fn save_project_config(&self, root: &str, config: ProjectMetadata) -> Result<(), String>;
    fn create_subproject(
        &self,
        root: &str,
        dir_name: &str,
        config: SubProjectMetadata,
    ) -> Result<(), String>;
    fn save_subproject_config(
        &self,
        root: &str,
        dir_name: &str,
        config: SubProjectMetadata,
    ) -> Result<(), String>;
    fn delete_subproject(&self, root: &str, dir_name: &str) -> Result<(), String>;
    fn save_request(
        &self,
        root: &str,
        dir_name: &str,
        file_name: &str,
        request: SavedRequest,
    ) -> Result<(), String>;
    fn delete_request(&self, root: &str, dir_name: &str, file_name: &str) -> Result<(), String>;
    fn append_history(&self, root: &str, item: HistoryItem) -> Result<(), String>;
    fn clear_history(&self, root: &str) -> Result<(), String>;
    fn delete_history_item(&self, root: &str, item_id: &str) -> Result<(), String>;
}

/// 基于本地文件夹协议的默认存储仓库 (Folder-as-Project)
#[derive(Default)]
pub struct LocalFsRepository;

impl LocalFsRepository {
    pub fn new() -> Self {
        Self
    }
}

/// 打开系统原生文件对话框选择主项目目录
pub fn pick_folder() -> Result<Option<String>, String> {
    let folder = rfd::FileDialog::new()
        .set_title("选择 JustAPI 本地项目目录")
        .pick_folder();

    Ok(folder.map(|p| p.to_string_lossy().to_string()))
}

/// 校验相对路径安全，防止越界目录穿越
fn safe_join_rel(base: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    if rel_path.is_absolute() {
        return Err(format!("非法绝对路径: {}", rel));
    }
    for comp in rel_path.components() {
        match comp {
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(format!("非法路径片段: {}", rel));
            }
            _ => {}
        }
    }
    Ok(base.join(rel_path))
}

/// 确保 .gitignore 包含 history.json
fn ensure_gitignore(root: &Path) {
    let gitignore_path = root.join(".gitignore");
    let content = if gitignore_path.exists() {
        fs::read_to_string(&gitignore_path).unwrap_or_default()
    } else {
        String::new()
    };

    if !content.lines().any(|l| l.trim() == "history.json") {
        let mut new_content = content;
        if !new_content.is_empty() && !new_content.ends_with('\n') {
            new_content.push('\n');
        }
        new_content.push_str("# JustAPI 本地调试历史 (不污染 Git)\nhistory.json\n");
        let _ = fs::write(gitignore_path, new_content);
    }
}

fn scan_subproject_requests(sub_dir: &Path) -> Vec<SavedRequest> {
    let mut requests = Vec::new();
    let Ok(req_entries) = fs::read_dir(sub_dir) else {
        return requests;
    };

    for req_entry in req_entries.flatten() {
        let req_path = req_entry.path();
        if req_path.is_file() {
            let fname = req_entry.file_name().to_string_lossy().to_string();
            if fname.ends_with(".json") && fname != ".subproject.json" {
                if let Ok(req_text) = fs::read_to_string(&req_path) {
                    if let Ok(mut saved_req) = serde_json::from_str::<SavedRequest>(&req_text) {
                        saved_req.file_name = Some(fname);
                        requests.push(saved_req);
                    }
                }
            }
        } else if req_path.is_dir() {
            let group_name = req_entry.file_name().to_string_lossy().to_string();
            if !group_name.starts_with('.') && group_name != "node_modules" {
                if let Ok(sub_entries) = fs::read_dir(&req_path) {
                    for sub_entry in sub_entries.flatten() {
                        let sub_file_path = sub_entry.path();
                        if sub_file_path.is_file() {
                            let sub_fname = sub_entry.file_name().to_string_lossy().to_string();
                            if sub_fname.ends_with(".json") {
                                if let Ok(req_text) = fs::read_to_string(&sub_file_path) {
                                    if let Ok(mut saved_req) =
                                        serde_json::from_str::<SavedRequest>(&req_text)
                                    {
                                        saved_req.file_name =
                                            Some(format!("{}/{}", group_name, sub_fname));
                                        if saved_req.group.is_none() {
                                            saved_req.group = Some(group_name.clone());
                                        }
                                        requests.push(saved_req);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    requests
}

impl WorkspaceRepository for LocalFsRepository {
    fn load_project(&self, path_str: &str) -> Result<FullProjectData, String> {
        let root = PathBuf::from(path_str);
        if !root.exists() || !root.is_dir() {
            return Err(format!("目录不存在: {}", path_str));
        }

        let justapi_dir = root.join(".justapi");
        if !justapi_dir.exists() {
            fs::create_dir_all(&justapi_dir)
                .map_err(|e| format!("创建 .justapi 失败: {}", e))?;
        }

        ensure_gitignore(&root);

        let project_json_path = justapi_dir.join("project.json");
        let config: ProjectMetadata = if project_json_path.exists() {
            let text = fs::read_to_string(&project_json_path)
                .map_err(|e| format!("读取 project.json 失败: {}", e))?;
            serde_json::from_str(&text)
                .map_err(|e| format!("解析 project.json 失败: {}", e))?
        } else {
            let default_name = root
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("My API Project")
                .to_string();
            let default_config = ProjectMetadata {
                schema_version: CURRENT_SCHEMA_VERSION,
                name: default_name,
                base_url: "https://httpbin.org".to_string(),
                headers: vec![KeyValueItem {
                    id: "h_global_1".to_string(),
                    key: "User-Agent".to_string(),
                    value: "JustAPI/0.2.0".to_string(),
                    enabled: true,
                    description: Some("全局 User-Agent".to_string()),
                    inherited_from: None,
                    is_inherited_override: None,
                }],
                environments: vec![EnvironmentItem {
                    id: "env_dev".to_string(),
                    name: "Development".to_string(),
                    variables: HashMap::from([("env".to_string(), "dev".to_string())]),
                }],
                active_environment_id: Some("env_dev".to_string()),
                swagger_source_url: None,
                network_settings: Some(NetworkSettingsItem::default()),
                disabled_plugins: Vec::new(),
            };
            let formatted = serde_json::to_string_pretty(&default_config)
                .map_err(|e| format!("序列化 project.json 失败: {}", e))?;
            fs::write(&project_json_path, formatted)
                .map_err(|e| format!("初始化 project.json 失败: {}", e))?;
            default_config
        };

        let mut sub_projects = Vec::new();
        if let Ok(entries) = fs::read_dir(&root) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    let dir_name = entry.file_name().to_string_lossy().to_string();
                    if dir_name.starts_with('.')
                        || dir_name == "node_modules"
                        || dir_name == "dist"
                    {
                        continue;
                    }

                    let sub_json_path = p.join(".subproject.json");
                    if sub_json_path.exists() {
                        if let Ok(text) = fs::read_to_string(&sub_json_path) {
                            if let Ok(sub_config) = serde_json::from_str::<SubProjectMetadata>(&text)
                            {
                                let requests = scan_subproject_requests(&p);
                                sub_projects.push(SubProjectData {
                                    config: sub_config,
                                    dir_name,
                                    requests,
                                });
                            }
                        }
                    }
                }
            }
        }

        let history_path = root.join("history.json");
        let history: Vec<HistoryItem> = if history_path.exists() {
            fs::read_to_string(&history_path)
                .ok()
                .and_then(|t| serde_json::from_str(&t).ok())
                .unwrap_or_default()
        } else {
            Vec::new()
        };

        Ok(FullProjectData {
            path: path_str.to_string(),
            config,
            sub_projects,
            history,
        })
    }

    fn save_project_config(&self, path_str: &str, config: ProjectMetadata) -> Result<(), String> {
        let justapi_dir = PathBuf::from(path_str).join(".justapi");
        if !justapi_dir.exists() {
            fs::create_dir_all(&justapi_dir)
                .map_err(|e| format!("创建 .justapi 失败: {}", e))?;
        }
        let file_path = justapi_dir.join("project.json");
        let formatted = serde_json::to_string_pretty(&config)
            .map_err(|e| format!("序列化 project.json 失败: {}", e))?;
        fs::write(file_path, formatted).map_err(|e| format!("写入 project.json 失败: {}", e))
    }

    fn create_subproject(
        &self,
        project_path: &str,
        dir_name: &str,
        config: SubProjectMetadata,
    ) -> Result<(), String> {
        let sub_dir = safe_join_rel(Path::new(project_path), dir_name)?;
        fs::create_dir_all(&sub_dir).map_err(|e| format!("创建子项目目录失败: {}", e))?;

        let file_path = sub_dir.join(".subproject.json");
        let formatted = serde_json::to_string_pretty(&config)
            .map_err(|e| format!("序列化 .subproject.json 失败: {}", e))?;
        fs::write(file_path, formatted)
            .map_err(|e| format!("写入 .subproject.json 失败: {}", e))
    }

    fn save_subproject_config(
        &self,
        project_path: &str,
        dir_name: &str,
        config: SubProjectMetadata,
    ) -> Result<(), String> {
        let sub_dir = safe_join_rel(Path::new(project_path), dir_name)?;
        let file_path = sub_dir.join(".subproject.json");
        let formatted = serde_json::to_string_pretty(&config)
            .map_err(|e| format!("序列化 .subproject.json 失败: {}", e))?;
        fs::write(file_path, formatted)
            .map_err(|e| format!("写入 .subproject.json 失败: {}", e))
    }

    fn delete_subproject(&self, project_path: &str, dir_name: &str) -> Result<(), String> {
        let sub_dir = safe_join_rel(Path::new(project_path), dir_name)?;
        if sub_dir.exists() {
            fs::remove_dir_all(sub_dir).map_err(|e| format!("删除子项目目录失败: {}", e))?;
        }
        Ok(())
    }

    fn save_request(
        &self,
        project_path: &str,
        dir_name: &str,
        file_name: &str,
        request: SavedRequest,
    ) -> Result<(), String> {
        let sub_dir = safe_join_rel(Path::new(project_path), dir_name)?;
        if !sub_dir.exists() {
            fs::create_dir_all(&sub_dir).map_err(|e| format!("创建子项目目录失败: {}", e))?;
        }

        let clean_fname = if file_name.ends_with(".json") {
            file_name.to_string()
        } else {
            format!("{}.json", file_name)
        };

        let file_path = safe_join_rel(&sub_dir, &clean_fname)?;
        if let Some(parent) = file_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).map_err(|e| format!("创建请求分组目录失败: {}", e))?;
            }
        }
        let formatted = serde_json::to_string_pretty(&request)
            .map_err(|e| format!("序列化请求文件失败: {}", e))?;
        fs::write(file_path, formatted).map_err(|e| format!("写入请求文件失败: {}", e))
    }

    fn delete_request(
        &self,
        project_path: &str,
        dir_name: &str,
        file_name: &str,
    ) -> Result<(), String> {
        let sub_dir = safe_join_rel(Path::new(project_path), dir_name)?;
        let file_path = safe_join_rel(&sub_dir, file_name)?;
        if file_path.exists() {
            fs::remove_file(file_path).map_err(|e| format!("删除请求文件失败: {}", e))?;
        }
        Ok(())
    }

    fn append_history(&self, project_path: &str, item: HistoryItem) -> Result<(), String> {
        let root = PathBuf::from(project_path);
        if !root.exists() {
            return Ok(());
        }

        let file_path = root.join("history.json");
        let mut list: Vec<HistoryItem> = if file_path.exists() {
            fs::read_to_string(&file_path)
                .ok()
                .and_then(|t| serde_json::from_str(&t).ok())
                .unwrap_or_default()
        } else {
            Vec::new()
        };

        list.insert(0, item);
        if list.len() > 200 {
            list.truncate(200);
        }

        let formatted = serde_json::to_string_pretty(&list)
            .map_err(|e| format!("序列化 history.json 失败: {}", e))?;
        fs::write(file_path, formatted).map_err(|e| format!("写入 history.json 失败: {}", e))
    }

    fn clear_history(&self, project_path: &str) -> Result<(), String> {
        let file_path = PathBuf::from(project_path).join("history.json");
        if file_path.exists() {
            let _ = fs::write(file_path, "[]");
        }
        Ok(())
    }

    fn delete_history_item(&self, project_path: &str, item_id: &str) -> Result<(), String> {
        let root = PathBuf::from(project_path);
        if !root.exists() {
            return Ok(());
        }

        let file_path = root.join("history.json");
        if file_path.exists() {
            if let Ok(text) = fs::read_to_string(&file_path) {
                if let Ok(mut list) = serde_json::from_str::<Vec<HistoryItem>>(&text) {
                    list.retain(|h| h.id != item_id);
                    let formatted = serde_json::to_string_pretty(&list)
                        .map_err(|e| format!("序列化 history.json 失败: {}", e))?;
                    fs::write(file_path, formatted)
                        .map_err(|e| format!("写入 history.json 失败: {}", e))?;
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::FormField;

    #[test]
    fn test_storage_project_lifecycle() {
        let repo = LocalFsRepository::new();
        let temp_dir = std::env::temp_dir().join(format!(
            "justapi_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&temp_dir).unwrap();
        let path_str = temp_dir.to_string_lossy().to_string();

        // 1. 初始化项目
        let proj = repo.load_project(&path_str).unwrap();
        assert_eq!(proj.config.schema_version, CURRENT_SCHEMA_VERSION);
        assert!(temp_dir.join(".justapi").join("project.json").exists());
        assert!(temp_dir.join(".gitignore").exists());
        let gitignore = fs::read_to_string(temp_dir.join(".gitignore")).unwrap();
        assert!(gitignore.contains("history.json"));

        // 2. 创建子项目
        let sub_config = SubProjectMetadata {
            id: "auth_service".to_string(),
            name: "认证服务".to_string(),
            base_url: "/auth".to_string(),
            inherit_base_url: true,
            headers: vec![],
            inherit_headers: true,
            variables: HashMap::new(),
            inherit_variables: true,
            swagger_source_url: None,
            collection_source: None,
        };
        repo.create_subproject(&path_str, "auth_service", sub_config)
            .unwrap();
        assert!(temp_dir
            .join("auth_service")
            .join(".subproject.json")
            .exists());

        // 3. 保存请求文件（含 formFields）
        let req = SavedRequest {
            schema_version: CURRENT_SCHEMA_VERSION,
            id: "req_login_1".to_string(),
            name: "登录接口".to_string(),
            method: "POST".to_string(),
            path: "/login".to_string(),
            path_params: vec![],
            query_params: vec![],
            headers: vec![],
            body_type: "form-data".to_string(),
            body_content: "".to_string(),
            form_fields: vec![FormField {
                id: Some("f1".to_string()),
                key: "username".to_string(),
                value: "alice".to_string(),
                is_file: false,
                enabled: true,
            }],
            sub_project_id: Some("auth_service".to_string()),
            file_name: None,
            group: None,
            extensions: None,
        };
        repo.save_request(&path_str, "auth_service", "login.json", req)
            .unwrap();
        assert!(temp_dir.join("auth_service").join("login.json").exists());

        // 3.5 保存分组请求文件
        let req_grouped = SavedRequest {
            schema_version: CURRENT_SCHEMA_VERSION,
            id: "req_user_1".to_string(),
            name: "获取用户详情".to_string(),
            method: "GET".to_string(),
            path: "/users/1".to_string(),
            path_params: vec![],
            query_params: vec![],
            headers: vec![],
            body_type: "none".to_string(),
            body_content: "".to_string(),
            form_fields: vec![],
            sub_project_id: Some("auth_service".to_string()),
            file_name: None,
            group: Some("用户管理".to_string()),
            extensions: None,
        };
        repo.save_request(
            &path_str,
            "auth_service",
            "用户管理/get_user.json",
            req_grouped,
        )
        .unwrap();
        assert!(temp_dir
            .join("auth_service")
            .join("用户管理")
            .join("get_user.json")
            .exists());

        // 4. 追加历史记录
        let hist = HistoryItem {
            id: "h1".to_string(),
            request_id: Some("req_login_1".to_string()),
            name: "登录接口".to_string(),
            method: "POST".to_string(),
            url: "https://httpbin.org/auth/login".to_string(),
            status: 200,
            duration_ms: 55,
            timestamp: 123456789,
            headers: Some(vec![(
                "Content-Type".to_string(),
                "application/json".to_string(),
            )]),
            body_type: Some("json".to_string()),
            body_content: Some("{\"test\": true}".to_string()),
        };
        repo.append_history(&path_str, hist).unwrap();
        repo.delete_history_item(&path_str, "h1").unwrap();
        let after_delete = repo.load_project(&path_str).unwrap();
        assert_eq!(after_delete.history.len(), 0);

        // 5. 检查加载结果
        let loaded = repo.load_project(&path_str).unwrap();
        assert_eq!(loaded.sub_projects.len(), 1);
        assert_eq!(loaded.sub_projects[0].requests.len(), 2);
        let login_req = loaded.sub_projects[0]
            .requests
            .iter()
            .find(|r| r.id == "req_login_1")
            .unwrap();
        assert_eq!(login_req.form_fields.len(), 1);
        assert_eq!(login_req.form_fields[0].key, "username");

        // 6. 检查越界路径拦截
        assert!(repo
            .delete_request(&path_str, "auth_service", "../../etc/passwd")
            .is_err());

        // 7. 兼容旧格式（无 schemaVersion 与 formFields）
        let legacy_json = r#"{"id":"legacy_1","name":"旧接口","method":"GET","path":"/ping","headers":[],"bodyType":"none","bodyContent":""}"#;
        fs::write(temp_dir.join("auth_service").join("legacy.json"), legacy_json).unwrap();
        let reloaded = repo.load_project(&path_str).unwrap();
        let legacy_loaded = reloaded.sub_projects[0]
            .requests
            .iter()
            .find(|r| r.id == "legacy_1")
            .unwrap();
        assert_eq!(legacy_loaded.schema_version, CURRENT_SCHEMA_VERSION);
        assert!(legacy_loaded.form_fields.is_empty());

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn test_project_json_disabled_plugins_roundtrip_and_compat() {
        let repo = LocalFsRepository::new();
        let temp_dir = std::env::temp_dir().join(format!(
            "justapi_disabled_plugins_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&temp_dir).unwrap();
        let path_str = temp_dir.to_string_lossy().to_string();

        // 1. 初始化项目时 disabled_plugins 为空，不写入冗余字段
        let mut proj = repo.load_project(&path_str).unwrap();
        assert!(proj.config.disabled_plugins.is_empty());
        let project_json_path = temp_dir.join(".justapi").join("project.json");
        let initial_raw = fs::read_to_string(&project_json_path).unwrap();
        assert!(!initial_raw.contains("disabledPlugins"));

        // 2. 保存 disabled_plugins 到 project.json（camelCase）并验证往返读取
        proj.config.disabled_plugins = vec![
            "bundled:justapi.curl".to_string(),
            "project:example.request-tagger".to_string(),
        ];
        repo.save_project_config(&path_str, proj.config.clone()).unwrap();
        let saved_raw = fs::read_to_string(&project_json_path).unwrap();
        assert!(saved_raw.contains("\"disabledPlugins\""));
        assert!(saved_raw.contains("bundled:justapi.curl"));

        let reloaded = repo.load_project(&path_str).unwrap();
        assert_eq!(
            reloaded.config.disabled_plugins,
            vec![
                "bundled:justapi.curl".to_string(),
                "project:example.request-tagger".to_string(),
            ]
        );

        // 3. 清空 disabled_plugins 并保存时，省略该字段
        let mut cleared_config = reloaded.config;
        cleared_config.disabled_plugins.clear();
        repo.save_project_config(&path_str, cleared_config).unwrap();
        let cleared_raw = fs::read_to_string(&project_json_path).unwrap();
        assert!(!cleared_raw.contains("disabledPlugins"));

        // 4. 兼容手动编辑的 snake_case 字段 disabled_plugins
        let snake_case_json = r#"{"name":"Snake","baseUrl":"https://example.com","headers":[],"environments":[],"disabled_plugins":["global:my.plugin"]}"#;
        fs::write(&project_json_path, snake_case_json).unwrap();
        let snake_loaded = repo.load_project(&path_str).unwrap();
        assert_eq!(
            snake_loaded.config.disabled_plugins,
            vec!["global:my.plugin".to_string()]
        );

        let _ = fs::remove_dir_all(temp_dir);
    }
}
