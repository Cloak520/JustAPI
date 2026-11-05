import type { ProjectConfig, SubProjectConfig, KeyValuePair } from '@/types'

export type VariableSource = 'project' | 'subproject' | 'system' | 'unresolved'

export interface VariableSourceInfo {
  value: string
  source: 'project' | 'subproject' | 'system'
  environmentName?: string
}

export interface VariableTokenInfo {
  token: string // e.g. "{{userId}}"
  key: string   // e.g. "userId"
  value: string // resolved value or ""
  source: VariableSource
  environmentName?: string
}

/**
 * 评估系统内置动态变量:
 * - $guid: 随机 UUID v4
 * - $timestamp: 当前 10 位 Unix 时间戳
 * - $timestampMs: 当前 13 位毫秒级时间戳
 * - $randomInt: 0-1000 随机整数
 */
export function evalSystemVariable(key: string): string | null {
  const normalized = key.trim()
  switch (normalized) {
    case '$guid':
      return crypto.randomUUID()
    case '$timestamp':
      return Math.floor(Date.now() / 1000).toString()
    case '$timestampMs':
      return Date.now().toString()
    case '$randomInt':
      return Math.floor(Math.random() * 1001).toString()
    default:
      return null
  }
}

/**
 * 判断是否为系统动态变量名
 */
export function isSystemVariable(key: string): boolean {
  const normalized = key.trim()
  return ['$guid', '$timestamp', '$timestampMs', '$randomInt'].includes(normalized)
}

/**
 * 解析并合并多层级有效变量 Map (主项目选定环境 -> 子项目覆盖)
 */
export function resolveEffectiveVariableMap(
  projectConfig: ProjectConfig | null,
  subProjectConfig?: SubProjectConfig | null
): Map<string, VariableSourceInfo> {
  const map = new Map<string, VariableSourceInfo>()

  // 1. 主项目层级：从当前激活的环境中读取变量
  if (projectConfig?.environments && projectConfig.activeEnvironmentId) {
    const activeEnv = projectConfig.environments.find(e => e.id === projectConfig.activeEnvironmentId)
    if (activeEnv && activeEnv.variables) {
      for (const [k, v] of Object.entries(activeEnv.variables)) {
        if (k.trim()) {
          map.set(k.trim(), {
            value: v,
            source: 'project',
            environmentName: activeEnv.name
          })
        }
      }
    }
  }

  // 2. 子项目层级：如果存在子项目配置
  if (subProjectConfig) {
    // 若子项目显式配置了不继承主项目变量，则清空主项目变量
    if (subProjectConfig.inheritVariables === false) {
      map.clear()
    }

    // 将子项目局部变量合并或覆盖
    if (subProjectConfig.variables) {
      for (const [k, v] of Object.entries(subProjectConfig.variables)) {
        if (k.trim()) {
          map.set(k.trim(), {
            value: v,
            source: 'subproject'
          })
        }
      }
    }
  }

  return map
}

/**
 * 将字符串中的 {{variable_name}} 动态插值替换
 * 如果是内置系统变量 (如 {{$guid}})，实时生成动态值
 * 如果变量不存在，保持原样 {{variable_name}}
 */
export function interpolate(text: string, varMap: Map<string, VariableSourceInfo>): string {
  if (!text || typeof text !== 'string') return text

  return text.replace(/\{\{\s*([a-zA-Z0-9_$-]+)\s*\}\}/g, (match, key) => {
    // 优先检查系统变量
    const sysVal = evalSystemVariable(key)
    if (sysVal !== null) {
      return sysVal
    }

    // 检查环境变量 Map (子项目覆盖 > 主项目环境)
    const found = varMap.get(key)
    if (found !== undefined) {
      return found.value
    }

    // 未定义则保持原样
    return match
  })
}

/**
 * 递归解析并替换 KeyValuePair 列表中的键与值
 */
export function interpolateKeyValuePairs(
  pairs: KeyValuePair[],
  varMap: Map<string, VariableSourceInfo>
): KeyValuePair[] {
  return pairs.map(item => ({
    ...item,
    key: interpolate(item.key, varMap),
    value: interpolate(item.value, varMap)
  }))
}

/**
 * 提取并分析文本中的所有 {{...}} 占位符及其解析详情 (用于 Hover Tooltip / 语法高亮)
 */
export function inspectInterpolationTokens(
  text: string,
  varMap: Map<string, VariableSourceInfo>
): VariableTokenInfo[] {
  if (!text || typeof text !== 'string') return []

  const tokens: VariableTokenInfo[] = []
  const regex = /\{\{\s*([a-zA-Z0-9_$-]+)\s*\}\}/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    const fullToken = match[0]
    const key = match[1]

    if (isSystemVariable(key)) {
      tokens.push({
        token: fullToken,
        key,
        value: '(动态生成值)',
        source: 'system'
      })
    } else {
      const found = varMap.get(key)
      if (found) {
        tokens.push({
          token: fullToken,
          key,
          value: found.value,
          source: found.source,
          environmentName: found.environmentName
        })
      } else {
        tokens.push({
          token: fullToken,
          key,
          value: '',
          source: 'unresolved'
        })
      }
    }
  }

  return tokens
}
