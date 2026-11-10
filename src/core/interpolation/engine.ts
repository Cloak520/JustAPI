import type { ProjectConfig, SubProjectConfig, KeyValuePair, Environment } from '@/types'

export type VariableSource = 'project' | 'subproject' | 'system' | 'unresolved'

export interface VariableSourceInfo {
  value: string
  source: 'project' | 'subproject' | 'system'
  environmentName?: string
}

export interface VariableTokenInfo {
  token: string
  key: string
  value: string
  source: VariableSource
  environmentName?: string
}

export type DynamicVariableEvaluator = (key: string) => string

export interface DynamicVariableProvider {
  name: string
  description?: string
  evaluate: DynamicVariableEvaluator
}

/**
 * 可扩展动态变量引擎：支持第三方/内置扩展注册自定义 {{$xxx}} 变量函数
 */
export class VariableEngine {
  private providers = new Map<string, DynamicVariableProvider>()

  registerProvider(provider: DynamicVariableProvider): () => void {
    const key = provider.name.trim()
    this.providers.set(key, provider)
    return () => {
      if (this.providers.get(key) === provider) {
        this.providers.delete(key)
      }
    }
  }

  unregisterProvider(name: string): void {
    this.providers.delete(name.trim())
  }

  hasProvider(key: string): boolean {
    return this.providers.has(key.trim())
  }

  listProviders(): DynamicVariableProvider[] {
    return Array.from(this.providers.values())
  }

  evalDynamic(key: string): string | null {
    const normalized = key.trim()
    const provider = this.providers.get(normalized)
    return provider ? provider.evaluate(normalized) : null
  }

  interpolate(text: string, varMap: Map<string, VariableSourceInfo>): string {
    if (!text || typeof text !== 'string') return text

    return text.replace(/\{\{\s*([a-zA-Z0-9_$-]+)\s*\}\}/g, (match, key) => {
      const sysVal = this.evalDynamic(key)
      if (sysVal !== null) {
        return sysVal
      }

      const found = varMap.get(key)
      if (found !== undefined) {
        return found.value
      }

      return match
    })
  }

  inspectTokens(
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

      if (this.hasProvider(key)) {
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
}

export const defaultVariableEngine = new VariableEngine()

// 注册内置系统动态变量（与旧行为 100% 一致，同时新增 $uuid 别名）
defaultVariableEngine.registerProvider({
  name: '$guid',
  description: '随机 UUID v4',
  evaluate: () => crypto.randomUUID()
})
defaultVariableEngine.registerProvider({
  name: '$uuid',
  description: '随机 UUID v4',
  evaluate: () => crypto.randomUUID()
})
defaultVariableEngine.registerProvider({
  name: '$timestamp',
  description: '当前 10 位 Unix 秒级时间戳',
  evaluate: () => Math.floor(Date.now() / 1000).toString()
})
defaultVariableEngine.registerProvider({
  name: '$timestampMs',
  description: '当前 13 位毫秒级时间戳',
  evaluate: () => Date.now().toString()
})
defaultVariableEngine.registerProvider({
  name: '$randomInt',
  description: '0 ~ 1000 之间的随机整数',
  evaluate: () => Math.floor(Math.random() * 1001).toString()
})

export function resolveEffectiveVariableMap(
  projectConfig: ProjectConfig | null,
  subProjectConfig?: SubProjectConfig | null,
  fallbackEnvironment?: Environment | null
): Map<string, VariableSourceInfo> {
  const map = new Map<string, VariableSourceInfo>()

  if (projectConfig?.environments && projectConfig.activeEnvironmentId) {
    const activeEnv = projectConfig.environments.find(
      e => e.id === projectConfig.activeEnvironmentId
    )
    if (activeEnv?.variables) {
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
  } else if (!projectConfig && fallbackEnvironment?.variables) {
    for (const [k, v] of Object.entries(fallbackEnvironment.variables)) {
      if (k.trim()) {
        map.set(k.trim(), {
          value: v,
          source: 'project',
          environmentName: fallbackEnvironment.name
        })
      }
    }
  }

  if (subProjectConfig) {
    if (subProjectConfig.inheritVariables === false) {
      map.clear()
    }
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

export function interpolateWithEngine(
  text: string,
  varMap: Map<string, VariableSourceInfo>
): string {
  return defaultVariableEngine.interpolate(text, varMap)
}

export function interpolatePairsWithEngine(
  pairs: KeyValuePair[],
  varMap: Map<string, VariableSourceInfo>
): KeyValuePair[] {
  return pairs.map(item => ({
    ...item,
    key: defaultVariableEngine.interpolate(item.key, varMap),
    value: defaultVariableEngine.interpolate(item.value, varMap)
  }))
}

