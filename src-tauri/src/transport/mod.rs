use crate::domain::{CookieItem, HttpRequestPayload, HttpResponsePayload};
use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue, CONTENT_LENGTH, CONTENT_TYPE},
    Method,
};
use std::collections::{HashMap, VecDeque};
use std::future::Future;
use std::pin::Pin;
use std::str::FromStr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::task::AbortHandle;

const MAX_CACHED_RESPONSES: usize = 20;
const MAX_CACHED_TOTAL_BYTES: usize = 64 * 1024 * 1024; // 64 MB cap

/// 传输层抽象 Trait：便于未来扩展 Mock 传输、协议扩展或独立 CLI Runner
pub trait HttpTransport: Send + Sync {
    fn execute<'a>(
        &'a self,
        request_id: &'a str,
        payload: HttpRequestPayload,
    ) -> Pin<Box<dyn Future<Output = Result<HttpResponsePayload, String>> + Send + 'a>>;
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct ClientCacheKey {
    disable_ssl: bool,
    proxy_url: Option<String>,
}

#[derive(Default)]
struct ResponseByteCache {
    entries: HashMap<String, Vec<u8>>,
    order: VecDeque<String>,
    total_bytes: usize,
    latest: Option<Vec<u8>>,
}

impl ResponseByteCache {
    fn insert(&mut self, request_id: String, bytes: Vec<u8>) {
        self.latest = Some(bytes.clone());

        if bytes.len() > MAX_CACHED_TOTAL_BYTES {
            return;
        }

        if let Some(old) = self.entries.remove(&request_id) {
            self.total_bytes = self.total_bytes.saturating_sub(old.len());
            self.order.retain(|id| id != &request_id);
        }

        while (self.order.len() >= MAX_CACHED_RESPONSES
            || self.total_bytes + bytes.len() > MAX_CACHED_TOTAL_BYTES)
            && !self.order.is_empty()
        {
            if let Some(oldest_id) = self.order.pop_front() {
                if let Some(removed) = self.entries.remove(&oldest_id) {
                    self.total_bytes = self.total_bytes.saturating_sub(removed.len());
                }
            }
        }

        self.total_bytes += bytes.len();
        self.order.push_back(request_id.clone());
        self.entries.insert(request_id, bytes);
    }

    fn get(&self, request_id: Option<&str>) -> Option<Vec<u8>> {
        if let Some(id) = request_id {
            if let Some(bytes) = self.entries.get(id) {
                return Some(bytes.clone());
            }
        }
        self.latest.clone()
    }
}

struct InFlightGuard {
    in_flight: Arc<Mutex<HashMap<String, AbortHandle>>>,
    request_id: String,
}

impl Drop for InFlightGuard {
    fn drop(&mut self) {
        if let Ok(mut map) = self.in_flight.lock() {
            map.remove(&self.request_id);
        }
    }
}

/// 基于 reqwest 的连接池化原生传输实现
#[derive(Default)]
pub struct ReqwestTransport {
    clients: Mutex<HashMap<ClientCacheKey, reqwest::Client>>,
    in_flight: Arc<Mutex<HashMap<String, AbortHandle>>>,
    response_cache: Mutex<ResponseByteCache>,
}

impl ReqwestTransport {
    pub fn new() -> Self {
        Self::default()
    }

    fn get_or_build_client(
        &self,
        disable_ssl: bool,
        proxy_url: Option<&str>,
    ) -> Result<reqwest::Client, String> {
        let normalized_proxy = proxy_url
            .map(|p| p.trim().to_string())
            .filter(|p| !p.is_empty());

        let key = ClientCacheKey {
            disable_ssl,
            proxy_url: normalized_proxy.clone(),
        };

        {
            let guard = self.clients.lock().unwrap();
            if let Some(existing) = guard.get(&key) {
                return Ok(existing.clone());
            }
        }

        let mut builder = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::limited(10))
            .pool_max_idle_per_host(8);

        if disable_ssl {
            builder = builder.danger_accept_invalid_certs(true);
        }

        if let Some(ref proxy_str) = normalized_proxy {
            let proxy = reqwest::Proxy::all(proxy_str)
                .map_err(|e| format!("配置代理失败: {}", e))?;
            builder = builder.proxy(proxy);
        }

        let client = builder
            .build()
            .map_err(|e| format!("初始化网络客户端失败: {}", e))?;

        let mut guard = self.clients.lock().unwrap();
        let entry = guard.entry(key).or_insert_with(|| client.clone());
        Ok(entry.clone())
    }

    /// 异步执行请求（注册 AbortHandle，支持随时取消）
    pub async fn send_cancellable(
        &self,
        request_id: String,
        payload: HttpRequestPayload,
    ) -> Result<HttpResponsePayload, String> {
        let client = self.get_or_build_client(
            payload.dangerously_disable_ssl.unwrap_or(false),
            payload.proxy_url.as_deref(),
        )?;

        let req_id_for_task = request_id.clone();
        let task = tokio::spawn(async move {
            execute_with_client(&client, &req_id_for_task, payload).await
        });

        {
            let mut map = self.in_flight.lock().unwrap();
            map.insert(request_id.clone(), task.abort_handle());
        }
        let _guard = InFlightGuard {
            in_flight: Arc::clone(&self.in_flight),
            request_id: request_id.clone(),
        };

        match task.await {
            Ok(Ok((resp, raw_bytes))) => {
                if let Ok(mut cache) = self.response_cache.lock() {
                    cache.insert(request_id, raw_bytes);
                }
                Ok(resp)
            }
            Ok(Err(e)) => Err(e),
            Err(join_err) => {
                if join_err.is_cancelled() {
                    Err("请求已由用户手动取消 (Request Cancelled)".to_string())
                } else {
                    Err(format!("任务执行异常: {}", join_err))
                }
            }
        }
    }

    pub fn cancel(&self, request_id: &str) -> bool {
        let mut map = self.in_flight.lock().unwrap();
        if let Some(handle) = map.remove(request_id) {
            handle.abort();
            true
        } else {
            false
        }
    }

    pub fn get_cached_response_bytes(&self, request_id: Option<&str>) -> Option<Vec<u8>> {
        self.response_cache
            .lock()
            .ok()
            .and_then(|cache| cache.get(request_id))
    }
}

impl HttpTransport for ReqwestTransport {
    fn execute<'a>(
        &'a self,
        request_id: &'a str,
        payload: HttpRequestPayload,
    ) -> Pin<Box<dyn Future<Output = Result<HttpResponsePayload, String>> + Send + 'a>> {
        let id = request_id.to_string();
        Box::pin(async move { self.send_cancellable(id, payload).await })
    }
}

pub fn encode_base64(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    if input.is_empty() {
        return String::new();
    }
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;

        out.push(TABLE[((n >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((n >> 12) & 0x3F) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((n >> 6) & 0x3F) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(n & 0x3F) as usize] as char
        } else {
            '='
        });
    }
    out
}

pub fn detect_image_content_type(content_type: Option<&str>, raw_bytes: &[u8]) -> Option<String> {
    let raw_mime = content_type
        .and_then(|ct| ct.split(';').next())
        .map(|m| m.trim().to_ascii_lowercase())
        .unwrap_or_default();

    if raw_mime.starts_with("image/") {
        return Some(raw_mime);
    }

    let allow_sniff = raw_mime.is_empty()
        || raw_mime == "application/octet-stream"
        || raw_mime == "binary/octet-stream";

    if !allow_sniff || raw_bytes.is_empty() {
        return None;
    }

    if raw_bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some("image/png".to_string());
    }
    if raw_bytes.len() >= 3 && raw_bytes[0] == 0xFF && raw_bytes[1] == 0xD8 && raw_bytes[2] == 0xFF {
        return Some("image/jpeg".to_string());
    }
    if raw_bytes.starts_with(b"GIF87a") || raw_bytes.starts_with(b"GIF89a") {
        return Some("image/gif".to_string());
    }
    if raw_bytes.len() >= 12 && &raw_bytes[0..4] == b"RIFF" && &raw_bytes[8..12] == b"WEBP" {
        return Some("image/webp".to_string());
    }
    if raw_bytes.len() >= 14 && &raw_bytes[0..2] == b"BM" && raw_bytes[6..10] == [0, 0, 0, 0] {
        return Some("image/bmp".to_string());
    }
    if raw_bytes.len() >= 6 && raw_bytes[0..4] == [0x00, 0x00, 0x01, 0x00] {
        return Some("image/x-icon".to_string());
    }
    if let Ok(text) = std::str::from_utf8(raw_bytes) {
        let trimmed = text.trim_start();
        if trimmed.starts_with("<svg") || (trimmed.starts_with("<?xml") && trimmed.contains("<svg")) {
            return Some("image/svg+xml".to_string());
        }
    }

    None
}

pub fn build_response_body_payload(
    content_type: Option<String>,
    raw_bytes: &[u8],
) -> (String, Option<String>, Option<String>) {
    if let Some(detected_mime) = detect_image_content_type(content_type.as_deref(), raw_bytes) {
        let is_svg = detected_mime == "image/svg+xml";
        let effective_content_type = match content_type {
            Some(ref ct) if ct.to_ascii_lowercase().contains("image/") => content_type,
            _ => Some(detected_mime),
        };
        let body = if is_svg {
            String::from_utf8_lossy(raw_bytes).to_string()
        } else {
            String::new()
        };
        let body_base64 = Some(encode_base64(raw_bytes));
        return (body, body_base64, effective_content_type);
    }

    let body = String::from_utf8_lossy(raw_bytes).to_string();
    (body, None, content_type)
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

/// 针对 HTTP 请求头部和载荷进行规范化与 Content-Length 精准重算
pub fn sanitize_headers_and_recalc_content_length(
    header_map: &mut HeaderMap,
    method: &Method,
    body_type: &str,
    body_len: Option<usize>,
) {
    match body_type {
        "json" | "raw" => {
            if let Some(len) = body_len {
                header_map.insert(CONTENT_LENGTH, HeaderValue::from(len as u64));
            } else {
                header_map.remove(CONTENT_LENGTH);
            }
        }
        "x-www-form-urlencoded" | "form-data" => {
            header_map.remove(CONTENT_LENGTH);
            header_map.remove(CONTENT_TYPE);
        }
        _ => {
            if *method == Method::GET || *method == Method::HEAD {
                header_map.remove(CONTENT_LENGTH);
            } else if header_map.contains_key(CONTENT_LENGTH) {
                header_map.insert(CONTENT_LENGTH, HeaderValue::from(0u64));
            }
        }
    }
}

async fn execute_with_client(
    client: &reqwest::Client,
    request_id: &str,
    payload: HttpRequestPayload,
) -> Result<(HttpResponsePayload, Vec<u8>), String> {
    let method = Method::from_str(&payload.method.to_uppercase())
        .map_err(|_| format!("不支持的 HTTP 方法: {}", payload.method))?;

    let mut request_builder = client
        .request(method.clone(), &payload.url)
        .timeout(Duration::from_millis(payload.timeout_ms.unwrap_or(30000)));

    let mut header_map = HeaderMap::new();
    for (key, val) in &payload.headers {
        if let (Ok(h_name), Ok(h_val)) = (HeaderName::from_str(key), HeaderValue::from_str(val)) {
            header_map.append(h_name, h_val);
        }
    }

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
                    .filter(|f| f.enabled && !f.is_file)
                    .map(|f| (f.key, f.value))
                    .collect();
                request_builder = request_builder.form(&params);
            }
        }
        "form-data" => {
            if let Some(fields) = payload.form_fields {
                let mut form = reqwest::multipart::Form::new();
                for field in fields.into_iter().filter(|f| f.enabled) {
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

    sanitize_headers_and_recalc_content_length(
        &mut header_map,
        &method,
        &payload.body_type,
        body_bytes.as_ref().map(|b| b.len()),
    );

    request_builder = request_builder.headers(header_map);
    if let Some(bytes) = body_bytes {
        request_builder = request_builder.body(bytes);
    }

    let start_time = Instant::now();
    let response = request_builder.send().await.map_err(|e| {
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
    let status_text = response
        .status()
        .canonical_reason()
        .unwrap_or("")
        .to_string();

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
        .map_err(|e| format!("读取响应流失败: {}", e))?
        .to_vec();

    let size_bytes = raw_bytes.len();
    let (body, body_base64, content_type) = build_response_body_payload(content_type, &raw_bytes);

    Ok((
        HttpResponsePayload {
            request_id: request_id.to_string(),
            status,
            status_text,
            duration_ms,
            size_bytes,
            headers: resp_headers,
            cookies,
            body,
            body_base64,
            content_type,
        },
        raw_bytes,
    ))
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
        headers.insert(CONTENT_LENGTH, HeaderValue::from_static("99999"));

        let method = Method::POST;
        let json_body = r#"{"name":"测试API"}"#;
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
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let method = Method::POST;
        sanitize_headers_and_recalc_content_length(&mut headers, &method, "form-data", None);
        assert!(!headers.contains_key(CONTENT_LENGTH));
        assert!(!headers.contains_key(CONTENT_TYPE));

        headers.insert(CONTENT_LENGTH, HeaderValue::from_static("123"));
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        sanitize_headers_and_recalc_content_length(
            &mut headers,
            &method,
            "x-www-form-urlencoded",
            None,
        );
        assert!(!headers.contains_key(CONTENT_LENGTH));
        assert!(!headers.contains_key(CONTENT_TYPE));
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

    #[test]
    fn test_response_byte_cache_eviction_and_lookup() {
        let mut cache = ResponseByteCache::default();
        cache.insert("req-1".to_string(), b"first".to_vec());
        cache.insert("req-2".to_string(), b"second".to_vec());

        assert_eq!(cache.get(Some("req-1")), Some(b"first".to_vec()));
        assert_eq!(cache.get(Some("req-2")), Some(b"second".to_vec()));
        assert_eq!(cache.get(None), Some(b"second".to_vec()));
        assert_eq!(cache.get(Some("missing")), Some(b"second".to_vec()));
    }

    #[test]
    fn test_client_pool_reuses_clients_by_config() {
        let transport = ReqwestTransport::new();
        let _c1 = transport.get_or_build_client(false, None).unwrap();
        let _c2 = transport.get_or_build_client(false, Some("")).unwrap();
        let _c3 = transport.get_or_build_client(true, None).unwrap();
        let guard = transport.clients.lock().unwrap();
        assert_eq!(guard.len(), 2);
    }

    #[test]
    fn test_encode_base64_rfc4648() {
        assert_eq!(encode_base64(b""), "");
        assert_eq!(encode_base64(b"f"), "Zg==");
        assert_eq!(encode_base64(b"fo"), "Zm8=");
        assert_eq!(encode_base64(b"foo"), "Zm9v");
        assert_eq!(encode_base64(b"foobar"), "Zm9vYmFy");
        assert_eq!(
            encode_base64(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]),
            "iVBORw0KGgo="
        );
    }

    #[test]
    fn test_build_response_body_payload_for_binary_images_and_svg() {
        let png_bytes = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0xFF];
        let (body, b64, ct) =
            build_response_body_payload(Some("image/png; charset=binary".to_string()), &png_bytes);
        assert_eq!(body, "");
        assert_eq!(b64, Some(encode_base64(&png_bytes)));
        assert_eq!(ct.as_deref(), Some("image/png; charset=binary"));

        // 无 header 或 application/octet-stream 时基于魔数识别图片
        let jpeg_bytes = vec![0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10];
        let (j_body, j_b64, j_ct) =
            build_response_body_payload(Some("application/octet-stream".to_string()), &jpeg_bytes);
        assert_eq!(j_body, "");
        assert_eq!(j_b64, Some(encode_base64(&jpeg_bytes)));
        assert_eq!(j_ct.as_deref(), Some("image/jpeg"));

        // SVG 同时保留 UTF-8 源码与 Base64 预览字段
        let svg_bytes = br#"<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>"#;
        let (s_body, s_b64, s_ct) =
            build_response_body_payload(Some("image/svg+xml; charset=utf-8".to_string()), svg_bytes);
        assert!(s_body.contains("<svg"));
        assert_eq!(s_b64, Some(encode_base64(svg_bytes)));
        assert_eq!(s_ct.as_deref(), Some("image/svg+xml; charset=utf-8"));

        // 普通 JSON 不触发图片 base64
        let json_bytes = br#"{"ok":true}"#;
        let (t_body, t_b64, t_ct) =
            build_response_body_payload(Some("application/json".to_string()), json_bytes);
        assert_eq!(t_body, r#"{"ok":true}"#);
        assert_eq!(t_b64, None);
        assert_eq!(t_ct.as_deref(), Some("application/json"));
    }
}

