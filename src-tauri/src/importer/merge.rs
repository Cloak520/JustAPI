use crate::domain::{MergeResult, MergeStats, SavedRequest};
use std::collections::{HashMap, HashSet};

/// 通用无损增量合并引擎（独立于导入格式，可用于 OpenAPI / Postman / Insomnia）
/// 1. 已有接口：无损保留用户已填好的具体测试参数 Value、自定义 Header、Body 内容与表单字段
/// 2. 新增接口：直接追加
/// 3. 已删除接口：坚决不物理删除本地文件，打上 [已下线] 标记，保护测试数据
pub fn smart_merge(
    existing_requests: &[SavedRequest],
    new_requests: Vec<SavedRequest>,
) -> MergeResult {
    let mut stats = MergeStats::default();
    let mut merged = Vec::new();

    let mut existing_map: HashMap<String, SavedRequest> = HashMap::new();
    for req in existing_requests {
        let key = format!("{} {}", req.method.to_uppercase(), req.path.trim());
        existing_map.insert(key, req.clone());
    }

    let mut matched_existing_keys = HashSet::new();

    for mut new_req in new_requests {
        let key = format!("{} {}", new_req.method.to_uppercase(), new_req.path.trim());

        if let Some(existing) = existing_map.get(&key) {
            matched_existing_keys.insert(key);

            // 1. 无损保留 Query Params 中用户填写的测试值与开关状态
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

            let new_param_keys: HashSet<String> =
                new_req.query_params.iter().map(|p| p.key.clone()).collect();
            for ep in &existing.query_params {
                if !new_param_keys.contains(&ep.key) {
                    new_req.query_params.push(ep.clone());
                }
            }

            // 2. 无损保留 Path Variables
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
            let new_header_keys: HashSet<String> =
                new_req.headers.iter().map(|h| h.key.to_lowercase()).collect();
            for eh in &existing.headers {
                if !new_header_keys.contains(&eh.key.to_lowercase()) {
                    new_req.headers.push(eh.clone());
                }
            }

            // 4. 无损保留 Body 内容与表单字段（忽略前端标准化产生的纯空占位行）
            if !existing.body_content.trim().is_empty() {
                new_req.body_content = existing.body_content.clone();
                new_req.body_type = existing.body_type.clone();
            }
            let has_meaningful_form_fields = existing
                .form_fields
                .iter()
                .any(|f| !f.key.trim().is_empty() || !f.value.trim().is_empty());
            if has_meaningful_form_fields {
                new_req.form_fields = existing.form_fields.clone();
            }

            // 4.5 无损保留扩展字段（如断言、脚本等插件数据）
            if existing.extensions.is_some() && new_req.extensions.is_none() {
                new_req.extensions = existing.extensions.clone();
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
            stats.added += 1;
            merged.push(new_req);
        }
    }

    // 6. 检查已下线的接口
    for (key, existing) in existing_map {
        if !matched_existing_keys.contains(&key) {
            let mut deprecated_req = existing.clone();
            if !deprecated_req.name.starts_with("[已下线]")
                && !deprecated_req.name.starts_with("[Deprecated]")
            {
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
    use crate::domain::{CURRENT_SCHEMA_VERSION, KeyValueItem};

    fn make_req(id: &str, name: &str, method: &str, path: &str) -> SavedRequest {
        SavedRequest {
            schema_version: CURRENT_SCHEMA_VERSION,
            id: id.to_string(),
            name: name.to_string(),
            method: method.to_string(),
            path: path.to_string(),
            path_params: vec![],
            query_params: vec![],
            headers: vec![],
            body_type: "none".to_string(),
            body_content: "".to_string(),
            form_fields: vec![],
            sub_project_id: None,
            file_name: Some(format!("{}.json", id)),
            group: None,
            extensions: None,
        }
    }

    #[test]
    fn test_smart_merge_preserves_user_edits_and_marks_deprecated() {
        let mut parsed_get = make_req("GET_pets", "获取宠物列表", "GET", "/pets");
        parsed_get.group = Some("Pets".to_string());
        parsed_get.file_name = Some("Pets/GET_pets.json".to_string());
        parsed_get.query_params.push(KeyValueItem {
            id: "query_limit".to_string(),
            key: "limit".to_string(),
            value: "10".to_string(),
            enabled: true,
            description: Some("条数".to_string()),
            inherited_from: None,
            is_inherited_override: None,
        });

        let mut parsed_post = make_req("POST_pets", "创建宠物", "POST", "/pets");
        parsed_post.group = Some("Pets".to_string());
        parsed_post.file_name = Some("Pets/POST_pets.json".to_string());
        parsed_post.body_type = "json".to_string();

        let mut user_req = parsed_get.clone();
        user_req.query_params[0].value = "50".to_string();
        user_req.headers.push(KeyValueItem {
            id: "custom_h".to_string(),
            key: "X-Debug-Mode".to_string(),
            value: "true".to_string(),
            enabled: true,
            description: None,
            inherited_from: None,
            is_inherited_override: None,
        });

        let old_req = make_req("old_api", "老旧接口", "GET", "/old-api");

        let existing = vec![user_req, old_req];
        let merge_res = smart_merge(&existing, vec![parsed_get, parsed_post]);

        assert_eq!(merge_res.stats.updated, 1);
        assert_eq!(merge_res.stats.added, 1);
        assert_eq!(merge_res.stats.deprecated, 1);

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

        let merged_old = merge_res
            .requests
            .iter()
            .find(|r| r.path == "/old-api")
            .unwrap();
        assert!(merged_old.name.contains("[已下线]"));
    }

    #[test]
    fn test_smart_merge_ignores_empty_placeholder_form_fields() {
        use crate::domain::FormField;

        let mut existing_req = make_req("POST_upload", "上传接口", "POST", "/upload");
        existing_req.form_fields = vec![FormField {
            id: Some("empty_1".to_string()),
            key: "".to_string(),
            value: "".to_string(),
            is_file: false,
            enabled: true,
        }];

        let mut incoming_req = make_req("POST_upload", "上传接口", "POST", "/upload");
        incoming_req.body_type = "form-data".to_string();
        incoming_req.form_fields = vec![FormField {
            id: Some("form_file".to_string()),
            key: "file".to_string(),
            value: "".to_string(),
            is_file: true,
            enabled: true,
        }];

        let merge_res = smart_merge(&[existing_req], vec![incoming_req]);
        assert_eq!(merge_res.requests.len(), 1);
        assert_eq!(merge_res.requests[0].body_type, "form-data");
        assert_eq!(merge_res.requests[0].form_fields.len(), 1);
        assert_eq!(merge_res.requests[0].form_fields[0].key, "file");
        assert!(merge_res.requests[0].form_fields[0].is_file);
    }
}
