use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

fn default_true() -> bool {
    true
}

fn default_body_type() -> String {
    "none".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KeyValueItem {
    pub id: String,
    pub key: String,
    pub value: String,
    pub enabled: bool,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default, alias = "inherited_from")]
    pub inherited_from: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SavedRequest {
    pub id: String,
    pub name: String,
    pub method: String,
    pub path: String,
    #[serde(default, alias = "path_params")]
    pub path_params: Vec<KeyValueItem>,
    #[serde(default, alias = "query_params")]
    pub query_params: Vec<KeyValueItem>,
    #[serde(default)]
    pub headers: Vec<KeyValueItem>,
    #[serde(default = "default_body_type", alias = "body_type")]
    pub body_type: String,
    #[serde(default, alias = "body_content")]
    pub body_content: String,
    #[serde(default, alias = "sub_project_id")]
    pub sub_project_id: Option<String>,
    #[serde(default, alias = "file_name")]
    pub file_name: Option<String>,
    #[serde(default)]
    pub group: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SubProjectMetadata {
    pub id: String,
    pub name: String,
    #[serde(alias = "base_url")]
    pub base_url: String,
    #[serde(default = "default_true", alias = "inherit_base_url")]
    pub inherit_base_url: bool,
    #[serde(default)]
    pub headers: Vec<KeyValueItem>,
    #[serde(default = "default_true", alias = "inherit_headers")]
    pub inherit_headers: bool,
    #[serde(default)]
    pub variables: HashMap<String, String>,
    #[serde(default = "default_true", alias = "inherit_variables")]
    pub inherit_variables: bool,
    #[serde(default, alias = "swagger_source_url")]
    pub swagger_source_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentItem {
    pub id: String,
    pub name: String,
    pub variables: HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMetadata {
    pub name: String,
    #[serde(alias = "base_url")]
    pub base_url: String,
    #[serde(default)]
    pub headers: Vec<KeyValueItem>,
    #[serde(default)]
    pub environments: Vec<EnvironmentItem>,
    #[serde(default, alias = "active_environment_id")]
    pub active_environment_id: Option<String>,
    #[serde(default, alias = "swagger_source_url")]
    pub swagger_source_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HistoryItem {
    pub id: String,
    #[serde(alias = "request_id")]
    pub request_id: Option<String>,
    pub name: String,
    pub method: String,
    pub url: String,
    pub status: u16,
    #[serde(alias = "duration_ms")]
    pub duration_ms: u64,
    pub timestamp: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SubProjectData {
    pub config: SubProjectMetadata,
    pub dir_name: String,
    pub requests: Vec<SavedRequest>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FullProjectData {
    pub path: String,
    pub config: ProjectMetadata,
    pub sub_projects: Vec<SubProjectData>,
    pub history: Vec<HistoryItem>,
}

/// 打开系统原生文件对话框选择主项目目录
pub fn pick_folder() -> Result<Option<String>, String> {
    let folder = rfd::FileDialog::new()
        .set_title("选择 JustAPI 本地项目目录")
        .pick_folder();

    Ok(folder.map(|p| p.to_string_lossy().to_string()))
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

/// 加载或初始化本地项目目录
pub fn load_project_from_dir(path_str: &str) -> Result<FullProjectData, String> {
    let root = PathBuf::from(path_str);
    if !root.exists() || !root.is_dir() {
        return Err(format!("目录不存在: {}", path_str));
    }

    // 1. 确保 .justapi 目录
    let justapi_dir = root.join(".justapi");
    if !justapi_dir.exists() {
        fs::create_dir_all(&justapi_dir).map_err(|e| format!("创建 .justapi 失败: {}", e))?;
    }

    // 2. 确保 .gitignore 包含 history.json
    ensure_gitignore(&root);

    // 3. 读取或创建 .justapi/project.json
    let project_json_path = justapi_dir.join("project.json");
    let config: ProjectMetadata = if project_json_path.exists() {
        let text = fs::read_to_string(&project_json_path)
            .map_err(|e| format!("读取 project.json 失败: {}", e))?;
        serde_json::from_str(&text).map_err(|e| format!("解析 project.json 失败: {}", e))?
    } else {
        let default_name = root
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("My API Project")
            .to_string();
        let default_config = ProjectMetadata {
            name: default_name,
            base_url: "https://httpbin.org".to_string(),
            headers: vec![
                KeyValueItem {
                    id: "h_global_1".to_string(),
                    key: "User-Agent".to_string(),
                    value: "JustAPI/0.1.0".to_string(),
                    enabled: true,
                    description: Some("全局 User-Agent".to_string()),
                    inherited_from: None,
                }
            ],
            environments: vec![
                EnvironmentItem {
                    id: "env_dev".to_string(),
                    name: "Development".to_string(),
                    variables: HashMap::from([
                        ("env".to_string(), "dev".to_string()),
                    ]),
                }
            ],
            active_environment_id: Some("env_dev".to_string()),
            swagger_source_url: None,
        };
        let formatted = serde_json::to_string_pretty(&default_config)
            .map_err(|e| format!("序列化 project.json 失败: {}", e))?;
        fs::write(&project_json_path, formatted)
            .map_err(|e| format!("初始化 project.json 失败: {}", e))?;
        default_config
    };

    // 4. 扫描子项目目录
    let mut sub_projects = Vec::new();
    if let Ok(entries) = fs::read_dir(&root) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let dir_name = entry.file_name().to_string_lossy().to_string();
                if dir_name.starts_with('.') || dir_name == "node_modules" || dir_name == "dist" {
                    continue;
                }

                let sub_json_path = p.join(".subproject.json");
                if sub_json_path.exists() {
                    if let Ok(text) = fs::read_to_string(&sub_json_path) {
                        if let Ok(sub_config) = serde_json::from_str::<SubProjectMetadata>(&text) {
                            // 扫描该子项目下的所有请求 *.json (包含根目录与分组子目录)
                            let mut requests = Vec::new();
                            if let Ok(req_entries) = fs::read_dir(&p) {
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
                                                                if let Ok(mut saved_req) = serde_json::from_str::<SavedRequest>(&req_text) {
                                                                    saved_req.file_name = Some(format!("{}/{}", group_name, sub_fname));
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
                            }

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

    // 5. 读取 history.json
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

/// 保存主项目配置
pub fn save_project_config(path_str: &str, config: ProjectMetadata) -> Result<(), String> {
    let file_path = PathBuf::from(path_str).join(".justapi").join("project.json");
    let formatted = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("序列化 project.json 失败: {}", e))?;
    fs::write(file_path, formatted).map_err(|e| format!("写入 project.json 失败: {}", e))
}

/// 创建新子项目
pub fn create_subproject(
    project_path: &str,
    dir_name: &str,
    config: SubProjectMetadata,
) -> Result<(), String> {
    let sub_dir = PathBuf::from(project_path).join(dir_name);
    fs::create_dir_all(&sub_dir).map_err(|e| format!("创建子项目目录失败: {}", e))?;

    let file_path = sub_dir.join(".subproject.json");
    let formatted = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("序列化 .subproject.json 失败: {}", e))?;
    fs::write(file_path, formatted).map_err(|e| format!("写入 .subproject.json 失败: {}", e))
}

/// 保存子项目配置
pub fn save_subproject_config(
    project_path: &str,
    dir_name: &str,
    config: SubProjectMetadata,
) -> Result<(), String> {
    let file_path = PathBuf::from(project_path).join(dir_name).join(".subproject.json");
    let formatted = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("序列化 .subproject.json 失败: {}", e))?;
    fs::write(file_path, formatted).map_err(|e| format!("写入 .subproject.json 失败: {}", e))
}

/// 删除子项目目录
pub fn delete_subproject(project_path: &str, dir_name: &str) -> Result<(), String> {
    let sub_dir = PathBuf::from(project_path).join(dir_name);
    if sub_dir.exists() {
        fs::remove_dir_all(sub_dir).map_err(|e| format!("删除子项目目录失败: {}", e))?;
    }
    Ok(())
}

/// 保存单个请求到指定子项目目录
pub fn save_request_file(
    project_path: &str,
    dir_name: &str,
    file_name: &str,
    request: SavedRequest,
) -> Result<(), String> {
    let sub_dir = PathBuf::from(project_path).join(dir_name);
    if !sub_dir.exists() {
        fs::create_dir_all(&sub_dir).map_err(|e| format!("创建子项目目录失败: {}", e))?;
    }

    let clean_fname = if file_name.ends_with(".json") {
        file_name.to_string()
    } else {
        format!("{}.json", file_name)
    };

    let file_path = sub_dir.join(&clean_fname);
    if let Some(parent) = file_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("创建请求分组目录失败: {}", e))?;
        }
    }
    let formatted = serde_json::to_string_pretty(&request)
        .map_err(|e| format!("序列化请求文件失败: {}", e))?;
    fs::write(file_path, formatted).map_err(|e| format!("写入请求文件失败: {}", e))
}

/// 删除单个请求文件
pub fn delete_request_file(
    project_path: &str,
    dir_name: &str,
    file_name: &str,
) -> Result<(), String> {
    let file_path = PathBuf::from(project_path).join(dir_name).join(file_name);
    if file_path.exists() {
        fs::remove_file(file_path).map_err(|e| format!("删除请求文件失败: {}", e))?;
    }
    Ok(())
}

/// 追加一条历史记录（限制最新 200 条）
pub fn append_history(project_path: &str, item: HistoryItem) -> Result<(), String> {
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

/// 清空历史记录
pub fn clear_history(project_path: &str) -> Result<(), String> {
    let file_path = PathBuf::from(project_path).join("history.json");
    if file_path.exists() {
        let _ = fs::write(file_path, "[]");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_storage_project_lifecycle() {
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
        let _proj = load_project_from_dir(&path_str).unwrap();
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
        };
        create_subproject(&path_str, "auth_service", sub_config).unwrap();
        assert!(temp_dir.join("auth_service").join(".subproject.json").exists());

        // 3. 保存请求文件
        let req = SavedRequest {
            id: "req_login_1".to_string(),
            name: "登录接口".to_string(),
            method: "POST".to_string(),
            path: "/login".to_string(),
            path_params: vec![],
            query_params: vec![],
            headers: vec![],
            body_type: "json".to_string(),
            body_content: "{}".to_string(),
            sub_project_id: Some("auth_service".to_string()),
            file_name: None,
            group: None,
        };
        save_request_file(&path_str, "auth_service", "login.json", req).unwrap();
        assert!(temp_dir.join("auth_service").join("login.json").exists());

        // 3.5 保存分组请求文件 (位于子文件夹内)
        let req_grouped = SavedRequest {
            id: "req_user_1".to_string(),
            name: "获取用户详情".to_string(),
            method: "GET".to_string(),
            path: "/users/1".to_string(),
            path_params: vec![],
            query_params: vec![],
            headers: vec![],
            body_type: "none".to_string(),
            body_content: "".to_string(),
            sub_project_id: Some("auth_service".to_string()),
            file_name: None,
            group: Some("用户管理".to_string()),
        };
        save_request_file(&path_str, "auth_service", "用户管理/get_user.json", req_grouped).unwrap();
        assert!(temp_dir.join("auth_service").join("用户管理").join("get_user.json").exists());

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
        };
        append_history(&path_str, hist).unwrap();
        assert!(temp_dir.join("history.json").exists());

        // 5. 重新加载完整项目数据
        let loaded = load_project_from_dir(&path_str).unwrap();
        assert_eq!(loaded.sub_projects.len(), 1);
        assert_eq!(loaded.sub_projects[0].requests.len(), 2);
        let user_req = loaded.sub_projects[0].requests.iter().find(|r| r.id == "req_user_1").unwrap();
        assert_eq!(user_req.group, Some("用户管理".to_string()));
        assert_eq!(user_req.file_name, Some("用户管理/get_user.json".to_string()));
        assert_eq!(loaded.history.len(), 1);

        // 清理临时测试目录
        let _ = fs::remove_dir_all(temp_dir);
    }
}

