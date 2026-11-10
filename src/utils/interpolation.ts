import type { KeyValuePair } from '@/types'
import {
  defaultVariableEngine,
  resolveEffectiveVariableMap,
  type VariableSource,
  type VariableSourceInfo,
  type VariableTokenInfo
} from '@/core/interpolation/engine'

export type { VariableSource, VariableSourceInfo, VariableTokenInfo }
export { resolveEffectiveVariableMap }

/**
 * 评估系统内置动态变量（委托给可扩展的 defaultVariableEngine）
 */
export function evalSystemVariable(key: string): string | null {
  return defaultVariableEngine.evalDynamic(key)
}

/**
 * 判断是否为已注册的系统动态变量名
 */
export function isSystemVariable(key: string): boolean {
  return defaultVariableEngine.hasProvider(key)
}

/**
 * 将字符串中的 {{variable_name}} 动态插值替换
 */
export function interpolate(
  text: string,
  varMap: Map<string, VariableSourceInfo>
): string {
  return defaultVariableEngine.interpolate(text, varMap)
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
    key: defaultVariableEngine.interpolate(item.key, varMap),
    value: defaultVariableEngine.interpolate(item.value, varMap)
  }))
}

/**
 * 提取并分析文本中的所有 {{...}} 占位符及其解析详情
 */
export function inspectInterpolationTokens(
  text: string,
  varMap: Map<string, VariableSourceInfo>
): VariableTokenInfo[] {
  return defaultVariableEngine.inspectTokens(text, varMap)
}
