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
 * 从相对路径中提取 Path Variables（按在 URL 中出现的自然顺序），如 /users/{id}/orders/:orderId
 */
export function extractPathVariables(path: string): string[] {
  const vars: string[] = []
  const matches = path.matchAll(/\{([a-zA-Z0-9_-]+)\}|:([a-zA-Z0-9_-]+)/g)
  for (const match of matches) {
    const varName = match[1] || match[2]
    if (varName && !vars.includes(varName)) {
      vars.push(varName)
    }
  }
  return vars
}

