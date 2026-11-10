import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useStorage } from '@vueuse/core'
import {
  resolveEffectiveBaseUrl as resolveBaseUrlCore,
  resolveInheritedHeaders as resolveInheritedHeadersCore
} from '@/core/inheritance/resolver'
import {
  defaultVariableEngine,
  resolveEffectiveVariableMap,
  type VariableSourceInfo
} from '@/core/interpolation/engine'
import {
  buildDuplicateTitle,
  normalizeRequest,
  sanitizeFileBaseName,
  structuredCloneSafe
} from '@/core/models/requestFactory'
import {
  collectionImporterRegistry,
  type CollectionImporterContribution
} from '@/core/registries/extensionRegistry'
import * as workspaceService from '@/services/workspaceService'
import { useAppStore } from './appStore'
import type {
  ApiRequest,
  CollectionSyncSource,
  CookieItem,
  Environment,
  HistoryItem,
  KeyValuePair,
  MergeStats,
  NetworkSettings,
  ProjectConfig,
  SubProjectConfig,
  SubProjectData
} from '@/types'

export function resolveSubProjectSyncSource(
  config?: SubProjectConfig | null
): CollectionSyncSource | null {
  if (!config) return null
  if (config.collectionSource?.importerId && config.collectionSource?.source?.trim()) {
    return {
      importerId: config.collectionSource.importerId,
      source: config.collectionSource.source.trim()
    }
  }
  if (config.swaggerSourceUrl?.trim()) {
    return {
      importerId: 'justapi.swagger',
      source: config.swaggerSourceUrl.trim()
    }
  }
  return null
}

export interface RecentProject {
  path: string
  name: string
  lastOpened: number
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const appStore = useAppStore()

  const projectPath = ref<string | null>(null)
  const projectConfig = ref<ProjectConfig | null>(null)
  const subProjects = ref<SubProjectData[]>([])
  const history = ref<HistoryItem[]>([])
  const currentSubProjectDir = ref<string | null>(null)
  const refreshingCollectionDir = ref<string | null>(null)

  const recentProjects = useStorage<RecentProject[]>('justapi_recent_projects', [])

  const globalEnvironments = useStorage<Environment[]>('justapi_global_environments', [
    {
      id: 'env_dev',
      name: 'Development',
      variables: {
        baseUrl: 'http://localhost:6674',
        env: 'dev'
      }
    }
  ])
  const globalActiveEnvId = useStorage<string | null>('justapi_global_active_env_id', 'env_dev')

  const networkSettings = useStorage<NetworkSettings>('justapi_network_settings', {
    dangerouslyDisableSsl: false,
    enableProxy: false,
    proxyUrl: 'http://127.0.0.1:7890',
    enableCookieJar: true
  })

  const sessionCookies = useStorage<CookieItem[]>('justapi_session_cookies', [])

  const hasProject = computed(() => Boolean(projectPath.value && projectConfig.value))

  let isHydratingProject = false

  watch(
    networkSettings,
    async newVal => {
      if (isHydratingProject) return
      if (hasProject.value && projectConfig.value) {
        await updateNetworkSettings(newVal)
      }
    },
    { deep: true }
  )

  function findSubProject(subProjectDir?: string | null): SubProjectData | undefined {
    if (!subProjectDir) return undefined
    return subProjects.value.find(s => s.dirName === subProjectDir)
  }

  async function pickAndOpenProject(): Promise<boolean> {
    try {
      const selected = await workspaceService.pickProjectFolder()
      if (selected) {
        await loadProject(selected)
        return true
      }
      return false
    } catch (err: any) {
      appStore.showToast(`打开项目失败: ${err?.message || err}`, true)
      return false
    }
  }

  async function loadProject(path: string): Promise<void> {
    isHydratingProject = true
    try {
      const data = await workspaceService.loadProjectFromDir(path)
      projectPath.value = data.path
      projectConfig.value = data.config
      subProjects.value = data.subProjects
      history.value = data.history

      if (
        data.subProjects.length > 0 &&
        (!currentSubProjectDir.value ||
          !data.subProjects.some(s => s.dirName === currentSubProjectDir.value))
      ) {
        currentSubProjectDir.value = data.subProjects[0].dirName
      } else if (data.subProjects.length === 0) {
        currentSubProjectDir.value = null
      }

      if (data.config.networkSettings) {
        networkSettings.value = { ...data.config.networkSettings }
      }

      const existingIdx = recentProjects.value.findIndex(p => p.path === path)
      if (existingIdx !== -1) {
        recentProjects.value.splice(existingIdx, 1)
      }
      recentProjects.value.unshift({
        path,
        name: data.config.name,
        lastOpened: Date.now()
      })
      if (recentProjects.value.length > 10) {
        recentProjects.value.length = 10
      }
    } catch (err: any) {
      appStore.showToast(`加载项目出错: ${err?.message || err}`, true)
    } finally {
      isHydratingProject = false
    }
  }

  async function saveProjectConfig(): Promise<void> {
    if (!projectPath.value || !projectConfig.value) return
    await workspaceService.saveProjectConfig(projectPath.value, projectConfig.value)
  }

  async function updateBaseUrl(newBaseUrl: string): Promise<void> {
    if (!projectPath.value || !projectConfig.value) return
    projectConfig.value.baseUrl = newBaseUrl.trim()
    await saveProjectConfig()
  }

  async function updateNetworkSettings(settings: NetworkSettings): Promise<void> {
    if (!projectPath.value || !projectConfig.value) return
    projectConfig.value.networkSettings = { ...settings }
    await saveProjectConfig()
  }

  async function setDisabledPlugins(keys: string[]): Promise<void> {
    if (!projectPath.value || !projectConfig.value) return
    const prev = projectConfig.value.disabledPlugins
      ? [...projectConfig.value.disabledPlugins]
      : undefined
    const normalized = Array.from(new Set(keys.filter(Boolean)))
    projectConfig.value.disabledPlugins = normalized.length > 0 ? normalized : undefined
    try {
      await saveProjectConfig()
    } catch (err) {
      projectConfig.value.disabledPlugins = prev
      throw err
    }
  }

  async function createSubProject(
    name: string,
    dirName: string,
    baseUrl?: string
  ): Promise<string | null> {
    if (!projectPath.value) return null
    const cleanDir = dirName.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
    if (!cleanDir) return null

    const config: SubProjectConfig = {
      id: cleanDir,
      name: name.trim() || cleanDir,
      baseUrl: baseUrl?.trim() || '',
      inheritBaseUrl: true,
      headers: [],
      inheritHeaders: true,
      variables: {},
      inheritVariables: true
    }

    await workspaceService.createSubProject(projectPath.value, cleanDir, config)
    subProjects.value.push({
      config,
      dirName: cleanDir,
      requests: []
    })
    currentSubProjectDir.value = cleanDir
    return cleanDir
  }

  async function updateSubProjectConfig(dirName: string, config: SubProjectConfig): Promise<void> {
    if (!projectPath.value) return
    const sub = findSubProject(dirName)
    if (sub) {
      sub.config = structuredCloneSafe(config)
    }
    await workspaceService.saveSubProjectConfig(projectPath.value, dirName, config)
  }

  async function deleteSubProject(dirName: string): Promise<void> {
    if (!projectPath.value) return
    await workspaceService.deleteSubProject(projectPath.value, dirName)
    subProjects.value = subProjects.value.filter(s => s.dirName !== dirName)
    if (currentSubProjectDir.value === dirName) {
      currentSubProjectDir.value = subProjects.value[0]?.dirName || null
    }
  }

  async function saveRequest(
    subProjectDir: string,
    fileName: string,
    req: ApiRequest
  ): Promise<ApiRequest> {
    const cleanFname = fileName.endsWith('.json') ? fileName : `${fileName}.json`
    const toSave = normalizeRequest({
      ...structuredCloneSafe(req),
      subProjectId: subProjectDir,
      fileName: cleanFname
    })

    if (projectPath.value) {
      await workspaceService.saveRequestFile(projectPath.value, subProjectDir, cleanFname, toSave)
    }

    const sub = findSubProject(subProjectDir)
    if (sub) {
      const idx = sub.requests.findIndex(r => r.id === toSave.id || r.fileName === cleanFname)
      if (idx !== -1) {
        sub.requests[idx] = toSave
      } else {
        sub.requests.push(toSave)
      }
    }
    return toSave
  }

  async function duplicateRequest(
    subProjectDir: string,
    req: ApiRequest
  ): Promise<ApiRequest | null> {
    if (!projectPath.value) return null
    const sub = findSubProject(subProjectDir)
    if (!sub) return null

    const newName = buildDuplicateTitle(req.name || req.path || '未命名请求')
    const groupName = req.group || undefined
    const cleanBase = sanitizeFileBaseName(newName, 'req')
    const baseFname = `${cleanBase}_${Date.now().toString().slice(-4)}.json`
    const newFileName = groupName ? `${groupName}/${baseFname}` : baseFname

    const clonedReq: ApiRequest = normalizeRequest({
      ...structuredCloneSafe(req),
      id: crypto.randomUUID(),
      name: newName,
      subProjectId: subProjectDir,
      fileName: newFileName,
      group: groupName
    })

    return saveRequest(subProjectDir, newFileName, clonedReq)
  }

  async function deleteRequest(subProjectDir: string, fileName: string): Promise<void> {
    if (!projectPath.value) return
    await workspaceService.deleteRequestFile(projectPath.value, subProjectDir, fileName)
    const sub = findSubProject(subProjectDir)
    if (sub) {
      sub.requests = sub.requests.filter(r => r.fileName !== fileName)
    }
  }

  async function recordHistory(item: HistoryItem): Promise<void> {
    history.value.unshift(item)
    if (history.value.length > 200) {
      history.value.length = 200
    }
    if (projectPath.value) {
      await workspaceService.recordHistory(projectPath.value, item)
    }
  }

  async function clearHistory(): Promise<void> {
    history.value = []
    if (projectPath.value) {
      await workspaceService.clearHistory(projectPath.value)
    }
  }

  async function deleteHistoryItem(id: string): Promise<void> {
    history.value = history.value.filter(h => h.id !== id)
    if (projectPath.value) {
      try {
        await workspaceService.deleteHistoryItem(projectPath.value, id)
      } catch (err) {
        console.error('删除历史记录失败', err)
      }
    }
  }

  async function resolveCollectionImporter(
    rawText: string,
    source: string,
    importerId?: string
  ): Promise<CollectionImporterContribution> {
    if (importerId && importerId !== 'auto') {
      const explicit = collectionImporterRegistry.get(importerId)
      if (!explicit) {
        throw new Error(`未找到或未启用导入插件 [${importerId}]，请先在「外置插件」中检查`)
      }
      return explicit
    }

    const importers = collectionImporterRegistry.list()
    if (importers.length === 0) {
      throw new Error('暂无可用的集合导入插件，请先在「外置插件」中启用或安装文档导入插件')
    }

    for (const candidate of importers) {
      if (!candidate.supports || (await candidate.supports(rawText, source))) {
        return candidate
      }
    }

    if (importers.length === 1) {
      return importers[0]
    }
    throw new Error('未能自动识别该文档格式，请在下拉框中手动选择导入插件')
  }

  async function importCollection(
    subProjectDir: string,
    source: string,
    importerId?: string,
    createSubProjectOptions?: { name: string }
  ): Promise<{ stats: MergeStats; importer: CollectionImporterContribution } | null> {
    if (!projectPath.value) return null
    const cleanSource = source.trim()
    if (!cleanSource) {
      throw new Error('文档来源 URL 或本地路径不能为空')
    }

    if (importerId && importerId !== 'auto') {
      if (!collectionImporterRegistry.get(importerId)) {
        throw new Error(`未找到或未启用导入插件 [${importerId}]，请先在「外置插件」中检查`)
      }
    } else if (collectionImporterRegistry.list().length === 0) {
      throw new Error('暂无可用的集合导入插件，请先在「外置插件」中启用或安装文档导入插件')
    }

    const rawText = await workspaceService.readImportSource(cleanSource)
    const importer = await resolveCollectionImporter(rawText, cleanSource, importerId)
    const parsed = await importer.parse(rawText, {
      parseStructuredDocument: workspaceService.parseStructuredDocument
    })

    let targetDir = subProjectDir
    if (createSubProjectOptions) {
      const createdDir = await createSubProject(
        createSubProjectOptions.name,
        subProjectDir,
        parsed.baseUrl
      )
      if (!createdDir) {
        throw new Error('创建目标子项目目录失败')
      }
      targetDir = createdDir
    }

    const syncSource: CollectionSyncSource | undefined =
      importer.supportsRefresh !== false
        ? { importerId: importer.id, source: cleanSource }
        : undefined

    const stats = await workspaceService.mergeAndSaveCollection(
      projectPath.value,
      targetDir,
      parsed,
      syncSource
    )
    await loadProject(projectPath.value)
    return { stats, importer }
  }

  async function refreshCollection(
    subProjectDir: string
  ): Promise<{ stats: MergeStats; importer: CollectionImporterContribution } | null> {
    if (!projectPath.value || refreshingCollectionDir.value) return null
    const sub = findSubProject(subProjectDir)
    const syncSource = resolveSubProjectSyncSource(sub?.config)
    if (!syncSource) {
      throw new Error(`子项目 [${sub?.config.name || subProjectDir}] 未绑定可刷新的文档源，请先执行导入`)
    }

    refreshingCollectionDir.value = subProjectDir
    try {
      return await importCollection(subProjectDir, syncSource.source, syncSource.importerId)
    } finally {
      refreshingCollectionDir.value = null
    }
  }

  async function refreshCollectionWithFeedback(subDir?: string): Promise<MergeStats | null> {
    if (!projectPath.value) {
      appStore.showToast('请先打开或选择一个本地项目', true)
      return null
    }

    const targetDir =
      subDir || currentSubProjectDir.value || subProjects.value[0]?.dirName
    if (!targetDir) {
      appStore.showToast('当前项目暂无子项目模块', true)
      return null
    }

    const sub = findSubProject(targetDir)
    const syncSource = resolveSubProjectSyncSource(sub?.config)
    if (!syncSource) {
      appStore.showToast(
        `子项目 [${sub?.config.name || targetDir}] 未绑定可刷新的文档源，请先执行导入`,
        true
      )
      return null
    }

    try {
      const res = await refreshCollection(targetDir)
      if (res) {
        const tag = res.importer.shortLabel || res.importer.label
        appStore.showToast(
          `${tag} 刷新完成：更新 ${res.stats.updated} 个，新增 ${res.stats.added} 个，已下线 ${res.stats.deprecated} 个`
        )
        return res.stats
      }
      return null
    } catch (err: any) {
      appStore.showToast(`刷新失败: ${err?.message || err}`, true)
      return null
    }
  }

  // 环境变量管理
  const environments = computed<Environment[]>(() => {
    if (projectConfig.value && Array.isArray(projectConfig.value.environments)) {
      return projectConfig.value.environments
    }
    return globalEnvironments.value
  })

  const activeEnvironment = computed<Environment | null>(() => {
    if (projectConfig.value && Array.isArray(projectConfig.value.environments)) {
      if (!projectConfig.value.activeEnvironmentId) return null
      return (
        projectConfig.value.environments.find(
          e => e.id === projectConfig.value?.activeEnvironmentId
        ) || null
      )
    }
    if (!globalActiveEnvId.value) return null
    return globalEnvironments.value.find(e => e.id === globalActiveEnvId.value) || null
  })

  async function setActiveEnvironment(id: string | null): Promise<void> {
    if (projectConfig.value) {
      projectConfig.value.activeEnvironmentId = id || undefined
      await saveProjectConfig()
    } else {
      globalActiveEnvId.value = id
    }
  }

  async function saveEnvironments(
    envs: Environment[],
    activeId?: string | null
  ): Promise<void> {
    if (projectConfig.value) {
      projectConfig.value.environments = envs
      if (activeId !== undefined) {
        projectConfig.value.activeEnvironmentId = activeId || undefined
      }
      await saveProjectConfig()
    } else {
      globalEnvironments.value = envs
      if (activeId !== undefined) {
        globalActiveEnvId.value = activeId
      }
    }
  }

  // Cookie Jar 管理
  function clearCookies() {
    sessionCookies.value = []
  }

  function removeCookie(index: number) {
    sessionCookies.value.splice(index, 1)
  }

  function addCookie(cookie: CookieItem) {
    sessionCookies.value.push(cookie)
  }

  function mergeResponseCookies(requestUrl: string, cookies?: CookieItem[]) {
    if (!networkSettings.value.enableCookieJar || !cookies || cookies.length === 0) {
      return
    }
    let defaultDomain = ''
    try {
      defaultDomain = new URL(requestUrl).hostname
    } catch {
      // ignore
    }

    for (const newCookie of cookies) {
      const cookieDomain = newCookie.domain || defaultDomain
      const existingIdx = sessionCookies.value.findIndex(
        c => c.name === newCookie.name && (c.domain || defaultDomain) === cookieDomain
      )
      const cookieToStore: CookieItem = {
        ...newCookie,
        domain: cookieDomain
      }
      if (existingIdx !== -1) {
        sessionCookies.value[existingIdx] = cookieToStore
      } else {
        sessionCookies.value.push(cookieToStore)
      }
    }
  }

  // 级联继承解析（统一委托给 src/core 领域层）
  function resolveEffectiveBaseUrl(subProjectDir?: string): string {
    const sub = findSubProject(subProjectDir)
    return resolveBaseUrlCore(projectConfig.value, sub?.config)
  }

  function resolveEffectiveHeaders(subProjectDir?: string): KeyValuePair[] {
    const sub = findSubProject(subProjectDir)
    return resolveInheritedHeadersCore(projectConfig.value, sub?.config)
  }

  function getEffectiveVariableMap(
    subProjectDir?: string
  ): Map<string, VariableSourceInfo> {
    const sub = findSubProject(subProjectDir)
    return resolveEffectiveVariableMap(
      projectConfig.value,
      sub?.config,
      activeEnvironment.value
    )
  }

  function interpolate(text: string, subProjectDir?: string): string {
    return defaultVariableEngine.interpolate(text, getEffectiveVariableMap(subProjectDir))
  }

  return {
    projectPath,
    projectConfig,
    subProjects,
    history,
    currentSubProjectDir,
    refreshingCollectionDir,
    recentProjects,
    hasProject,
    environments,
    activeEnvironment,
    networkSettings,
    sessionCookies,
    findSubProject,
    pickAndOpenProject,
    loadProject,
    saveProjectConfig,
    updateBaseUrl,
    updateNetworkSettings,
    setDisabledPlugins,
    createSubProject,
    updateSubProjectConfig,
    deleteSubProject,
    saveRequest,
    duplicateRequest,
    deleteRequest,
    recordHistory,
    clearHistory,
    deleteHistoryItem,
    importCollection,
    refreshCollection,
    refreshCollectionWithFeedback,
    setActiveEnvironment,
    saveEnvironments,
    clearCookies,
    removeCookie,
    addCookie,
    mergeResponseCookies,
    resolveEffectiveBaseUrl,
    resolveEffectiveHeaders,
    getEffectiveVariableMap,
    interpolate
  }
})

