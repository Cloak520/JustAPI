use reqwest::{header::{HeaderMap, HeaderName, HeaderValue}, Method};
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use std::time::{Duration, Instant};

const MAX_PREVIEW_BYTES: usize = 1024 * 1024; // 1 MB
const LARGE_RESPONSE_THRESHOLD: usize = 5 * 1024 * 1024; // 5 MB

#[derive(Debug, Deserialize)]
pub struct FormField {
    pub key: String,
    pub value: String,
    pub is_file: bool,
}

#[derive(Debug, Deserialize)]
pub struct HttpRequestPayload {
    pub url: String,
    pub method: String,
    pub headers: Vec<(String, String)>,
    pub body_type: String,
    pub body_content: Option<String>,
    pub form_fields: Option<Vec<FormField>>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct HttpResponsePayload {
    pub status: u16,
    pub status_text: String,
    pub duration_ms: u64,
    pub size_bytes: usize,
    pub headers: Vec<(String, String)>,
    pub body: String,
    pub is_truncated: bool,
    pub content_type: Option<String>,
}

pub async fn execute_request(payload: HttpRequestPayload) -> Result<HttpResponsePayload, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(payload.timeout_ms.unwrap_or(30000)))
        // 允许重定向
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| format!("初始化网络客户端失败: {}", e))?;

    let method = Method::from_str(&payload.method.to_uppercase())
        .map_err(|_| format!("不支持的 HTTP 方法: {}", payload.method))?;

    let mut request_builder = client.request(method, &payload.url);

    // 组装 Headers
    let mut header_map = HeaderMap::new();
    for (key, val) in payload.headers {
        if let (Ok(h_name), Ok(h_val)) = (HeaderName::from_str(&key), HeaderValue::from_str(&val)) {
            header_map.append(h_name, h_val);
        }
    }
    request_builder = request_builder.headers(header_map);

    // 组装 Body
    match payload.body_type.as_str() {
        "json" => {
            if let Some(content) = payload.body_content {
                request_builder = request_builder
                    .header(reqwest::header::CONTENT_TYPE, "application/json")
                    .body(content);
            }
        }
        "raw" => {
            if let Some(content) = payload.body_content {
                request_builder = request_builder.body(content);
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
    let mut content_type = None;
    for (k, v) in response.headers() {
        let key_str = k.as_str().to_string();
        let val_str = v.to_str().unwrap_or("").to_string();
        if key_str.eq_ignore_ascii_case("content-type") {
            content_type = Some(val_str.clone());
        }
        resp_headers.push((key_str, val_str));
    }

    let raw_bytes = response
        .bytes()
        .await
        .map_err(|e| format!("读取响应流失败: {}", e))?;

    let size_bytes = raw_bytes.len();
    let is_truncated = size_bytes > LARGE_RESPONSE_THRESHOLD;

    let body = if is_truncated {
        String::from_utf8_lossy(&raw_bytes[..MAX_PREVIEW_BYTES]).to_string()
    } else {
        String::from_utf8_lossy(&raw_bytes).to_string()
    };

    Ok(HttpResponsePayload {
        status,
        status_text,
        duration_ms,
        size_bytes,
        headers: resp_headers,
        body,
        is_truncated,
        content_type,
    })
}
