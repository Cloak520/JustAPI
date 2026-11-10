import { extractPathVariables } from '@/utils/parser'
import type { ApiRequest, FormField, HttpMethod, KeyValuePair } from '@/types'

export function createDefaultFormField(): FormField {
  return {
    id: crypto.randomUUID(),
    key: '',
    value: '',
    is_file: false,
    enabled: true
  }
}

export function createEmptyRequest(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return {
    schemaVersion: 1,
    id: overrides.id || crypto.randomUUID(),
    name: overrides.name ?? '新建请求',
    method: overrides.method ?? 'GET',
    path: overrides.path ?? '/',
    pathParams: overrides.pathParams ? structuredCloneSafe(overrides.pathParams) : [],
    queryParams: overrides.queryParams ? structuredCloneSafe(overrides.queryParams) : [],
    headers: overrides.headers ? structuredCloneSafe(overrides.headers) : [],
    bodyType: overrides.bodyType ?? 'none',
    bodyContent: overrides.bodyContent ?? '',
    formFields: overrides.formFields && overrides.formFields.length > 0
      ? structuredCloneSafe(overrides.formFields)
      : [createDefaultFormField()],
    subProjectId: overrides.subProjectId,
    fileName: overrides.fileName,
    group: overrides.group,
    extensions: overrides.extensions ? structuredCloneSafe(overrides.extensions) : undefined
  }
}

export function structuredCloneSafe<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

export function normalizeRequest(raw: Partial<ApiRequest>): ApiRequest {
  const path = raw.path ?? '/'
  const pathParams = syncPathParamsWithPath(path, raw.pathParams || [])
  const formFields = raw.formFields && raw.formFields.length > 0
    ? raw.formFields.map(f => ({
        id: f.id || crypto.randomUUID(),
        key: f.key || '',
        value: f.value || '',
        is_file: Boolean(f.is_file),
        enabled: f.enabled !== false
      }))
    : [createDefaultFormField()]

  return {
    schemaVersion: raw.schemaVersion ?? 1,
    id: raw.id || crypto.randomUUID(),
    name: raw.name || raw.path || '未命名请求',
    method: (raw.method || 'GET') as HttpMethod,
    path,
    pathParams,
    queryParams: structuredCloneSafe(raw.queryParams || []),
    headers: structuredCloneSafe(raw.headers || []),
    bodyType: raw.bodyType || 'none',
    bodyContent: raw.bodyContent || '',
    formFields,
    subProjectId: raw.subProjectId,
    fileName: raw.fileName,
    group: raw.group,
    extensions: raw.extensions ? structuredCloneSafe(raw.extensions) : undefined
  }
}

/**
 * 同步路径与 Path Variables，同时保留用户输入过的参数值
 */
export function syncPathParamsWithPath(
  path: string,
  existingParams: KeyValuePair[]
): KeyValuePair[] {
  const extracted = extractPathVariables(path)
  const existingMap = new Map(existingParams.map(p => [p.key, p]))
  return extracted.map(varName => {
    const prev = existingMap.get(varName)
    return {
      id: prev?.id || varName,
      key: varName,
      value: prev?.value || '',
      enabled: prev ? prev.enabled !== false : true,
      description: prev?.description
    }
  })
}

export function buildDuplicateTitle(rawTitle: string): string {
  const title = rawTitle || '未命名请求'
  const copyMatch = title.match(/^(.*?)(?:\s*\(副本(?:\s*(\d+))?\))?$/)
  if (copyMatch) {
    const baseTitle = copyMatch[1]
    const count = copyMatch[2]
      ? parseInt(copyMatch[2], 10) + 1
      : title.includes('(副本)')
        ? 2
        : 1
    return count === 1 ? `${baseTitle} (副本)` : `${baseTitle} (副本 ${count})`
  }
  return `${title} (副本)`
}

export function sanitizeFileBaseName(name: string, fallback = 'req'): string {
  return name.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_') || fallback
}
