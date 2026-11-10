import { getActivePinia } from 'pinia'
import { computed, ref } from 'vue'
import * as VueRuntime from 'vue'
import { defaultCommandRegistry, type CommandRegistry } from '@/core/commands/commandRegistry'
import { defaultVariableEngine, type VariableEngine } from '@/core/interpolation/engine'
import { createEmptyRequest } from '@/core/models/requestFactory'
import { defaultRequestPipeline } from '@/core/pipeline/defaultMiddlewares'
import type { RequestExecutionContext, RequestPipeline } from '@/core/pipeline/requestPipeline'
import {
  bodyEditorRegistry,
  collectionImporterRegistry,
  requestExporterRegistry,
  requestImporterRegistry,
  requestTabRegistry,
  responseTabRegistry
} from '@/core/registries/extensionRegistry'
import {
  discoverExternalPlugins,
  isTauriRuntime,
  readExternalPluginAssets,
  removeExternalPlugin
} from '@/services/pluginService'
import { useAppStore } from '@/stores/appStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { ApiRequest, ApiResponse } from '@/types'
import {
  EXTERNAL_PLUGIN_API_VERSION,
  type DiscoveredExternalPlugin,
  type ExternalPluginAssets,
  type ExternalPluginModule,
  type ExternalPluginRecord,
  type ExternalPluginsDiscoveryResult,
  type JustAPIPluginContext,
  type PluginActivateFn,
  type PluginDeactivateFn,
  type PluginScope
} from './types'

const DISABLED_PLUGINS_STORAGE_KEY = 'justapi_disabled_external_plugins'

const RESERVED_TAB_IDS = new Set(['headers', 'params', 'body', 'cookies'])
const RESERVED_BODY_IDS = new Set([
  'none',
  'json',
  'form-data',
  'x-www-form-urlencoded',
  'raw'
])
const RESERVED_PREFIXES = ['core.', 'builtin.']

export interface ExternalPluginBackend {
  discover: (projectPath?: string | null) => Promise<ExternalPluginsDiscoveryResult>
  readAssets: (
    scope: PluginScope,
    dirName: string,
    projectPath?: string | null
  ) => Promise<ExternalPluginAssets>
  remove?: (
    scope: PluginScope,
    dirName: string,
    projectPath?: string | null
  ) => Promise<void>
}

export type ExternalPluginModuleLoader = (
  assets: ExternalPluginAssets
) => Promise<ExternalPluginModule>

export interface ExternalPluginStateStorage {
  getDisabledKeys: (projectPath?: string | null) => string[] | Promise<string[]>
  setDisabledKeys: (keys: string[], projectPath?: string | null) => void | Promise<void>
}

export interface PluginHostRuntimeBridge {
  getActiveRequest: () => ApiRequest
  getLastResponse: () => ApiResponse | null
  getLastExecutionContext: () => RequestExecutionContext | null
  showToast: (message: string, isError?: boolean) => void
  importParsedRequest: (req: ApiRequest) => void
}

export interface ExternalPluginHostOptions {
  backend?: ExternalPluginBackend
  moduleLoader?: ExternalPluginModuleLoader
  storage?: ExternalPluginStateStorage
  runtimeBridge?: PluginHostRuntimeBridge
  requestPipeline?: RequestPipeline
  variableEngine?: VariableEngine
  commandRegistry?: CommandRegistry
}

export function createProjectPluginStateStorage(): ExternalPluginStateStorage {
  const readFallback = (): string[] => {
    if (typeof localStorage === 'undefined') return []
    try {
      const raw = localStorage.getItem(DISABLED_PLUGINS_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
    } catch {
      return []
    }
  }

  const writeFallback = (keys: string[]): void => {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(DISABLED_PLUGINS_STORAGE_KEY, JSON.stringify(keys))
    } catch {
      // ignore storage quota errors
    }
  }

  const resolveMatchingWorkspaceStore = (projectPath?: string | null) => {
    if (projectPath === null) return null
    const pinia = getActivePinia()
    if (!pinia) return null
    const workspaceStore = useWorkspaceStore(pinia)
    const activePath = workspaceStore.projectPath?.trim() || null
    if (!activePath || !workspaceStore.projectConfig) return null
    const targetPath = projectPath?.trim() || null
    if (targetPath && targetPath !== activePath) return null
    return workspaceStore
  }

  return {
    getDisabledKeys(projectPath) {
      const workspaceStore = resolveMatchingWorkspaceStore(projectPath)
      if (workspaceStore?.projectConfig) {
        const list = workspaceStore.projectConfig.disabledPlugins
        return Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string') : []
      }
      return readFallback()
    },
    async setDisabledKeys(keys, projectPath) {
      const workspaceStore = resolveMatchingWorkspaceStore(projectPath)
      if (workspaceStore) {
        await workspaceStore.setDisabledPlugins(keys)
        return
      }
      writeFallback(keys)
    }
  }
}

function createDefaultRuntimeBridge(): PluginHostRuntimeBridge {
  return {
    getActiveRequest: () => useSessionStore().activeRequest,
    getLastResponse: () => useSessionStore().response,
    getLastExecutionContext: () => useSessionStore().lastExecutionContext,
    showToast: (message: string, isError = false) => useAppStore().showToast(message, isError),
    importParsedRequest: (req: ApiRequest) => useSessionStore().importParsedRequest(req)
  }
}

export async function loadPluginModuleFromCode(
  assets: ExternalPluginAssets
): Promise<ExternalPluginModule> {
  const blob = new Blob([assets.scriptCode], { type: 'text/javascript' })
  const blobUrl = URL.createObjectURL(blob)
  try {
    return (await import(/* @vite-ignore */ blobUrl)) as ExternalPluginModule
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

function assertSafeContributionId(id: string, reservedSet?: Set<string>): void {
  const trimmed = id?.trim()
  if (!trimmed) {
    throw new Error('插件贡献项 id 不能为空')
  }
  if (reservedSet?.has(trimmed) || RESERVED_PREFIXES.some(prefix => trimmed.startsWith(prefix))) {
    throw new Error(`插件贡献项 id "${trimmed}" 与核心保留标识冲突，请使用插件专属命名空间`)
  }
}

function resolveLifecycleHandlers(mod: ExternalPluginModule): {
  activate?: PluginActivateFn
  deactivate?: PluginDeactivateFn
} {
  if (typeof mod.activate === 'function') {
    return { activate: mod.activate, deactivate: mod.deactivate }
  }
  if (typeof mod.default === 'function') {
    return { activate: mod.default, deactivate: mod.deactivate }
  }
  if (mod.default && typeof mod.default === 'object' && typeof mod.default.activate === 'function') {
    return {
      activate: mod.default.activate,
      deactivate: mod.default.deactivate ?? mod.deactivate
    }
  }
  return {}
}

export function installPluginHostGlobalBridge(): void {
  ;(globalThis as Record<string, unknown>).__JUSTAPI_HOST__ = {
    apiVersion: EXTERNAL_PLUGIN_API_VERSION,
    vue: VueRuntime
  }
}

interface ActivePluginHandle {
  key: string
  disposers: Array<() => void>
  deactivate?: PluginDeactivateFn
}

export class ExternalPluginHost {
  public readonly records = ref<ExternalPluginRecord[]>([])
  public readonly globalDir = ref<string | null>(null)
  public readonly projectDir = ref<string | null>(null)
  public readonly loading = ref(false)
  public readonly lastSyncError = ref<string | null>(null)
  public readonly activeCount = computed(
    () => this.records.value.filter(r => r.status === 'active').length
  )

  private readonly backend: ExternalPluginBackend
  private readonly moduleLoader: ExternalPluginModuleLoader
  private readonly storage: ExternalPluginStateStorage
  private readonly runtimeBridge: PluginHostRuntimeBridge
  private readonly requestPipeline: RequestPipeline
  private readonly variableEngine: VariableEngine
  private readonly commandRegistry: CommandRegistry

  private activeHandles = new Map<string, ActivePluginHandle>()
  private currentProjectPath: string | null = null
  private syncEpoch = 0
  private readonly customBackendProvided: boolean

  constructor(options: ExternalPluginHostOptions = {}) {
    this.customBackendProvided = Boolean(options.backend)
    this.backend = options.backend ?? {
      discover: discoverExternalPlugins,
      readAssets: readExternalPluginAssets,
      remove: removeExternalPlugin
    }
    this.moduleLoader = options.moduleLoader ?? loadPluginModuleFromCode
    this.storage = options.storage ?? createProjectPluginStateStorage()
    this.runtimeBridge = options.runtimeBridge ?? createDefaultRuntimeBridge()
    this.requestPipeline = options.requestPipeline ?? defaultRequestPipeline
    this.variableEngine = options.variableEngine ?? defaultVariableEngine
    this.commandRegistry = options.commandRegistry ?? defaultCommandRegistry
  }

  getCurrentProjectPath(): string | null {
    return this.currentProjectPath
  }

  private getStateKey(item: DiscoveredExternalPlugin): string {
    const idOrDir = item.manifest?.id?.trim() || item.dirName
    return `${item.scope}:${idOrDir}`
  }

  private getRecordKey(item: DiscoveredExternalPlugin): string {
    return `${item.scope}:${item.dirName}`
  }

  private createScopedContext(
    assets: ExternalPluginAssets,
    disposers: Array<() => void>
  ): JustAPIPluginContext {
    const track = (fn: () => void): (() => void) => {
      let disposed = false
      const wrapped = () => {
        if (disposed) return
        disposed = true
        fn()
      }
      disposers.push(wrapped)
      return wrapped
    }

    const runtimeBridge = this.runtimeBridge
    const pipeline = this.requestPipeline
    const variableEngine = this.variableEngine
    const commandRegistry = this.commandRegistry

    return {
      pluginId: assets.id,
      pluginDirName: assets.dirName,
      scope: assets.scope,
      apiVersion: EXTERNAL_PLUGIN_API_VERSION,
      vue: VueRuntime,

      registerRequestTab(contribution) {
        assertSafeContributionId(contribution.id, RESERVED_TAB_IDS)
        return track(requestTabRegistry.register(contribution))
      },
      registerBodyEditor(contribution) {
        assertSafeContributionId(contribution.id, RESERVED_BODY_IDS)
        return track(bodyEditorRegistry.register(contribution))
      },
      registerResponseTab(contribution) {
        assertSafeContributionId(contribution.id, RESERVED_TAB_IDS)
        return track(responseTabRegistry.register(contribution))
      },
      registerRequestImporter(contribution) {
        assertSafeContributionId(contribution.id)
        return track(requestImporterRegistry.register(contribution))
      },
      registerRequestExporter(contribution) {
        assertSafeContributionId(contribution.id)
        return track(requestExporterRegistry.register(contribution))
      },
      registerCollectionImporter(contribution) {
        assertSafeContributionId(contribution.id)
        return track(collectionImporterRegistry.register(contribution))
      },
      useMiddleware(middleware) {
        assertSafeContributionId(middleware.id)
        return track(pipeline.use(middleware))
      },
      registerVariableProvider(provider) {
        assertSafeContributionId(provider.name)
        return track(variableEngine.registerProvider(provider))
      },
      registerCommand(def) {
        assertSafeContributionId(def.id)
        return track(commandRegistry.register(def))
      },

      getActiveRequest: () => runtimeBridge.getActiveRequest(),
      getRequestExtension: <T = unknown>(key: string) => {
        const req = runtimeBridge.getActiveRequest()
        return req.extensions?.[key] as T | undefined
      },
      setRequestExtension: <T = unknown>(key: string, value: T) => {
        const req = runtimeBridge.getActiveRequest()
        req.extensions = {
          ...(req.extensions || {}),
          [key]: value
        }
      },
      getLastResponse: () => runtimeBridge.getLastResponse(),
      getLastExecutionContext: () => runtimeBridge.getLastExecutionContext(),
      showToast: (msg, isError = false) => runtimeBridge.showToast(msg, isError),
      importParsedRequest: req => runtimeBridge.importParsedRequest(req),
      createEmptyRequest: overrides => createEmptyRequest(overrides)
    }
  }

  private injectStyle(pluginKey: string, styleCode: string | null): (() => void) | null {
    if (!styleCode || typeof document === 'undefined') return null
    const styleEl = document.createElement('style')
    styleEl.setAttribute('data-justapi-plugin', pluginKey)
    styleEl.textContent = styleCode
    document.head.appendChild(styleEl)
    return () => {
      styleEl.remove()
    }
  }

  private async unloadHandle(handle: ActivePluginHandle): Promise<void> {
    if (handle.deactivate) {
      try {
        await handle.deactivate()
      } catch (err) {
        console.error(`[JustAPI Plugin] 卸载钩子执行失败 (${handle.key}):`, err)
      }
    }

    for (let i = handle.disposers.length - 1; i >= 0; i--) {
      try {
        handle.disposers[i]()
      } catch (err) {
        console.error(`[JustAPI Plugin] 清理资源失败 (${handle.key}):`, err)
      }
    }
    handle.disposers.length = 0
  }

  async unloadAll(): Promise<void> {
    const entries = Array.from(this.activeHandles.values())
    this.activeHandles.clear()
    for (const handle of entries) {
      await this.unloadHandle(handle)
    }
  }

  async sync(projectPath?: string | null): Promise<void> {
    const normalizedPath = projectPath?.trim() || null
    this.currentProjectPath = normalizedPath

    if (!this.customBackendProvided && !isTauriRuntime()) {
      await this.unloadAll()
      this.records.value = []
      return
    }

    const epoch = ++this.syncEpoch
    this.loading.value = true
    this.lastSyncError.value = null

    try {
      installPluginHostGlobalBridge()
      await this.unloadAll()

      const discovery = await this.backend.discover(normalizedPath)
      if (epoch !== this.syncEpoch) return

      this.globalDir.value = discovery.globalDir
      this.projectDir.value = discovery.projectDir

      const disabledKeys = await this.storage.getDisabledKeys(normalizedPath)
      if (epoch !== this.syncEpoch) return
      const disabledSet = new Set(disabledKeys)
      const nextRecords: ExternalPluginRecord[] = []
      const activeScopeByPluginId = new Map<string, PluginScope>()

      // discovery.plugins 已按 project > global > bundled 排序，高优先级作用域可覆盖同 ID 插件
      for (const item of discovery.plugins) {
        const key = this.getRecordKey(item)
        const stateKey = this.getStateKey(item)
        const enabled = !disabledSet.has(stateKey)

        if (item.error || !item.manifest) {
          nextRecords.push({
            key,
            stateKey,
            scope: item.scope,
            dirName: item.dirName,
            pluginDir: item.pluginDir,
            manifest: item.manifest,
            enabled,
            status: 'error',
            error: item.error || '插件清单无效'
          })
          continue
        }

        const pluginId = item.manifest.id.trim()
        if (!enabled) {
          nextRecords.push({
            key,
            stateKey,
            scope: item.scope,
            dirName: item.dirName,
            pluginDir: item.pluginDir,
            manifest: item.manifest,
            enabled: false,
            status: 'disabled'
          })
          continue
        }

        const activeWinnerScope = activeScopeByPluginId.get(pluginId)
        if (activeWinnerScope) {
          nextRecords.push({
            key,
            stateKey,
            scope: item.scope,
            dirName: item.dirName,
            pluginDir: item.pluginDir,
            manifest: item.manifest,
            enabled: true,
            status: 'overridden',
            overriddenByScope: activeWinnerScope
          })
          continue
        }

        const disposers: Array<() => void> = []
        try {
          const assets = await this.backend.readAssets(item.scope, item.dirName, normalizedPath)
          if (epoch !== this.syncEpoch) return

          const styleDispose = this.injectStyle(key, assets.styleCode)
          if (styleDispose) disposers.push(styleDispose)

          const mod = await this.moduleLoader(assets)
          if (epoch !== this.syncEpoch) {
            for (const d of disposers) d()
            return
          }

          const { activate, deactivate } = resolveLifecycleHandlers(mod)
          if (!activate) {
            throw new Error(`插件入口 "${item.manifest.entry}" 未导出 activate(ctx) 或默认激活函数`)
          }

          const scopedCtx = this.createScopedContext(assets, disposers)
          await activate(scopedCtx)

          if (epoch !== this.syncEpoch) {
            await this.unloadHandle({ key, disposers, deactivate })
            return
          }

          this.activeHandles.set(key, { key, disposers, deactivate })
          activeScopeByPluginId.set(pluginId, item.scope)
          nextRecords.push({
            key,
            stateKey,
            scope: item.scope,
            dirName: item.dirName,
            pluginDir: item.pluginDir,
            manifest: item.manifest,
            enabled: true,
            status: 'active'
          })
        } catch (err: any) {
          for (let i = disposers.length - 1; i >= 0; i--) {
            try {
              disposers[i]()
            } catch {
              // ignore cleanup errors during failed activation
            }
          }
          const message = err?.message || String(err)
          console.error(`[JustAPI Plugin] 加载插件失败 (${key}):`, err)
          nextRecords.push({
            key,
            stateKey,
            scope: item.scope,
            dirName: item.dirName,
            pluginDir: item.pluginDir,
            manifest: item.manifest,
            enabled: true,
            status: 'error',
            error: message
          })
        }
      }

      if (epoch === this.syncEpoch) {
        this.records.value = nextRecords
      }
    } catch (err: any) {
      if (epoch === this.syncEpoch) {
        this.lastSyncError.value = err?.message || String(err)
        console.error('[JustAPI Plugin] 扫描外置插件失败:', err)
      }
    } finally {
      if (epoch === this.syncEpoch) {
        this.loading.value = false
      }
    }
  }

  async setPluginEnabled(recordKey: string, enabled: boolean): Promise<void> {
    const rec = this.records.value.find(r => r.key === recordKey)
    if (!rec) return

    const disabledSet = new Set(await this.storage.getDisabledKeys(this.currentProjectPath))
    if (enabled) {
      disabledSet.delete(rec.stateKey)
    } else {
      disabledSet.add(rec.stateKey)
    }
    await this.storage.setDisabledKeys(Array.from(disabledSet), this.currentProjectPath)

    await this.sync(this.currentProjectPath)
  }

  async removePlugin(recordKey: string): Promise<void> {
    const rec = this.records.value.find(r => r.key === recordKey)
    if (!rec) return

    if (rec.scope === 'bundled') {
      throw new Error('随应用内置的官方插件不可移除，可在插件管理中使用开关禁用')
    }

    if (!this.backend.remove) {
      throw new Error('当前插件后端不支持移除本地插件')
    }

    const activeHandle = this.activeHandles.get(rec.key)
    if (activeHandle) {
      this.activeHandles.delete(rec.key)
      await this.unloadHandle(activeHandle)
    }

    try {
      await this.backend.remove(rec.scope, rec.dirName, this.currentProjectPath)
    } catch (err) {
      await this.sync(this.currentProjectPath)
      throw err
    }

    try {
      const currentDisabled = await this.storage.getDisabledKeys(this.currentProjectPath)
      if (currentDisabled.includes(rec.stateKey)) {
        const cleaned = currentDisabled.filter(k => k !== rec.stateKey)
        await this.storage.setDisabledKeys(cleaned, this.currentProjectPath)
      }
    } finally {
      await this.sync(this.currentProjectPath)
    }
  }

  async reload(): Promise<void> {
    await this.sync(this.currentProjectPath)
  }
}

export const defaultExternalPluginHost = new ExternalPluginHost()

