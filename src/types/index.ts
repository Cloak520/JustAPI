export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

export type BodyType = 'none' | 'json' | 'form-data' | 'x-www-form-urlencoded' | 'raw'

export interface KeyValuePair {
  id: string
  key: string
  value: string
  enabled: boolean
  description?: string
  inheritedFrom?: 'project' | 'subproject'
}

export interface ApiRequest {
  id: string
  name: string
  method: HttpMethod
  path: string // 相对路径如 /users/{id} 或绝对 URL
  pathParams: KeyValuePair[]
  queryParams: KeyValuePair[]
  headers: KeyValuePair[]
  bodyType: BodyType
  bodyContent: string
  subProjectId?: string
  fileName?: string
  group?: string
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
  status: number
  statusText: string
  durationMs: number
  sizeBytes: number
  headers: Record<string, string>
  cookies?: CookieItem[]
  body: string
  timestamp: number
  isTruncated?: boolean
}

export interface Environment {
  id: string
  name: string
  variables: Record<string, string>
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
}

export interface ProjectConfig {
  name: string
  baseUrl: string
  headers: KeyValuePair[]
  environments: Environment[]
  activeEnvironmentId?: string
  swaggerSourceUrl?: string
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
}

export interface SubProjectData {
  config: SubProjectConfig
  dir_name: string
  requests: ApiRequest[]
}

export interface FullProjectData {
  path: string
  config: ProjectConfig
  sub_projects: SubProjectData[]
  history: HistoryItem[]
}

export interface TabItem {
  id: string
  title: string
  method: HttpMethod
  isDirty: boolean
  subProjectDir?: string
  fileName?: string
  requestId?: string
  group?: string
}
