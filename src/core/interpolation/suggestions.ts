import type {
  DynamicVariableProvider,
  VariableSourceInfo
} from '@/core/interpolation/engine'

export type VariableSuggestionSource = 'subproject' | 'project' | 'system'

export interface VariableSuggestion {
  key: string
  value: string
  description?: string
  source: VariableSuggestionSource
  environmentName?: string
}

export interface ActiveVariableTrigger {
  start: number
  end: number
  replaceEnd: number
  query: string
  hasClosingBraces: boolean
}

const VALID_TRIGGER_BODY_RE = /^\s*([a-zA-Z0-9_$-]*)$/
const CLOSING_LOOKAHEAD_RE = /^([a-zA-Z0-9_$-]*\s*\}\})/

/**
 * 检测光标处是否处于 `{{...` 动态变量输入上下文中
 */
export function findActiveVariableTrigger(
  text: string,
  cursorPos: number
): ActiveVariableTrigger | null {
  if (typeof text !== 'string') return null
  const clampedPos = Math.max(0, Math.min(cursorPos, text.length))
  const beforeCursor = text.slice(0, clampedPos)
  const openIdx = beforeCursor.lastIndexOf('{{')
  if (openIdx === -1) return null

  const rawInside = beforeCursor.slice(openIdx + 2)
  if (rawInside.includes('}}') || rawInside.includes('\n') || rawInside.includes('\r')) {
    return null
  }

  const match = VALID_TRIGGER_BODY_RE.exec(rawInside)
  if (!match) return null

  const query = match[1] || ''
  const afterCursor = text.slice(clampedPos)
  const closingMatch = CLOSING_LOOKAHEAD_RE.exec(afterCursor)

  return {
    start: openIdx,
    end: clampedPos,
    replaceEnd: closingMatch ? clampedPos + closingMatch[1].length : clampedPos,
    query,
    hasClosingBraces: Boolean(closingMatch)
  }
}

const SOURCE_ORDER: Record<VariableSuggestionSource, number> = {
  subproject: 0,
  project: 1,
  system: 2
}

/**
 * 汇集当前作用域可用环境变量（子项目覆盖 > 项目激活环境）与动态内置/插件变量
 */
export function buildVariableSuggestions(
  varMap: Map<string, VariableSourceInfo>,
  providers: DynamicVariableProvider[] = []
): VariableSuggestion[] {
  const byKey = new Map<string, VariableSuggestion>()

  for (const [rawKey, info] of varMap.entries()) {
    const key = rawKey.trim()
    if (!key) continue
    byKey.set(key, {
      key,
      value: info.value,
      source: info.source === 'subproject' ? 'subproject' : 'project',
      environmentName: info.environmentName
    })
  }

  for (const p of providers) {
    const key = p.name.trim()
    if (!key || byKey.has(key)) continue
    byKey.set(key, {
      key,
      value: '',
      description: p.description || '动态生成变量',
      source: 'system'
    })
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const orderDiff = SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source]
    if (orderDiff !== 0) return orderDiff
    if (a.source === 'system' && b.source === 'system') return 0
    return a.key.localeCompare(b.key)
  })
}

export function filterVariableSuggestions(
  suggestions: VariableSuggestion[],
  query: string,
  limit = 16
): VariableSuggestion[] {
  const q = query.trim().toLowerCase()
  if (!q) {
    return suggestions.slice(0, limit)
  }

  const prefixMatches: VariableSuggestion[] = []
  const substringMatches: VariableSuggestion[] = []
  const secondaryMatches: VariableSuggestion[] = []

  for (const item of suggestions) {
    const keyLower = item.key.toLowerCase()
    const cleanKey = keyLower.startsWith('$') ? keyLower.slice(1) : keyLower
    if (keyLower.startsWith(q) || cleanKey.startsWith(q)) {
      prefixMatches.push(item)
    } else if (keyLower.includes(q)) {
      substringMatches.push(item)
    } else if (
      item.value.toLowerCase().includes(q) ||
      (item.description && item.description.toLowerCase().includes(q))
    ) {
      secondaryMatches.push(item)
    }
  }

  return [...prefixMatches, ...substringMatches, ...secondaryMatches].slice(0, limit)
}

export function applyVariableSuggestion(
  text: string,
  trigger: ActiveVariableTrigger,
  variableKey: string
): { nextText: string; nextCursor: number } {
  const token = `{{${variableKey}}}`
  const nextText = text.slice(0, trigger.start) + token + text.slice(trigger.replaceEnd)
  const nextCursor = trigger.start + token.length
  return { nextText, nextCursor }
}

