import type { CommandDefinition, KeyBinding } from '@/core/commands/commandRegistry'
import type {
  ApiRequest,
  Environment,
  HistoryItem,
  SubProjectData,
  TabSession
} from '@/types'

export type QuickSearchKind = 'tab' | 'request' | 'environment' | 'command' | 'history'
export type QuickSearchCategory = 'all' | 'request' | 'command' | 'environment' | 'history'

export interface QuickSearchItem {
  id: string
  kind: QuickSearchKind
  title: string
  subtitle?: string
  method?: string
  badge?: string
  shortcutText?: string
  keywords?: string
  active?: boolean
  status?: number
  payload:
    | { type: 'tab'; tabId: string }
    | { type: 'request'; request: ApiRequest; subProjectDir: string }
    | { type: 'environment'; envId: string | null }
    | { type: 'command'; commandId: string }
    | { type: 'history'; item: HistoryItem }
}

export interface QuickSearchSources {
  tabs: TabSession[]
  activeTabId: string
  subProjects: SubProjectData[]
  environments: Environment[]
  activeEnvironmentId: string | null
  commands: CommandDefinition[]
  history: HistoryItem[]
  isMac?: boolean
}

const KEY_LABELS: Record<string, string> = {
  enter: '↵',
  '\\': '\\',
  escape: 'Esc',
  arrowup: '↑',
  arrowdown: '↓'
}

export function formatKeyBinding(binding?: KeyBinding, isMac = true): string {
  if (!binding) return ''
  const parts: string[] = []
  if (binding.mod) parts.push(isMac ? '⌘' : 'Ctrl')
  if (binding.alt) parts.push(isMac ? '⌥' : 'Alt')
  if (binding.shift) parts.push(isMac ? '⇧' : 'Shift')
  const lowerKey = binding.key.toLowerCase()
  const keyLabel = KEY_LABELS[lowerKey] || binding.key.toUpperCase()
  parts.push(keyLabel)
  return isMac ? parts.join('') : parts.join('+')
}

function scoreSingleToken(haystack: string, token: string): number {
  if (!token) return 1
  if (!haystack) return 0

  const text = haystack.toLowerCase()
  const q = token.toLowerCase()

  if (text === q) return 200
  if (text.startsWith(q)) return 140

  const subIdx = text.indexOf(q)
  if (subIdx !== -1) {
    const prev = subIdx > 0 ? text[subIdx - 1] : ' '
    const isBoundary = /[\s/_.\-:]/.test(prev)
    return (isBoundary ? 115 : 85) - Math.min(subIdx, 30) * 0.5
  }

  // 子序列模糊匹配（按字符顺序匹配并奖励词边界，限制最大跨度避免无关超长桥接）
  let qi = 0
  let score = 0
  let consecutive = 0
  let lastMatchIdx = -1
  let firstMatchIdx = -1
  for (let i = 0; i < text.length && qi < q.length; i++) {
    if (text[i] === q[qi]) {
      if (firstMatchIdx === -1) firstMatchIdx = i
      if (lastMatchIdx !== -1 && i - lastMatchIdx > 12) {
        consecutive = 0
      } else {
        consecutive++
      }
      const isBoundary = i === 0 || /[\s/_.\-:]/.test(text[i - 1])
      score += 10 + consecutive * 4 + (isBoundary ? 12 : 0)
      lastMatchIdx = i
      qi++
    } else {
      consecutive = 0
    }
  }

  if (qi < q.length) return 0
  const span = lastMatchIdx - firstMatchIdx + 1
  if (q.length >= 3 && span > q.length * 4 + 4) {
    return 0
  }
  return score
}

export function fuzzyScore(text: string, query: string): number {
  const tokens = query.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return 1

  let total = 0
  for (const token of tokens) {
    const s = scoreSingleToken(text, token)
    if (s <= 0) return 0
    total += s
  }
  return total / tokens.length
}

export function parseQuickSearchQuery(
  rawInput: string,
  activeFilter: QuickSearchCategory
): { category: QuickSearchCategory; query: string } {
  const trimmed = rawInput.trimStart()
  if (trimmed.startsWith('>')) {
    return { category: 'command', query: trimmed.slice(1).trim() }
  }
  if (trimmed.startsWith('@')) {
    return { category: 'environment', query: trimmed.slice(1).trim() }
  }
  if (trimmed.startsWith('#')) {
    return { category: 'history', query: trimmed.slice(1).trim() }
  }
  return { category: activeFilter, query: rawInput.trim() }
}

function buildSavedRequestTabKey(subDir?: string, reqId?: string, fileName?: string): string[] {
  const keys: string[] = []
  if (subDir && fileName) keys.push(`file:${subDir}:${fileName}`)
  if (subDir && reqId) keys.push(`id:${subDir}:${reqId}`)
  return keys
}

export function buildQuickSearchItems(sources: QuickSearchSources): QuickSearchItem[] {
  const items: QuickSearchItem[] = []
  const openedKeys = new Set<string>()
  const subProjectMap = new Map(sources.subProjects.map(sp => [sp.dirName, sp]))
  const isMac = sources.isMac ?? true

  // 1. 已打开的标签页（优先展示，便于快速切 Tab）
  for (const tab of sources.tabs) {
    for (const k of buildSavedRequestTabKey(tab.subProjectDir, tab.requestId, tab.fileName)) {
      openedKeys.add(k)
    }
    const subName = tab.subProjectDir
      ? subProjectMap.get(tab.subProjectDir)?.config.name || tab.subProjectDir
      : undefined
    const subtitleParts = [tab.draftRequest.path || '/']
    if (subName) subtitleParts.push(subName)
    if (tab.group) subtitleParts.push(tab.group)

    items.push({
      id: `tab:${tab.id}`,
      kind: 'tab',
      title: tab.title || tab.draftRequest.path || '未命名请求',
      subtitle: subtitleParts.join(' · '),
      method: tab.method,
      badge: tab.id === sources.activeTabId ? '当前' : '已打开',
      active: tab.id === sources.activeTabId,
      keywords: `${tab.method} ${tab.draftRequest.path} ${subName || ''} ${tab.group || ''}`,
      payload: { type: 'tab', tabId: tab.id }
    })
  }

  // 2. 子项目已保存集合接口
  for (const sp of sources.subProjects) {
    const subName = sp.config.name || sp.dirName
    for (const req of sp.requests) {
      const keys = buildSavedRequestTabKey(sp.dirName, req.id, req.fileName)
      if (keys.some(k => openedKeys.has(k))) continue

      const subtitleParts = [req.path || '/', subName]
      if (req.group) subtitleParts.push(req.group)

      items.push({
        id: `req:${sp.dirName}:${req.fileName || req.id}`,
        kind: 'request',
        title: req.name || req.path || '未命名请求',
        subtitle: subtitleParts.join(' · '),
        method: req.method,
        keywords: `${req.method} ${req.path} ${subName} ${sp.dirName} ${req.group || ''} ${req.fileName || ''}`,
        payload: { type: 'request', request: req, subProjectDir: sp.dirName }
      })
    }
  }

  // 3. 命令面板（过滤 hiddenInPalette 与不满足 when 的命令）
  for (const cmd of sources.commands) {
    if (cmd.hiddenInPalette) continue
    if (cmd.when && !cmd.when()) continue
    items.push({
      id: `cmd:${cmd.id}`,
      kind: 'command',
      title: cmd.title,
      subtitle: cmd.category ? `${cmd.category} · ${cmd.id}` : cmd.id,
      badge: cmd.category || '命令',
      shortcutText: formatKeyBinding(cmd.shortcut, isMac),
      keywords: `${cmd.id} ${cmd.category || ''}`,
      payload: { type: 'command', commandId: cmd.id }
    })
  }

  // 4. 环境变量快速切换
  for (const env of sources.environments) {
    const varCount = Object.keys(env.variables || {}).length
    const isActive = env.id === sources.activeEnvironmentId
    items.push({
      id: `env:${env.id}`,
      kind: 'environment',
      title: env.name,
      subtitle: `${varCount} 个环境变量`,
      badge: isActive ? '当前环境' : '切换环境',
      active: isActive,
      keywords: Object.keys(env.variables || {}).join(' '),
      payload: { type: 'environment', envId: env.id }
    })
  }
  items.push({
    id: 'env:__none__',
    kind: 'environment',
    title: '无环境 (No Env)',
    subtitle: '清除当前激活环境变量',
    badge: !sources.activeEnvironmentId ? '当前环境' : '切换环境',
    active: !sources.activeEnvironmentId,
    keywords: 'none clear disable',
    payload: { type: 'environment', envId: null }
  })

  // 5. 请求历史（最多取最近 50 条）
  for (const h of sources.history.slice(0, 50)) {
    items.push({
      id: `history:${h.id}`,
      kind: 'history',
      title: h.name || h.url,
      subtitle: h.url,
      method: h.method,
      status: h.status,
      badge: `${h.status}`,
      keywords: `${h.method} ${h.url} ${h.status}`,
      payload: { type: 'history', item: h }
    })
  }

  return items
}

function matchesCategory(kind: QuickSearchKind, category: QuickSearchCategory): boolean {
  if (category === 'all') return true
  if (category === 'request') return kind === 'tab' || kind === 'request'
  return kind === category
}

const DEFAULT_KIND_PRIORITY: Record<QuickSearchKind, number> = {
  tab: 0,
  request: 1,
  command: 2,
  environment: 3,
  history: 4
}

export function filterQuickSearchItems(
  items: QuickSearchItem[],
  rawInput: string,
  activeFilter: QuickSearchCategory = 'all',
  limit = 60
): QuickSearchItem[] {
  const { category, query } = parseQuickSearchQuery(rawInput, activeFilter)
  const scoped = items.filter(item => matchesCategory(item.kind, category))

  if (!query) {
    return scoped
      .slice()
      .sort((a, b) => DEFAULT_KIND_PRIORITY[a.kind] - DEFAULT_KIND_PRIORITY[b.kind])
      .slice(0, limit)
  }

  const tokens = query.split(/\s+/).filter(Boolean)
  const scored: Array<{ item: QuickSearchItem; score: number }> = []

  for (const item of scoped) {
    const titleField = item.title || ''
    const subtitleField = item.subtitle || ''
    const keywordField = item.keywords || ''

    let fieldScore = 0
    let matchedAll = true
    for (const token of tokens) {
      const sTitle = scoreSingleToken(titleField, token) * 2.2
      const sSub = scoreSingleToken(subtitleField, token) * 1.3
      const sKw = scoreSingleToken(keywordField, token) * 0.9
      const bestTokenScore = Math.max(sTitle, sSub, sKw)
      if (bestTokenScore <= 0) {
        matchedAll = false
        break
      }
      fieldScore += bestTokenScore
    }

    if (!matchedAll) continue

    // 轻量加权：当前激活 Tab / 已打开 / 请求 & 命令略高于纯历史
    const kindBonus =
      item.kind === 'tab' ? 12 : item.kind === 'request' ? 8 : item.kind === 'command' ? 6 : 0
    scored.push({ item, score: fieldScore / tokens.length + kindBonus })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map(entry => entry.item)
}
