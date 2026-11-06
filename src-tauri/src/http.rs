use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue, CONTENT_LENGTH, CONTENT_TYPE},
    Method,
};
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// 缓存最近一次请求的原始二进制响应流，用于本地文件另存为
pub static LAST_RESPONSE_BYTES: Mutex<Option<Vec<u8>>> = Mutex::new(None);

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FormField {
    pub key: String,
    pub value: String,
    #[serde(alias = "is_file")]
    pub is_file: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequestPayload {
    pub url: String,
    pub method: String,
    pub headers: Vec<(String, String)>,
    #[serde(alias = "body_type")]
    pub body_type: String,
    #[serde(alias = "body_content")]
    pub body_content: Option<String>,
    #[serde(alias = "form_fields")]
    pub form_fields: Option<Vec<FormField>>,
    #[serde(alias = "timeout_ms")]
    pub timeout_ms: Option<u64>,
    #[serde(default, alias = "dangerously_disable_ssl")]
    pub dangerously_disable_ssl: Option<bool>,
    #[serde(default, alias = "proxy_url")]
    pub proxy_url: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CookieItem {
    pub name: String,
    pub value: String,
    pub domain: Option<String>,
    pub path: Option<String>,
    pub raw: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponsePayload {
    pub status: u16,
    pub status_text: String,
    pub duration_ms: u64,
    pub size_bytes: usize,
    pub headers: Vec<(String, String)>,
    pub cookies: Vec<CookieItem>,
    pub body: String,
    pub is_truncated: bool,
    pub content_type: Option<String>,
}

pub fn parse_set_cookie(raw: &str) -> Option<CookieItem> {
    let parts: Vec<&str> = raw.split(';').map(|s| s.trim()).collect();
    if parts.is_empty() {
        return None;
    }
    let first = parts[0];
    let eq_idx = first.find('=')?;
    let name = first[..eq_idx].trim().to_string();
    let value = first[eq_idx + 1..].trim().to_string();

    let mut domain = None;
    let mut path = None;

    for part in &parts[1..] {
        let lower = part.to_ascii_lowercase();
        if lower.starts_with("domain=") {
            domain = Some(part[7..].trim().to_string());
        } else if lower.starts_with("path=") {
            path = Some(part[5..].trim().to_string());
        }
    }

    Some(CookieItem {
        name,
        value,
        domain,
        path,
        raw: raw.to_string(),
    })
}

/// 针对 HTTP 请求头部和载荷进行规范化与 Content-Length 精准重算：
/// 1. 彻底解决手动传入或历史残留的 Content-Length 导致的连接超时与请求挂起（标大导致死等）。
/// 2. 避免中文及多字节 UTF-8 字符数 vs 字节数计算偏差。
/// 3. 清理 GET/HEAD 请求或 form-data / urlencoded 中冲突的旧 Content-Length。
pub fn sanitize_headers_and_recalc_content_length(
    header_map: &mut HeaderMap,
    method: &Method,
    body_type: &str,
    body_len: Option<usize>,
) {
    match body_type {
        "json" | "raw" => {
            if let Some(len) = body_len {
                // 强制重算覆盖为精确的 UTF-8 实际二进制字节长度
                header_map.insert(CONTENT_LENGTH, HeaderValue::from(len as u64));
            } else {
                header_map.remove(CONTENT_LENGTH);
            }
        }
        "x-www-form-urlencoded" | "form-data" => {
            // 表单或多部分主体由 reqwest 底层自动计算序列化边界和长度，清除可能冲突的手动旧值
            header_map.remove(CONTENT_LENGTH);
        }
        _ => {
            if *method == Method::GET || *method == Method::HEAD {
                // GET 与 HEAD 请求绝不可携带 Content-Length，避免服务端死等 Body 导致超时
                header_map.remove(CONTENT_LENGTH);
            } else if header_map.contains_key(CONTENT_LENGTH) {
                // 对于 POST/PUT 等空 Body 请求，若存在旧 Content-Length，校准为 0
                header_map.insert(CONTENT_LENGTH, HeaderValue::from(0u64));
            }
        }
    }
}

pub async fn execute_request(payload: HttpRequestPayload) -> Result<HttpResponsePayload, String> {
    let mut builder = reqwest::Client::builder()
        .timeout(Duration::from_millis(payload.timeout_ms.unwrap_or(30000)))
        .redirect(reqwest::redirect::Policy::limited(10));

    // SSL 证书校验忽略 (方便自签证书开发联调)
    if payload.dangerously_disable_ssl.unwrap_or(false) {
        builder = builder.danger_accept_invalid_certs(true);
    }

    // 轻量 HTTP 代理支持
    if let Some(proxy_str) = payload.proxy_url.as_ref().filter(|p| !p.trim().is_empty()) {
        let proxy = reqwest::Proxy::all(proxy_str.trim())
            .map_err(|e| format!("配置代理失败: {}", e))?;
        builder = builder.proxy(proxy);
    }

    let client = builder
        .build()
        .map_err(|e| format!("初始化网络客户端失败: {}", e))?;

    let method = Method::from_str(&payload.method.to_uppercase())
        .map_err(|_| format!("不支持的 HTTP 方法: {}", payload.method))?;

    let mut request_builder = client.request(method.clone(), &payload.url);

    // 组装 Headers
    let mut header_map = HeaderMap::new();
    for (key, val) in &payload.headers {
        if let (Ok(h_name), Ok(h_val)) = (HeaderName::from_str(key), HeaderValue::from_str(val)) {
            header_map.append(h_name, h_val);
        }
    }

    // 组装 Body 并准备用于重算 Content-Length 的字节流
    let mut body_bytes: Option<Vec<u8>> = None;
    match payload.body_type.as_str() {
        "json" => {
            if let Some(content) = payload.body_content {
                let bytes = content.into_bytes();
                if !header_map.contains_key(CONTENT_TYPE) {
                    header_map.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
                }
                body_bytes = Some(bytes);
            }
        }
        "raw" => {
            if let Some(content) = payload.body_content {
                body_bytes = Some(content.into_bytes());
            }
        }
        "x-www-form-urlencoded" => {
            if let Some(fields) = payload.form_fields {
                let params: Vec<(String, String)> = fields
                    .into_iter()
                    .filter(|f| !f.is_file)
                    .map(|f| (f.key, f.value))
                    .collect();
                request_builder = request_builder.form(&params);
            }
        }
        "form-data" => {
            if let Some(fields) = payload.form_fields {
                let mut form = reqwest::multipart::Form::new();
                for field in fields {
                    if field.is_file {
                        if let Ok(bytes) = std::fs::read(&field.value) {
                            let file_name = std::path::Path::new(&field.value)
                                .file_name()
                                .and_then(|n| n.to_str())
                                .unwrap_or("file")
                                .to_string();
                            let part = reqwest::multipart::Part::bytes(bytes).file_name(file_name);
                            form = form.part(field.key, part);
                        } else {
                            return Err(format!("无法读取上传文件: {}", field.value));
                        }
                    } else {
                        form = form.text(field.key, field.value);
                    }
                }
                request_builder = request_builder.multipart(form);
            }
        }
        _ => {}
    }

    // 核心重算逻辑：校准/覆盖/清除 Content-Length
    sanitize_headers_and_recalc_content_length(
        &mut header_map,
        &method,
        &payload.body_type,
        body_bytes.as_ref().map(|b| b.len()),
    );

    // 将重算校准后的 Headers 挂载至 RequestBuilder
    request_builder = request_builder.headers(header_map);

    // 如果是 json 或 raw，将实际二进制字节流挂载至 Body
    if let Some(bytes) = body_bytes {
        request_builder = request_builder.body(bytes);
    }

    let start_time = Instant::now();
    let response = request_builder
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "请求超时，请检查网络或服务端响应时间".to_string()
            } else if e.is_connect() {
                "无法连接到目标服务器 (Connection Refused / DNS Error)".to_string()
            } else {
                format!("请求发送失败: {}", e)
            }
        })?;

    let duration_ms = start_time.elapsed().as_millis() as u64;
    let status = response.status().as_u16();
    let status_text = response.status().canonical_reason().unwrap_or("").to_string();

    let mut resp_headers = Vec::new();
    let mut cookies = Vec::new();
    let mut content_type = None;

    for (k, v) in response.headers() {
        let key_str = k.as_str().to_string();
        let val_str = v.to_str().unwrap_or("").to_string();
        if key_str.eq_ignore_ascii_case("content-type") {
            content_type = Some(val_str.clone());
        }
        if key_str.eq_ignore_ascii_case("set-cookie") {
            if let Some(cookie) = parse_set_cookie(&val_str) {
                cookies.push(cookie);
            }
        }
        resp_headers.push((key_str, val_str));
    }

    let raw_bytes = response
        .bytes()
        .await
        .map_err(|e| format!("读取响应流失败: {}", e))?;

    let size_bytes = raw_bytes.len();
    let is_truncated = false;

    // 缓存原始响应字节，供另存为本地文件功能使用（支持超大文件及二进制内容无损写入）
    if let Ok(mut lock) = LAST_RESPONSE_BYTES.lock() {
        *lock = Some(raw_bytes.to_vec());
    }

    let body = String::from_utf8_lossy(&raw_bytes).to_string();

    Ok(HttpResponsePayload {
        status,
        status_text,
        duration_ms,
        size_bytes,
        headers: resp_headers,
        cookies,
        body,
        is_truncated,
        content_type,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_set_cookie() {
        let raw = "session_id=abc123xyz; Domain=api.example.com; Path=/; Secure; HttpOnly";
        let cookie = parse_set_cookie(raw).unwrap();
        assert_eq!(cookie.name, "session_id");
        assert_eq!(cookie.value, "abc123xyz");
        assert_eq!(cookie.domain, Some("api.example.com".to_string()));
        assert_eq!(cookie.path, Some("/".to_string()));
    }

    #[test]
    fn test_recalc_content_length_for_json_with_utf8() {
        let mut headers = HeaderMap::new();
        // 模拟用户传入了一个错误的旧值 (例如 99999，会导致服务端死等挂起超时)
        headers.insert(CONTENT_LENGTH, HeaderValue::from_static("99999"));

        let method = Method::POST;
        let json_body = r#"{"name":"测试API"}"#; // "测试API" 占 3*2+3 = 9 字节，加上前后 16 字节共 25 字节
        let expected_bytes_len = json_body.as_bytes().len();

        sanitize_headers_and_recalc_content_length(
            &mut headers,
            &method,
            "json",
            Some(expected_bytes_len),
        );

        let cl = headers.get(CONTENT_LENGTH).unwrap().to_str().unwrap();
        assert_eq!(cl, expected_bytes_len.to_string());
    }

    #[test]
    fn test_remove_content_length_on_get_request() {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_LENGTH, HeaderValue::from_static("50"));

        let method = Method::GET;
        sanitize_headers_and_recalc_content_length(&mut headers, &method, "none", None);

        assert!(!headers.contains_key(CONTENT_LENGTH));
    }

    #[test]
    fn test_remove_content_length_on_multipart_or_form() {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_LENGTH, HeaderValue::from_static("123"));

        let method = Method::POST;
        sanitize_headers_and_recalc_content_length(&mut headers, &method, "form-data", None);
        assert!(!headers.contains_key(CONTENT_LENGTH));

        headers.insert(CONTENT_LENGTH, HeaderValue::from_static("123"));
        sanitize_headers_and_recalc_content_length(&mut headers, &method, "x-www-form-urlencoded", None);
        assert!(!headers.contains_key(CONTENT_LENGTH));
    }

    #[test]
    fn test_empty_post_recalcs_content_length_to_zero() {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_LENGTH, HeaderValue::from_static("100"));

        let method = Method::POST;
        sanitize_headers_and_recalc_content_length(&mut headers, &method, "none", None);

        let cl = headers.get(CONTENT_LENGTH).unwrap().to_str().unwrap();
        assert_eq!(cl, "0");
    }
}
