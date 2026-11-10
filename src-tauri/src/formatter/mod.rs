/// 基于 Rust 原生 serde_json 进行高性能 JSON 格式化与压缩。
/// 未来可扩展 XML / YAML 等格式化器。

pub fn format_json(raw: &str) -> Result<String, String> {
    let value: serde_json::Value =
        serde_json::from_str(raw).map_err(|e| format!("JSON 语法解析错误: {}", e))?;
    serde_json::to_string_pretty(&value).map_err(|e| format!("格式化序列化失败: {}", e))
}

pub fn minify_json(raw: &str) -> Result<String, String> {
    let value: serde_json::Value =
        serde_json::from_str(raw).map_err(|e| format!("JSON 语法解析错误: {}", e))?;
    serde_json::to_string(&value).map_err(|e| format!("压缩序列化失败: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_and_minify_preserves_large_integers() {
        let raw = r#"{"id":9007199254740993,"name":"justapi"}"#;
        let pretty = format_json(raw).unwrap();
        assert!(pretty.contains("9007199254740993"));
        let mini = minify_json(&pretty).unwrap();
        assert_eq!(mini, raw);
    }
}

