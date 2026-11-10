pub mod merge;

use std::fs;
use std::path::Path;

const MAX_LOCAL_IMPORT_BYTES: u64 = 20 * 1024 * 1024; // 20 MB

/// 从远程 HTTP(S) URL 或本地文件路径读取原始规范文本（供集合导入插件解析使用）
pub async fn fetch_raw_source(source: &str) -> Result<String, String> {
    let trimmed = source.trim();
    if trimmed.is_empty() {
        return Err("导入源路径或 URL 不能为空".to_string());
    }

    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| format!("构建网络客户端失败: {}", e))?;
        let resp = client
            .get(trimmed)
            .header("Accept", "application/json, application/yaml, text/yaml, */*")
            .send()
            .await
            .map_err(|e| format!("请求文档失败 ({}): {}", trimmed, e))?;

        if !resp.status().is_success() {
            return Err(format!("拉取文档失败，状态码: {}", resp.status()));
        }

        resp.text()
            .await
            .map_err(|e| format!("读取文档流失败: {}", e))
    } else {
        let path = Path::new(trimmed);
        let meta = fs::metadata(path)
            .map_err(|e| format!("读取本地文档失败 ({}): {}", trimmed, e))?;
        if meta.len() > MAX_LOCAL_IMPORT_BYTES {
            return Err(format!(
                "本地文档体积 ({} bytes) 超过上限 ({} bytes)",
                meta.len(),
                MAX_LOCAL_IMPORT_BYTES
            ));
        }
        fs::read_to_string(path).map_err(|e| format!("读取本地文档失败 ({}): {}", trimmed, e))
    }
}

/// 将 JSON 或 YAML 文档内容解析为通用 JSON Value（供外置插件无第三方依赖读取 YAML 文档）
pub fn parse_json_or_yaml(raw_text: &str) -> Result<serde_json::Value, String> {
    serde_json::from_str(raw_text)
        .or_else(|_| serde_yaml::from_str(raw_text))
        .map_err(|e| format!("解析 JSON / YAML 文档失败: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_both_json_and_yaml_documents() {
        let json_doc = parse_json_or_yaml(r#"{"openapi":"3.0.0","info":{"title":"JSON API"}}"#).unwrap();
        assert_eq!(json_doc["info"]["title"], "JSON API");

        let yaml_doc = parse_json_or_yaml(
            "openapi: 3.0.1\ninfo:\n  title: YAML API\npaths:\n  /ping:\n    get:\n      summary: Ping\n",
        )
        .unwrap();
        assert_eq!(yaml_doc["info"]["title"], "YAML API");
        assert_eq!(yaml_doc["paths"]["/ping"]["get"]["summary"], "Ping");

        assert!(parse_json_or_yaml(":::not valid yaml or json::: [").is_err());
    }
}
