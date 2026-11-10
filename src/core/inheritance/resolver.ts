import { parseQueryString } from '@/utils/parser'
import type { KeyValuePair, ProjectConfig, SubProjectConfig } from '@/types'

export interface InheritedHeaderRow {
  key: string
  originalValue: string
  inheritedFrom: 'project' | 'subproject'
  description?: string
  value: string
  enabled: boolean
  isOverridden: boolean
  overriddenInCustomGrid: boolean
}

export interface EffectiveHeaderItem {
  key: string
  value: string
  enabled: boolean
  source: 'project' | 'subproject' | 'custom'
  sourceLabel: string
  status: 'active' | 'disabled' | 'overridden'
  statusLabel: string
  overrideNote?: string
  description?: string
}

export interface HeaderResolutionResult {
  inheritedRows: InheritedHeaderRow[]
  effectiveHeaders: EffectiveHeaderItem[]
  sendableHeaders: Array<{ key: string; value: string }>
  inheritedKeys: string[]
  customHeadersCount: number
  overriddenHeadersCount: number
  disabledInheritedCount: number
  activeHeadersCount: number
}

/**
 * 级联解析子项目的有效 BaseURL
 */
export function resolveEffectiveBaseUrl(
  projectConfig: ProjectConfig | null,
  subConfig?: SubProjectConfig | null
): string {
  const rootBase = projectConfig?.baseUrl || ''
  if (!subConfig) return rootBase

  if (!subConfig.inheritBaseUrl && subConfig.baseUrl.trim()) {
    return subConfig.baseUrl.trim()
  }

  let combined = rootBase.replace(/\/+$/, '')
  if (subConfig.baseUrl && !subConfig.baseUrl.startsWith('http')) {
    const prefix = subConfig.baseUrl.startsWith('/')
      ? subConfig.baseUrl
      : `/${subConfig.baseUrl}`
    combined = `${combined}${prefix}`
  }
  return combined
}

/**
 * 级联解析主项目 + 子项目的公共继承 Headers
 */
export function resolveInheritedHeaders(
  projectConfig: ProjectConfig | null,
  subConfig?: SubProjectConfig | null
): KeyValuePair[] {
  const result: KeyValuePair[] = []

  if (projectConfig?.headers) {
    for (const h of projectConfig.headers) {
      if (h.enabled && h.key.trim()) {
        result.push({
          ...h,
          id: `proj_${h.id}`,
          inheritedFrom: 'project'
        })
      }
    }
  }

  if (subConfig) {
    if (subConfig.inheritHeaders === false) {
      result.length = 0
    }
    if (subConfig.headers) {
      for (const h of subConfig.headers) {
        if (h.enabled && h.key.trim()) {
          const lowerKey = h.key.trim().toLowerCase()
          const existingIdx = result.findIndex(
            r => r.key.trim().toLowerCase() === lowerKey
          )
          const item: KeyValuePair = {
            ...h,
            id: `sub_${h.id}`,
            inheritedFrom: 'subproject'
          }
          if (existingIdx !== -1) {
            result[existingIdx] = item
          } else {
            result.push(item)
          }
        }
      }
    }
  }

  return result
}

/**
 * 统一计算单接口的继承视图、最终生效预览以及发送头列表（唯一事实来源）
 */
export function resolveHeaderLayers(
  inheritedHeaders: KeyValuePair[],
  requestHeaders: KeyValuePair[]
): HeaderResolutionResult {
  const inheritedKeys = inheritedHeaders.map(h => h.key.trim().toLowerCase())
  const inheritedKeySet = new Set(inheritedKeys.filter(Boolean))

  const inheritedRows: InheritedHeaderRow[] = inheritedHeaders.map(ih => {
    const override = requestHeaders.find(
      h => h.key.trim().toLowerCase() === ih.key.trim().toLowerCase()
    )
    if (override) {
      return {
        key: ih.key,
        originalValue: ih.value || '',
        inheritedFrom: ih.inheritedFrom || 'subproject',
        description: ih.description,
        value: override.value,
        enabled: override.enabled !== false,
        isOverridden:
          override.value !== (ih.value || '') ||
          override.enabled !== (ih.enabled !== false),
        overriddenInCustomGrid: override.isInheritedOverride === false
      }
    }
    return {
      key: ih.key,
      originalValue: ih.value || '',
      inheritedFrom: ih.inheritedFrom || 'subproject',
      description: ih.description,
      value: ih.value || '',
      enabled: ih.enabled !== false,
      isOverridden: false,
      overriddenInCustomGrid: false
    }
  })

  const inheritedMap = new Map<string, KeyValuePair>()
  for (const ih of inheritedHeaders) {
    if (ih.key.trim()) {
      inheritedMap.set(ih.key.trim().toLowerCase(), ih)
    }
  }

  const customMap = new Map<string, KeyValuePair>()
  for (const ch of requestHeaders) {
    if (ch.key.trim()) {
      customMap.set(ch.key.trim().toLowerCase(), ch)
    }
  }

  const allKeys = new Set([...inheritedMap.keys(), ...customMap.keys()])
  const effectiveHeaders: EffectiveHeaderItem[] = []
  const sendableHeaders: Array<{ key: string; value: string }> = []

  for (const k of allKeys) {
    const inherited = inheritedMap.get(k)
    const custom = customMap.get(k)

    if (custom) {
      if (inherited) {
        const isModifiedValue = custom.value !== (inherited.value || '')
        const isModifiedEnabled = custom.enabled !== (inherited.enabled !== false)
        const isOverridden = isModifiedValue || isModifiedEnabled
        const item: EffectiveHeaderItem = {
          key: custom.key || inherited.key,
          value: custom.value,
          enabled: custom.enabled,
          source:
            custom.isInheritedOverride === false
              ? 'custom'
              : inherited.inheritedFrom || 'subproject',
          sourceLabel:
            custom.isInheritedOverride === false
              ? '接口专属'
              : inherited.inheritedFrom === 'project'
                ? '全局项目'
                : '子项目',
          status: !custom.enabled ? 'disabled' : isOverridden ? 'overridden' : 'active',
          statusLabel: !custom.enabled
            ? '接口已禁用'
            : isOverridden
              ? '接口已覆盖'
              : '生效中',
          overrideNote: isOverridden
            ? `原始默认值: ${inherited.value || '(空)'}`
            : undefined,
          description: custom.description || inherited.description
        }
        effectiveHeaders.push(item)
        if (custom.enabled !== false) {
          sendableHeaders.push({ key: item.key.trim(), value: item.value || '' })
        }
      } else {
        const item: EffectiveHeaderItem = {
          key: custom.key,
          value: custom.value,
          enabled: custom.enabled,
          source: 'custom',
          sourceLabel: '接口专属',
          status: custom.enabled ? 'active' : 'disabled',
          statusLabel: custom.enabled ? '生效中' : '未启用',
          description: custom.description
        }
        effectiveHeaders.push(item)
        if (custom.enabled !== false) {
          sendableHeaders.push({ key: item.key.trim(), value: item.value || '' })
        }
      }
    } else if (inherited) {
      const enabled = inherited.enabled !== false
      const item: EffectiveHeaderItem = {
        key: inherited.key,
        value: inherited.value || '',
        enabled,
        source: inherited.inheritedFrom || 'subproject',
        sourceLabel: inherited.inheritedFrom === 'project' ? '全局项目' : '子项目',
        status: enabled ? 'active' : 'disabled',
        statusLabel: enabled ? '生效中' : '未启用',
        description: inherited.description
      }
      effectiveHeaders.push(item)
      if (enabled) {
        sendableHeaders.push({ key: item.key.trim(), value: item.value || '' })
      }
    }
  }

  const customHeadersCount = requestHeaders.filter(h => {
    if (h.isInheritedOverride === true) return false
    if (h.isInheritedOverride === false) return h.key.trim().length > 0
    return !inheritedKeySet.has(h.key.trim().toLowerCase()) && h.key.trim().length > 0
  }).length

  return {
    inheritedRows,
    effectiveHeaders,
    sendableHeaders,
    inheritedKeys,
    customHeadersCount,
    overriddenHeadersCount: inheritedRows.filter(r => r.isOverridden).length,
    disabledInheritedCount: inheritedRows.filter(r => !r.enabled).length,
    activeHeadersCount: sendableHeaders.length
  }
}

/**
 * 编码参数值但保护 {{variable}} 占位符不被 percent-encoding 破坏
 */
export function encodeParamPreservingVariables(str: string): string {
  if (!str) return ''
  const tokens: string[] = []
  const placeholderStr = str.replace(/\{\{\s*([a-zA-Z0-9_$-]+)\s*\}\}/g, match => {
    const idx = tokens.length
    tokens.push(match)
    return `__VAR_TOK_${idx}__`
  })
  const encoded = encodeURIComponent(placeholderStr)
  return encoded.replace(/__VAR_TOK_(\d+)__/g, (_, idx) => tokens[Number(idx)])
}

/**
 * 计算拼接后的完整 URL（含 BaseURL、Path 参数替换、Inline Query 与表格 Query 智能合并）
 */
export function resolveRequestUrl(
  baseUrl: string,
  path: string,
  pathParams: KeyValuePair[],
  queryParams: KeyValuePair[]
): string {
  const cleanBase = baseUrl.trim().replace(/\/+$/, '')
  const cleanPath = path.trim()

  const hashIndex = cleanPath.indexOf('#')
  const beforeHash = hashIndex !== -1 ? cleanPath.slice(0, hashIndex) : cleanPath
  const fragmentStr = hashIndex !== -1 ? cleanPath.slice(hashIndex) : ''

  const qIndex = beforeHash.indexOf('?')
  let basePath = qIndex !== -1 ? beforeHash.slice(0, qIndex) : beforeHash
  const inlineQueryStr = qIndex !== -1 ? beforeHash.slice(qIndex + 1) : ''

  for (const p of pathParams) {
    if (p.key) {
      const safeVal = encodeParamPreservingVariables(p.value)
      const escapedKey = p.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      basePath = basePath.replace(
        new RegExp(`(?<!\\{)\\{${escapedKey}\\}(?!\\})`, 'g'),
        () => safeVal
      )
      basePath = basePath.replace(
        new RegExp(`(^|\\/):${escapedKey}(?=[\\/?#]|$)`, 'g'),
        (_match, prefix: string) => `${prefix}${safeVal}`
      )
    }
  }

  let fullUrl = ''
  if (/^https?:\/\//i.test(basePath) || basePath.startsWith('{{')) {
    fullUrl = basePath
  } else {
    if (basePath && !basePath.startsWith('/')) {
      basePath = '/' + basePath
    }
    fullUrl = `${cleanBase}${basePath}`
  }

  const tableDisabledKeys = new Set(
    queryParams.filter(p => !p.enabled && p.key.trim()).map(p => p.key.trim())
  )
  const tableActiveParams = queryParams.filter(p => p.enabled && p.key.trim())
  const tableKeySet = new Set(tableActiveParams.map(p => p.key.trim()))

  const urlParams = parseQueryString(inlineQueryStr)
  const finalParamPairs: Array<{ key: string; value: string }> = []

  for (const p of urlParams) {
    const k = p.key.trim()
    if (!k) continue
    if (tableDisabledKeys.has(k)) continue
    if (!tableKeySet.has(k)) {
      finalParamPairs.push({ key: k, value: p.value })
    }
  }

  for (const p of tableActiveParams) {
    finalParamPairs.push({ key: p.key.trim(), value: p.value })
  }

  if (finalParamPairs.length > 0) {
    const parts = finalParamPairs.map(p => {
      const k = encodeParamPreservingVariables(p.key)
      const v = encodeParamPreservingVariables(p.value)
      return `${k}=${v}`
    })
    fullUrl = `${fullUrl}?${parts.join('&')}`
  }

  return `${fullUrl}${fragmentStr}`
}

