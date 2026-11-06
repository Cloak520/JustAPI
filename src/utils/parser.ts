import type { KeyValuePair } from '@/types'

/**
 * 将纯文本（多行 key: value 或 key=value）解析为 KeyValuePair 数组
 */
export function parseBulkTextToPairs(text: string, inheritedFrom?: 'project' | 'subproject'): KeyValuePair[] {
  if (!text.trim()) return []

  const lines = text.split('\n')
  const pairs: KeyValuePair[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    let key = ''
    let value = ''

    // 优先匹配冒号 (Headers 常用 Header-Key: Header-Value)
    const colonIndex = trimmed.indexOf(':')
    const equalIndex = trimmed.indexOf('=')

    if (colonIndex !== -1 && (equalIndex === -1 || colonIndex < equalIndex)) {
      key = trimmed.slice(0, colonIndex).trim()
      value = trimmed.slice(colonIndex + 1).trim()
    } else if (equalIndex !== -1) {
      key = trimmed.slice(0, equalIndex).trim()
      value = trimmed.slice(equalIndex + 1).trim()
    } else {
      key = trimmed
      value = ''
    }

    pairs.push({
      id: crypto.randomUUID(),
      key,
      value,
      enabled: true,
      inheritedFrom
    })
  }

  return pairs
}

/**
 * 将 KeyValuePair 数组转换为纯文本多行展示
 * format: 'colon' (Key: Value) 或 'equal' (key=value)
 */
export function formatPairsToBulkText(pairs: KeyValuePair[], format: 'colon' | 'equal' = 'colon'): string {
  const delimiter = format === 'colon' ? ': ' : '='
  return pairs
    .filter(p => p.enabled && (p.key.trim() || p.value.trim()))
    .map(p => `${p.key.trim()}${delimiter}${p.value.trim()}`)
    .join('\n')
}

/**
 * 解析 Query String（形如 key=1&foo=bar 或 ?key=1）为键值对数组，保护并保留 {{variable}} 变量
 */
export function parseQueryString(queryStr: string): Array<{ key: string; value: string }> {
  if (!queryStr || !queryStr.trim()) return []
  const clean = queryStr.replace(/^\?+/, '').trim()
  if (!clean) return []

  const result: Array<{ key: string; value: string }> = []
  const pairs = clean.split('&')
  for (const pair of pairs) {
    if (!pair) continue
    const eqIdx = pair.indexOf('=')
    let rawK = eqIdx !== -1 ? pair.slice(0, eqIdx) : pair
    let rawV = eqIdx !== -1 ? pair.slice(eqIdx + 1) : ''
    let k = rawK
    let v = rawV
    try {
      k = decodeURIComponent(rawK)
    } catch {}
    try {
      v = decodeURIComponent(rawV)
    } catch {}
    result.push({ key: k, value: v })
  }
  return result
}

/**
 * 从相对路径或完整 URL 中提取 Path Variables（按在 URL 中出现的自然顺序），如 /users/{id}/orders/:orderId
 * 支持:
 * 1. 单大括号变量: {varName}，自动忽略环境变量插值 {{envVar}}
 * 2. 冒号变量: :varName，要求前面是路径分隔符 / 或是开头，且变量名必须以字母或下划线开头（排除 :8080, :9443 等纯数字端口号）
 * 3. 完整 URL 保护: 若输入带有协议或域名（如 http://39.99.234.124:9443/ 或 localhost:3000/），自动剥离域名和端口部分，仅在真正的路径部分提取
 * 4. Query / Hash 保护: 自动去除 ? 后的查询参数与 # 后的哈希，避免参数中的冒号被误识别
 */
export function extractPathVariables(inputPath: string): string[] {
  if (!inputPath || !inputPath.trim()) return []

  let pathOnly = inputPath.trim()

  // 1. 若包含协议 (http://, https:// 等)，剥离前面的 scheme://host:port
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(pathOnly)) {
    const schemeEnd = pathOnly.indexOf('://') + 3
    const firstSlash = pathOnly.indexOf('/', schemeEnd)
    pathOnly = firstSlash !== -1 ? pathOnly.slice(firstSlash) : ''
  } else if (/^[a-zA-Z0-9.-]+:\d+(\/.*)?$/.test(pathOnly)) {
    // 2. 若不带协议但带域名/IP+端口 (如 39.99.234.124:9443 或 localhost:8080/users)
    const slashIdx = pathOnly.indexOf('/')
    pathOnly = slashIdx !== -1 ? pathOnly.slice(slashIdx) : ''
  }

  // 3. 剥离可能存在的 query string (?...) 和 hash (#...)
  pathOnly = pathOnly.split('?')[0].split('#')[0]

  const vars: string[] = []

  // 4. 匹配两类标准 Path 变量：
  // 4.1 单大括号 {varName}（排除 {{envVar}}）
  // 4.2 冒号变量 :varName（要求以 / 或开头引导，且变量名不能以纯数字开头，避免端口号误伤）
  const combinedRegex = /(?<!\{)\{([a-zA-Z0-9_$-]+)\}(?!\})|(?:^|\/):([a-zA-Z_][a-zA-Z0-9_$-]*)/g
  for (const match of pathOnly.matchAll(combinedRegex)) {
    const varName = match[1] || match[2]
    if (varName && !vars.includes(varName)) {
      vars.push(varName)
    }
  }

  return vars
}

