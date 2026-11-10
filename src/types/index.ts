export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

export type BodyType = 'none' | 'json' | 'form-data' | 'x-www-form-urlencoded' | 'raw' | (string & {})

export interface KeyValuePair {
  id: string
  key: string
  value: string
  enabled: boolean
  description?: string
  inheritedFrom?: 'project' | 'subproject'
  isInheritedOverride?: boolean
}

export interface FormField {
  id: string
  key: string
  value: string
  is_file: boolean
  enabled: boolean
}

export interface ApiRequest {
  schemaVersion?: number
  id: string
  name: string
  method: HttpMethod
  path: string // 相对路径如 /users/{id} 或绝对 URL
  pathParams: KeyValuePair[]
  queryParams: KeyValuePair[]
  headers: KeyValuePair[]
  bodyType: BodyType
  bodyContent: string
  formFields?: FormField[]
  subProjectId?: string
  fileName?: string
  group?: string
  extensions?: Record<string, unknown>
}

export interface CookieItem {
  name: string
  value: string
  domain?: string
  path?: string
  raw: string
}

export interface NetworkSettings {
  dangerouslyDisableSsl: boolean
  enableProxy: boolean
  proxyUrl: string
  enableCookieJar: boolean
}

export interface ApiResponse {
  requestId?: string
  status: number
  statusText: string
  durationMs: number
  sizeBytes: number
  headers: Record<string, string>
  cookies?: CookieItem[]
  body: string
  bodyBase64?: string
  timestamp: number
  contentType?: string
}

export interface Environment {
  id: string
  name: string
  variables: Record<string, string>
}

export interface CollectionSyncSource {
  importerId: string
  source: string
}

export interface ImportedCollection {
  title: string
  baseUrl?: string
  requests: ApiRequest[]
  sourceFormat: string
}

export interface SubProjectConfig {
  id: string
  name: string
  baseUrl: string
  inheritBaseUrl: boolean
  headers: KeyValuePair[]
  inheritHeaders: boolean
  variables: Record<string, string>
  inheritVariables: boolean
  swaggerSourceUrl?: string
  collectionSource?: CollectionSyncSource
}

export interface ProjectConfig {
  schemaVersion?: number
  name: string
  baseUrl: string
  headers: KeyValuePair[]
  environments: Environment[]
  activeEnvironmentId?: string
  swaggerSourceUrl?: string
  networkSettings?: NetworkSettings
  disabledPlugins?: string[]
}

export interface HistoryItem {
  id: string
  requestId?: string
  name: string
  method: string
  url: string
  status: number
  durationMs: number
  timestamp: number
  headers?: [string, string][]
  bodyType?: string
  bodyContent?: string
}

export interface SubProjectData {
  config: SubProjectConfig
  dirName: string
  requests: ApiRequest[]
}

export interface FullProjectData {
  path: string
  config: ProjectConfig
  subProjects: SubProjectData[]
  history: HistoryItem[]
}

export interface MergeStats {
  added: number
  updated: number
  deprecated: number
  total: number
}

export interface TabSession {
  id: string
  title: string
  method: HttpMethod
  isDirty: boolean
  subProjectDir?: string
  fileName?: string
  requestId?: string
  group?: string
  draftRequest: ApiRequest
  cachedResponse?: ApiResponse | null
}

export type TabItem = TabSession
