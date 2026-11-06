export interface HeaderSuggestion {
  value: string
  desc?: string
}

export const COMMON_HEADER_SUGGESTIONS: HeaderSuggestion[] = [
  { value: 'Content-Type', desc: '资源媒体类型 (application/json, 等)' },
  { value: 'Authorization', desc: '认证凭证 (Bearer token, Basic auth)' },
  { value: 'Accept', desc: '客户端期望的内容类型' },
  { value: 'User-Agent', desc: '客户端应用与操作系统标识' },
  { value: 'Cookie', desc: '客户端状态 Cookie' },
  { value: 'Cache-Control', desc: '缓存控制指令 (no-cache, etc.)' },
  { value: 'Origin', desc: '跨域资源请求来源' },
  { value: 'Referer', desc: '来源页面地址' },
  { value: 'Host', desc: '目标主机域名及端口' },
  { value: 'X-Requested-With', desc: 'AJAX / XMLHttpRequest 标头' },
  { value: 'X-Api-Key', desc: 'API 密钥凭证' },
  { value: 'X-Token', desc: '自定义鉴权 Token' },
  { value: 'X-Forwarded-For', desc: '客户端真实 IP 链' },
  { value: 'X-Forwarded-Proto', desc: '原始协议 (http / https)' },
  { value: 'Accept-Encoding', desc: '支持的内容压缩编码 (gzip, br)' },
  { value: 'Accept-Language', desc: '客户端首选自然语言' },
  { value: 'If-None-Match', desc: '条件请求 ETag 验证' },
  { value: 'If-Modified-Since', desc: '条件请求修改时间验证' },
  { value: 'Access-Control-Allow-Origin', desc: 'CORS 允许跨域源' },
  { value: 'Access-Control-Allow-Headers', desc: 'CORS 允许自定义标头' },
  { value: 'Access-Control-Allow-Methods', desc: 'CORS 允许 HTTP 请求方法' },
  { value: 'Connection', desc: 'TCP 连接维持指令 (keep-alive, close)' }
]

export const COMMON_CONTENT_TYPE_SUGGESTIONS: HeaderSuggestion[] = [
  { value: 'application/json', desc: 'JSON 结构化格式' },
  { value: 'application/x-www-form-urlencoded', desc: '经典表单 URL 键值编码' },
  { value: 'multipart/form-data', desc: '多部分表单 (常用于文件上传)' },
  { value: 'text/plain', desc: '普通纯文本' },
  { value: 'text/html', desc: 'HTML 网页文档' },
  { value: 'application/xml', desc: 'XML 结构化数据' },
  { value: 'application/octet-stream', desc: '任意二进制流 (文件下载/上传)' }
]

export const COMMON_AUTH_SUGGESTIONS: HeaderSuggestion[] = [
  { value: 'Bearer ', desc: 'JWT / OAuth Bearer 令牌' },
  { value: 'Basic ', desc: 'HTTP Basic 认证 (base64 用户名:密码)' },
  { value: 'Digest ', desc: 'HTTP 摘要认证' }
]

export const COMMON_ACCEPT_SUGGESTIONS: HeaderSuggestion[] = [
  { value: '*/*', desc: '接受任何数据类型' },
  { value: 'application/json', desc: '优先期望返回 JSON' },
  { value: 'text/html,application/xhtml+xml', desc: '优先期望返回 HTML 页面' },
  { value: 'text/plain', desc: '优先期望返回纯文本' }
]

/**
 * 根据 Header Key 返回对应 Value 的智能联想建议
 */
export function getHeaderValueSuggestions(headerKey: string): HeaderSuggestion[] {
  const key = headerKey.trim().toLowerCase()
  if (key === 'content-type') {
    return COMMON_CONTENT_TYPE_SUGGESTIONS
  }
  if (key === 'authorization') {
    return COMMON_AUTH_SUGGESTIONS
  }
  if (key === 'accept') {
    return COMMON_ACCEPT_SUGGESTIONS
  }
  return []
}

