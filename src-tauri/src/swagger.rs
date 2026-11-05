use crate::storage::{KeyValueItem, SavedRequest};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct SwaggerParsedResult {
    pub title: String,
    pub base_url: Option<String>,
    pub requests: Vec<SavedRequest>,
}

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
pub struct MergeStats {
    pub added: usize,
    pub updated: usize,
    pub deprecated: usize,
    pub total: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MergeResult {
    pub requests: Vec<SavedRequest>,
    pub stats: MergeStats,
}

/// 从远程 URL 或本地路径拉取并解析 Swagger / OpenAPI 文档
pub async fn fetch_and_parse_swagger(source: &str) -> Result<SwaggerParsedResult, String> {
    let raw_text = if source.starts_with("http://") || source.starts_with("https://") {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| format!("构建网络客户端失败: {}", e))?;
        let resp = client
            .get(source)
            .header("Accept", "application/json, application/yaml, text/yaml, */*")
            .send()
            .await
            .map_err(|e| format!("请求 Swagger 文档失败 ({}): {}", source, e))?;

        if !resp.status().is_success() {
            return Err(format!("拉取 Swagger 文档失败，状态码: {}", resp.status()));
        }

        resp.text()
            .await
            .map_err(|e| format!("读取文档流失败: {}", e))?
    } else {
        std::fs::read_to_string(source)
            .map_err(|e| format!("读取本地 Swagger 文件失败 ({}): {}", source, e))?
    };

    parse_swagger_content(&raw_text)
}

/// 解析 Swagger 2.0 或 OpenAPI 3.0/3.1 内容 (支持 JSON 或 YAML)
pub fn parse_swagger_content(content: &str) -> Result<SwaggerParsedResult, String> {
    // 优先尝试 JSON 解析，失败后尝试 YAML
    let doc: serde_json::Value = serde_json::from_str(content)
        .or_else(|_| serde_yaml::from_str(content))
        .map_err(|e| format!("无效的 Swagger / OpenAPI 格式 (JSON/YAML 解析均失败): {}", e))?;

    let title = doc
        .get("info")
        .and_then(|i| i.get("title"))
        .and_then(|t| t.as_str())
        .unwrap_or("Swagger API")
        .to_string();

    // 提取 BaseURL
    let mut base_url = None;
    if let Some(servers) = doc.get("servers").and_then(|s| s.as_array()) {
        // OpenAPI 3.x
        if let Some(first_server) = servers.first().and_then(|s| s.get("url")).and_then(|u| u.as_str()) {
            base_url = Some(first_server.to_string());
        }
    } else if let Some(host) = doc.get("host").and_then(|h| h.as_str()) {
        // Swagger 2.0
        let scheme = doc
            .get("schemes")
            .and_then(|s| s.as_array())
            .and_then(|arr| arr.first())
            .and_then(|s| s.as_str())
            .unwrap_or("https");
        let base_path = doc.get("basePath").and_then(|b| b.as_str()).unwrap_or("");
        base_url = Some(format!("{}://{}{}", scheme, host, base_path.trim_end_matches('/')));
    }

    let mut requests = Vec::new();
    let supported_methods = ["get", "post", "put", "delete", "patch", "head", "options"];

    if let Some(paths) = doc.get("paths").and_then(|p| p.as_object()) {
        for (path_str, path_item) in paths {
            if let Some(item_obj) = path_item.as_object() {
                for method in &supported_methods {
                    if let Some(op) = item_obj.get(*method) {
                        let method_upper = method.to_uppercase();
                        let summary = op.get("summary").and_then(|s| s.as_str());
                        let op_id = op.get("operationId").and_then(|o| o.as_str());

                        // 提取 Swagger / OpenAPI 中的 tags 作为接口分组名称
                        let tag = op
                            .get("tags")
                            .and_then(|t| t.as_array())
                            .and_then(|arr| arr.first())
                            .and_then(|t| t.as_str())
                            .map(|s| s.trim().to_string())
                            .filter(|s| !s.is_empty());

                        let req_name = summary
                            .or(op_id)
                            .unwrap_or_else(|| path_str.as_str())
                            .to_string();

                        let mut path_params = Vec::new();
                        let mut query_params = Vec::new();
                        let mut headers = Vec::new();
                        let mut body_type = "none".to_string();
                        let mut body_content = String::new();

                        // 1. 解析 parameters (Swagger 2.0 & OpenAPI 3)
                        if let Some(params) = op.get("parameters").and_then(|p| p.as_array()) {
                            for param in params {
                                let p_in = param.get("in").and_then(|i| i.as_str()).unwrap_or("");
                                let p_name = param.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
                                if p_name.is_empty() {
                                    continue;
                                }

                                let desc = param.get("description").and_then(|d| d.as_str()).map(|d| d.to_string());
                                let default_val = param
                                    .get("default")
                                    .or_else(|| param.get("schema").and_then(|s| s.get("default")))
                                    .or_else(|| param.get("example"))
                                    .map(|v| v.to_string().trim_matches('"').to_string())
                                    .unwrap_or_default();

                                let item = KeyValueItem {
                                    id: format!("{}_{}", p_in, p_name),
                                    key: p_name,
                                    value: default_val,
                                    enabled: true,
                                    description: desc,
                                    inherited_from: None,
                                };

                                match p_in {
                                    "path" => path_params.push(item),
                                    "query" => query_params.push(item),
                                    "header" => headers.push(item),
                                    "body" => {
                                        body_type = "json".to_string();
                                        body_content = "{\n  \"example\": \"value\"\n}".to_string();
                                    }
                                    _ => {}
                                }
                            }
                        }

                        // 2. 解析 requestBody (OpenAPI 3.x)
                        if let Some(rb) = op.get("requestBody") {
                            if let Some(content_map) = rb.get("content").and_then(|c| c.as_object()) {
                                if content_map.contains_key("application/json") {
                                    body_type = "json".to_string();
                                    body_content = "{\n  \"example\": \"value\"\n}".to_string();
                                } else if content_map.contains_key("application/x-www-form-urlencoded") {
                                    body_type = "x-www-form-urlencoded".to_string();
                                } else if content_map.contains_key("multipart/form-data") {
                                    body_type = "form-data".to_string();
                                }
                            }
                        }

                        let clean_path_id = path_str.trim_start_matches('/').replace('/', "_").replace(['{', '}'], "");
                        let safe_id = format!("{}_{}", method_upper, clean_path_id);

                        let (file_name, group_name) = if let Some(ref g) = tag {
                            let clean_g = g.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
                            (format!("{}/{}.json", clean_g, safe_id), Some(g.clone()))
                        } else {
                            (format!("{}.json", safe_id), None)
                        };

                        requests.push(SavedRequest {
                            id: safe_id,
                            name: req_name,
                            method: method_upper,
                            path: path_str.clone(),
                            path_params,
                            query_params,
                            headers,
                            body_type,
                            body_content,
                            sub_project_id: None,
                            file_name: Some(file_name),
                            group: group_name,
                        });
                    }
                }
            }
        }
    }

    Ok(SwaggerParsedResult {
        title,
        base_url,
        requests,
    })
}

/// 智能无损合并 Swagger 文档与本地现有接口
/// 规则：
/// 1. 已有接口：无损保留用户已填好的具体测试参数 Value、自定义 Header 与 Body 内容
/// 2. 新增接口：直接追加
/// 3. 已删除接口：坚决不物理删除本地文件，打上 [已下线] 标记，保护测试数据
pub fn smart_merge(
    existing_requests: &[SavedRequest],
    new_requests: Vec<SavedRequest>,
) -> MergeResult {
    let mut stats = MergeStats::default();
    let mut merged = Vec::new();

    // 建立已有接口的映射表：Key 为 "METHOD PATH"
    let mut existing_map: HashMap<String, SavedRequest> = HashMap::new();
    for req in existing_requests {
        let key = format!("{} {}", req.method.to_uppercase(), req.path.trim());
        existing_map.insert(key, req.clone());
    }

    let mut matched_existing_keys = std::collections::HashSet::new();

    for mut new_req in new_requests {
        let key = format!("{} {}", new_req.method.to_uppercase(), new_req.path.trim());

        if let Some(existing) = existing_map.get(&key) {
            matched_existing_keys.insert(key);

            // 1. 无损保留 Query Params 中用户填写的测试值
            let existing_param_map: HashMap<String, (String, bool)> = existing
                .query_params
                .iter()
                .map(|p| (p.key.clone(), (p.value.clone(), p.enabled)))
                .collect();

            for np in &mut new_req.query_params {
                if let Some((old_val, old_enabled)) = existing_param_map.get(&np.key) {
                    if !old_val.is_empty() {
                        np.value = old_val.clone();
                    }
                    np.enabled = *old_enabled;
                }
            }

            // 保留用户此前手动添加的非 Swagger 参数
            let new_param_keys: std::collections::HashSet<String> =
                new_req.query_params.iter().map(|p| p.key.clone()).collect();
            for ep in &existing.query_params {
                if !new_param_keys.contains(&ep.key) {
                    new_req.query_params.push(ep.clone());
                }
            }

            // 2. 无损保留 Path Variables 用户已填的值
            let existing_path_var_map: HashMap<String, String> = existing
                .path_params
                .iter()
                .map(|p| (p.key.clone(), p.value.clone()))
                .collect();
            for n_pp in &mut new_req.path_params {
                if let Some(old_val) = existing_path_var_map.get(&n_pp.key) {
                    if !old_val.is_empty() {
                        n_pp.value = old_val.clone();
                    }
                }
            }

            // 3. 无损保留用户自定义的 Headers
            let new_header_keys: std::collections::HashSet<String> =
                new_req.headers.iter().map(|h| h.key.to_lowercase()).collect();
            for eh in &existing.headers {
                if !new_header_keys.contains(&eh.key.to_lowercase()) {
                    new_req.headers.push(eh.clone());
                }
            }

            // 4. 无损保留 Body 内容
            if !existing.body_content.trim().is_empty() {
                new_req.body_content = existing.body_content.clone();
                new_req.body_type = existing.body_type.clone();
            }

            // 5. 保持文件名与分组一致
            new_req.file_name = existing.file_name.clone();
            new_req.id = existing.id.clone();
            if new_req.group.is_none() {
                new_req.group = existing.group.clone();
            }

            stats.updated += 1;
            merged.push(new_req);
        } else {
            // 新增接口
            stats.added += 1;
            merged.push(new_req);
        }
    }

    // 6. 检查已下线的接口（在 existing 中存在，但在最新 Swagger 中被删除）
    for (key, existing) in existing_map {
        if !matched_existing_keys.contains(&key) {
            let mut deprecated_req = existing.clone();
            if !deprecated_req.name.starts_with("[已下线]") && !deprecated_req.name.starts_with("[Deprecated]") {
                deprecated_req.name = format!("[已下线] {}", deprecated_req.name);
            }
            stats.deprecated += 1;
            merged.push(deprecated_req);
        }
    }

    stats.total = merged.len();

    MergeResult {
        requests: merged,
        stats,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_openapi_and_smart_merge() {
        let openapi_json = r#"{
            "openapi": "3.0.0",
            "info": { "title": "Petstore Test API" },
            "servers": [{ "url": "https://petstore.example.com/v1" }],
            "paths": {
                "/pets": {
                    "get": {
                        "tags": ["Pets"],
                        "summary": "获取宠物列表",
                        "parameters": [
                            { "name": "limit", "in": "query", "description": "条数", "default": "10" }
                        ]
                    },
                    "post": {
                        "tags": ["Pets"],
                        "summary": "创建宠物",
                        "requestBody": {
                            "content": {
                                "application/json": {}
                            }
                        }
                    }
                }
            }
        }"#;

        let parsed = parse_swagger_content(openapi_json).unwrap();
        assert_eq!(parsed.title, "Petstore Test API");
        assert_eq!(parsed.base_url.unwrap(), "https://petstore.example.com/v1");
        assert_eq!(parsed.requests.len(), 2);
        assert_eq!(parsed.requests[0].group, Some("Pets".to_string()));
        assert_eq!(parsed.requests[0].file_name, Some("Pets/GET_pets.json".to_string()));

        // 模拟用户在本地调试过 /pets GET 接口，修改了 limit 参数为 50，并自定义了一个 Header
        let mut user_req = parsed.requests[0].clone();
        user_req.query_params[0].value = "50".to_string();
        user_req.headers.push(KeyValueItem {
            id: "custom_h".to_string(),
            key: "X-Debug-Mode".to_string(),
            value: "true".to_string(),
            enabled: true,
            description: None,
            inherited_from: None,
        });

        // 模拟本地还有一个老接口 /old-api，后来后端删除了它
        let old_req = SavedRequest {
            id: "old_api".to_string(),
            name: "老旧接口".to_string(),
            method: "GET".to_string(),
            path: "/old-api".to_string(),
            path_params: vec![],
            query_params: vec![],
            headers: vec![],
            body_type: "none".to_string(),
            body_content: "".to_string(),
            sub_project_id: None,
            file_name: Some("old_api.json".to_string()),
            group: None,
        };

        let existing = vec![user_req, old_req];

        // 执行 Smart Merge 刷新
        let merge_res = smart_merge(&existing, parsed.requests);

        // 验证：
        // 1. 总数应该为 3 (更新 1 个，新增 1 个 POST /pets，已下线 1 个 /old-api)
        assert_eq!(merge_res.stats.updated, 1);
        assert_eq!(merge_res.stats.added, 1);
        assert_eq!(merge_res.stats.deprecated, 1);

        // 2. 检查更新后的 GET /pets，用户填写的 limit: 50 和自定义 Header 依然完好无损！
        let merged_get = merge_res
            .requests
            .iter()
            .find(|r| r.path == "/pets" && r.method == "GET")
            .unwrap();
        assert_eq!(merged_get.query_params[0].value, "50");
        assert!(merged_get
            .headers
            .iter()
            .any(|h| h.key == "X-Debug-Mode" && h.value == "true"));

        // 3. 检查已删除的老接口，没有被删除，而是被打上了 [已下线] 标记
        let merged_old = merge_res
            .requests
            .iter()
            .find(|r| r.path == "/old-api")
            .unwrap();
        assert!(merged_old.name.contains("[已下线]"));
    }
}
