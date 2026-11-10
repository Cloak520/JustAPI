import type * as VueRuntime from 'vue'
import type { CommandDefinition } from '@/core/commands/commandRegistry'
import type { DynamicVariableProvider } from '@/core/interpolation/engine'
import type {
  RequestExecutionContext,
  RequestMiddleware
} from '@/core/pipeline/requestPipeline'
import type {
  BodyEditorContribution,
  CollectionImporterContribution,
  RequestExporterContribution,
  RequestImporterContribution,
  RequestTabContribution,
  ResponseTabContribution
} from '@/core/registries/extensionRegistry'
import type { ApiRequest, ApiResponse } from '@/types'

export const EXTERNAL_PLUGIN_API_VERSION = 1

export type PluginScope = 'project' | 'global' | 'bundled'

export interface ExternalPluginManifest {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  entry: string
  style?: string
  minApiVersion: number
}

export interface DiscoveredExternalPlugin {
  dirName: string
  scope: PluginScope
  pluginDir: string
  manifest: ExternalPluginManifest | null
  error: string | null
}

export interface ExternalPluginsDiscoveryResult {
  plugins: DiscoveredExternalPlugin[]
  globalDir: string | null
  projectDir: string | null
}

export interface ExternalPluginAssets {
  id: string
  dirName: string
  scope: PluginScope
  manifest: ExternalPluginManifest
  scriptCode: string
  styleCode: string | null
}

export type ExternalPluginStatus = 'active' | 'disabled' | 'overridden' | 'error'

export interface ExternalPluginRecord {
  key: string
  stateKey: string
  scope: PluginScope
  dirName: string
  pluginDir: string
  manifest: ExternalPluginManifest | null
  enabled: boolean
  status: ExternalPluginStatus
  error?: string
  overriddenByScope?: PluginScope
}

export interface JustAPIPluginContext {
  pluginId: string
  pluginDirName: string
  scope: PluginScope
  apiVersion: number
  vue: typeof VueRuntime

  registerRequestTab: (contribution: RequestTabContribution) => () => void
  registerBodyEditor: (contribution: BodyEditorContribution) => () => void
  registerResponseTab: (contribution: ResponseTabContribution) => () => void
  registerRequestImporter: (contribution: RequestImporterContribution) => () => void
  registerRequestExporter: (contribution: RequestExporterContribution) => () => void
  registerCollectionImporter: (contribution: CollectionImporterContribution) => () => void
  useMiddleware: (middleware: RequestMiddleware) => () => void
  registerVariableProvider: (provider: DynamicVariableProvider) => () => void
  registerCommand: (def: CommandDefinition) => () => void

  getActiveRequest: () => ApiRequest
  getRequestExtension: <T = unknown>(key: string) => T | undefined
  setRequestExtension: <T = unknown>(key: string, value: T) => void
  getLastResponse: () => ApiResponse | null
  getLastExecutionContext: () => RequestExecutionContext | null
  showToast: (message: string, isError?: boolean) => void
  importParsedRequest: (request: ApiRequest) => void
  createEmptyRequest: (overrides?: Partial<ApiRequest>) => ApiRequest
}

export type PluginActivateFn = (ctx: JustAPIPluginContext) => void | Promise<void>
export type PluginDeactivateFn = () => void | Promise<void>

export interface ExternalPluginModule {
  activate?: PluginActivateFn
  deactivate?: PluginDeactivateFn
  default?:
    | PluginActivateFn
    | {
        activate?: PluginActivateFn
        deactivate?: PluginDeactivateFn
      }
}

