import { defineStore } from 'pinia'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useStorage } from '@vueuse/core'
import {
  resolveHeaderLayers,
  resolveRequestUrl,
  type HeaderResolutionResult
} from '@/core/inheritance/resolver'
import { defaultVariableEngine } from '@/core/interpolation/engine'
import {
  buildDuplicateTitle,
  createEmptyRequest,
  normalizeRequest,
  sanitizeFileBaseName,
  structuredCloneSafe,
  syncPathParamsWithPath
} from '@/core/models/requestFactory'
import { defaultRequestPipeline } from '@/core/pipeline/defaultMiddlewares'
import type {
  RequestExecutionContext,
  RequestMiddleware
} from '@/core/pipeline/requestPipeline'
import * as formatterService from '@/services/formatterService'
import * as transportService from '@/services/transportService'
import { useAppStore } from './appStore'
import { useWorkspaceStore } from './workspaceStore'
import type {
  ApiRequest,
  ApiResponse,
  BodyType,
  HistoryItem,
  HttpMethod,
  KeyValuePair,
  TabSession
} from '@/types'

export interface TabRuntimeState {
  loading: boolean
  currentRequestId: string | null
  response: ApiResponse | null
  errorMessage: string | null
  lastContext?: RequestExecutionContext | null
}

function createDefaultTabSession(): TabSession {
  const draft = createEmptyRequest({ id: 'default_tab', name: '新建请求' })
  return {
    id: 'default_tab',
    title: '新建请求',
    method: 'GET',
    isDirty: false,
    draftRequest: draft
  }
}

export const useSessionStore = defineStore('session', () => {
  const workspaceStore = useWorkspaceStore()
  const appStore = useAppStore()

  // 持久化的 Tab 列表（不将大体积响应写入 localStorage，响应按 tabId 保存在内存 runtimeStates 中）
  const tabs = useStorage<TabSession[]>('justapi_open_tabs', [createDefaultTabSession()])
  const activeTabId = useStorage<string>('justapi_active_tab_id', 'default_tab')

  // 复用全局 defaultRequestPipeline 单例（支持插件在 main.ts 启动期注册 Middleware）
  const pipeline = defaultRequestPipeline

  // 每个 Tab 独立的请求执行状态与响应结果
  const runtimeStates = reactive<Record<string, TabRuntimeState>>({})

  function ensureRuntime(tabId: string): TabRuntimeState {
    if (!runtimeStates[tabId]) {
      runtimeStates[tabId] = {
        loading: false,
        currentRequestId: null,
        response: null,
        errorMessage: null,
        lastContext: null
      }
    }
    return runtimeStates[tabId]
  }

  // 当前工作区 BaseURL (无项目时默认 https://httpbin.org；有项目时跟随主/子项目配置实时同步)
  const baseUrl = ref('https://httpbin.org')

  const activeTab = computed<TabSession>(() => {
    if (!tabs.value || tabs.value.length === 0) {
      tabs.value = [createDefaultTabSession()]
    }
    const found = tabs.value.find(t => t.id === activeTabId.value)
    if (found) return found
    activeTabId.value = tabs.value[0].id
    return tabs.value[0]
  })

  watch(
    [
      () => workspaceStore.hasProject,
      () => workspaceStore.projectConfig?.baseUrl,
      () => activeTab.value?.subProjectDir,
      () => workspaceStore.subProjects
    ],
    () => {
      if (workspaceStore.hasProject) {
        baseUrl.value = workspaceStore.resolveEffectiveBaseUrl(
          activeTab.value?.subProjectDir
        )
      }
    },
    { immediate: true, deep: true }
  )

  async function commitBaseUrl(rawVal?: string): Promise<'project.json' | '.subproject.json' | null> {
    const val = (rawVal ?? baseUrl.value).trim()
    baseUrl.value = val
    if (!workspaceStore.hasProject || !workspaceStore.projectConfig) {
      return null
    }

    const subDir = activeTab.value?.subProjectDir
    const sub = workspaceStore.findSubProject(subDir)
    const currentEffective = workspaceStore.resolveEffectiveBaseUrl(subDir)
    if (val === currentEffective) {
      return null
    }

    if (sub) {
      const subConfig = sub.config
      const subBase = subConfig.baseUrl.trim()

      if (!subConfig.inheritBaseUrl) {
        await workspaceStore.updateSubProjectConfig(sub.dirName, {
          ...subConfig,
          baseUrl: val
        })
        return '.subproject.json'
      }

      if (subBase) {
        if (/^https?:\/\//i.test(subBase) || subBase.startsWith('{{')) {
          await workspaceStore.updateSubProjectConfig(sub.dirName, {
            ...subConfig,
            baseUrl: val
          })
          return '.subproject.json'
        }

        const normalizedSuffix = '/' + subBase.replace(/^\/+/, '')
        if (val.endsWith(normalizedSuffix)) {
          const nextProjectBase = val.slice(0, val.length - normalizedSuffix.length)
          if (workspaceStore.projectConfig.baseUrl !== nextProjectBase) {
            await workspaceStore.updateBaseUrl(nextProjectBase)
            return 'project.json'
          }
          return null
        }

        const normalizedProjectBase = workspaceStore.projectConfig.baseUrl.trim().replace(/\/+$/, '')
        if (normalizedProjectBase && val.startsWith(normalizedProjectBase + '/')) {
          const nextSubSuffix = val.slice(normalizedProjectBase.length)
          await workspaceStore.updateSubProjectConfig(sub.dirName, {
            ...subConfig,
            baseUrl: nextSubSuffix
          })
          return '.subproject.json'
        }

        await workspaceStore.updateSubProjectConfig(sub.dirName, {
          ...subConfig,
          inheritBaseUrl: false,
          baseUrl: val
        })
        return '.subproject.json'
      }
    }

    if (workspaceStore.projectConfig.baseUrl !== val) {
      await workspaceStore.updateBaseUrl(val)
      return 'project.json'
    }
    return null
  }

  const activeRequest = computed<ApiRequest>(() => {
    return activeTab.value.draftRequest
  })

  const activeRuntime = computed<TabRuntimeState>(() => {
    return ensureRuntime(activeTab.value.id)
  })

  const loading = computed(() => activeRuntime.value.loading)
  const currentRequestId = computed(() => activeRuntime.value.currentRequestId)
  const response = computed(() => activeRuntime.value.response)
  const errorMessage = computed(() => activeRuntime.value.errorMessage)
  const lastExecutionContext = computed(() => activeRuntime.value.lastContext ?? null)

  let suppressDirtyWatch = false

  // 自动将 path 中的 {id} / :id 与 pathParams 双向保持同步（切换 Tab 替换 draftRequest 时不误触发标脏）
  watch(
    [() => activeRequest.value, () => activeRequest.value?.path] as const,
    ([req, newPath], [oldReq, oldPath]) => {
      if (suppressDirtyWatch) return
      if (!req || req !== oldReq) return
      if (newPath !== undefined && newPath !== oldPath) {
        req.pathParams = syncPathParamsWithPath(newPath, req.pathParams || [])
      }
    }
  )

  // 仅当同一份 draftRequest 内部字段被用户编辑时自动标脏（切换 Tab/替换对象不触发）
  watch(
    activeRequest,
    (newReq, oldReq) => {
      if (suppressDirtyWatch) return
      if (newReq && oldReq && newReq === oldReq) {
        activeTab.value.method = newReq.method
        activeTab.value.isDirty = true
      }
    },
    { deep: true }
  )

  const activeVarMap = computed(() =>
    workspaceStore.getEffectiveVariableMap(activeTab.value.subProjectDir)
  )

  const resolvedUrl = computed(() =>
    resolveRequestUrl(
      baseUrl.value,
      activeRequest.value.path || '',
      activeRequest.value.pathParams || [],
      activeRequest.value.queryParams || []
    )
  )

  const interpolatedBaseUrl = computed(() =>
    defaultVariableEngine.interpolate(baseUrl.value, activeVarMap.value)
  )

  const interpolatedUrl = computed(() =>
    defaultVariableEngine.interpolate(resolvedUrl.value, activeVarMap.value)
  )

  const urlVariableTokens = computed(() =>
    defaultVariableEngine.inspectTokens(resolvedUrl.value, activeVarMap.value)
  )

  const inheritedHeaders = computed<KeyValuePair[]>(() =>
    workspaceStore.resolveEffectiveHeaders(activeTab.value.subProjectDir)
  )

  const headerResolution = computed<HeaderResolutionResult>(() =>
    resolveHeaderLayers(inheritedHeaders.value, activeRequest.value.headers || [])
  )

  function runWithoutDirty(fn: () => void) {
    suppressDirtyWatch = true
    try {
      fn()
    } finally {
      nextTick(() => {
        suppressDirtyWatch = false
      })
    }
  }

  function hydrateTabIfNeeded(tab: TabSession) {
    runWithoutDirty(() => {
      if (tab.draftRequest) {
        // 将内存中遗留的大体积 cachedResponse 迁至运行时并清除，避免污染 localStorage
        if (tab.cachedResponse) {
          const rt = ensureRuntime(tab.id)
          if (!rt.response) rt.response = tab.cachedResponse
          tab.cachedResponse = undefined
        }
        tab.draftRequest = normalizeRequest(tab.draftRequest)
        return
      }

      if (tab.subProjectDir && tab.fileName) {
        const sub = workspaceStore.findSubProject(tab.subProjectDir)
        const existing = sub?.requests.find(
          r => r.fileName === tab.fileName || r.id === tab.requestId
        )
        if (existing) {
          tab.draftRequest = normalizeRequest(structuredCloneSafe(existing))
          return
        }
      }

      tab.draftRequest = createEmptyRequest({
        id: tab.requestId || tab.id,
        name: tab.title,
        method: tab.method
      })
    })
  }

  function initSession() {
    if (!tabs.value || tabs.value.length === 0) {
      const def = createDefaultTabSession()
      tabs.value = [def]
      activeTabId.value = def.id
    }
    for (const t of tabs.value) {
      hydrateTabIfNeeded(t)
    }
    const curr = tabs.value.find(t => t.id === activeTabId.value) || tabs.value[0]
    if (curr) {
      activeTabId.value = curr.id
      ensureRuntime(curr.id)
    }
  }

  function switchTab(targetTabId: string) {
    if (activeTabId.value === targetTabId) return
    const target = tabs.value.find(t => t.id === targetTabId)
    if (!target) return
    hydrateTabIfNeeded(target)
    ensureRuntime(target.id)
    activeTabId.value = target.id
  }

  function newTab(initialReq?: Partial<ApiRequest>): TabSession {
    const id = crypto.randomUUID()
    const draft = createEmptyRequest({
      ...initialReq,
      id
    })
    const tab: TabSession = {
      id,
      title: draft.name,
      method: draft.method,
      isDirty: Boolean(initialReq),
      draftRequest: draft
    }
    tabs.value.push(tab)
    ensureRuntime(id)
    activeTabId.value = id
    return tab
  }

  function openTab(req: ApiRequest, subProjectDir?: string) {
    const existing = tabs.value.find(
      t =>
        (req.id && t.requestId === req.id && (!subProjectDir || t.subProjectDir === subProjectDir)) ||
        (req.fileName &&
          t.fileName === req.fileName &&
          (!subProjectDir || t.subProjectDir === subProjectDir))
    )
    if (existing) {
      if (!existing.isDirty || !existing.draftRequest) {
        runWithoutDirty(() => {
          existing.draftRequest = normalizeRequest(structuredCloneSafe(req))
          existing.title = existing.draftRequest.name
          existing.method = existing.draftRequest.method
          existing.group = existing.draftRequest.group
        })
      }
      ensureRuntime(existing.id)
      activeTabId.value = existing.id
      return
    }

    const id = crypto.randomUUID()
    const draft = normalizeRequest(structuredCloneSafe(req))
    const newItem: TabSession = {
      id,
      title: draft.name || draft.path || '未命名请求',
      method: draft.method,
      isDirty: false,
      subProjectDir,
      fileName: draft.fileName,
      requestId: draft.id,
      group: draft.group,
      draftRequest: draft
    }
    tabs.value.push(newItem)
    ensureRuntime(id)
    activeTabId.value = id
  }

  function closeTab(tabId: string) {
    const idx = tabs.value.findIndex(t => t.id === tabId)
    if (idx === -1) return

    const isClosingActive = activeTabId.value === tabId
    tabs.value.splice(idx, 1)
    delete runtimeStates[tabId]

    if (tabs.value.length === 0) {
      newTab()
    } else if (isClosingActive) {
      const nextIdx = Math.max(0, idx - 1)
      const nextTab = tabs.value[nextIdx]
      hydrateTabIfNeeded(nextTab)
      ensureRuntime(nextTab.id)
      activeTabId.value = nextTab.id
    }
  }

  function duplicateMemoryTab(sourceTabId: string) {
    const sourceTab = tabs.value.find(t => t.id === sourceTabId)
    if (!sourceTab) return
    hydrateTabIfNeeded(sourceTab)

    const id = crypto.randomUUID()
    const newTitle = buildDuplicateTitle(sourceTab.title || '未命名请求')
    const clonedDraft = normalizeRequest({
      ...structuredCloneSafe(sourceTab.draftRequest),
      id,
      name: newTitle,
      fileName: undefined,
      subProjectId: undefined
    })

    const newTabItem: TabSession = {
      id,
      title: newTitle,
      method: clonedDraft.method,
      isDirty: true,
      requestId: undefined,
      fileName: undefined,
      group: sourceTab.group,
      draftRequest: clonedDraft
    }

    const sourceIdx = tabs.value.findIndex(t => t.id === sourceTabId)
    if (sourceIdx !== -1) {
      tabs.value.splice(sourceIdx + 1, 0, newTabItem)
    } else {
      tabs.value.push(newTabItem)
    }

    ensureRuntime(id)
    activeTabId.value = id
  }

  async function duplicateActiveOrSubprojectRequest() {
    const tab = activeTab.value
    if (!tab) return

    if (tab.subProjectDir && workspaceStore.projectPath) {
      const cloned = await workspaceStore.duplicateRequest(tab.subProjectDir, {
        ...structuredCloneSafe(tab.draftRequest),
        id: tab.requestId || tab.draftRequest.id,
        name: tab.title || tab.draftRequest.path || '未命名请求',
        subProjectId: tab.subProjectDir,
        fileName: tab.fileName,
        group: tab.group || tab.draftRequest.group || undefined
      })
      if (cloned) {
        openTab(cloned, tab.subProjectDir)
      }
    } else {
      duplicateMemoryTab(tab.id)
    }
  }

  function closeOtherTabs(targetTabId: string) {
    const targetTab = tabs.value.find(t => t.id === targetTabId)
    if (!targetTab) return

    for (const t of tabs.value) {
      if (t.id !== targetTabId) {
        delete runtimeStates[t.id]
      }
    }
    tabs.value = [targetTab]
    hydrateTabIfNeeded(targetTab)
    ensureRuntime(targetTabId)
    activeTabId.value = targetTabId
  }

  function closeTabsToTheRight(targetTabId: string) {
    const targetIdx = tabs.value.findIndex(t => t.id === targetTabId)
    if (targetIdx === -1 || targetIdx === tabs.value.length - 1) return

    const activeIdx = tabs.value.findIndex(t => t.id === activeTabId.value)
    const removed = tabs.value.slice(targetIdx + 1)
    for (const r of removed) {
      delete runtimeStates[r.id]
    }
    tabs.value = tabs.value.slice(0, targetIdx + 1)

    if (activeIdx > targetIdx) {
      const targetTab = tabs.value[targetIdx]
      hydrateTabIfNeeded(targetTab)
      ensureRuntime(targetTab.id)
      activeTabId.value = targetTab.id
    }
  }

  function closeAllTabs() {
    for (const k of Object.keys(runtimeStates)) {
      delete runtimeStates[k]
    }
    tabs.value = []
    newTab()
  }

  function closeTabsForRequest(subProjectDir: string, fileName?: string, requestId?: string) {
    const matchingIds = tabs.value
      .filter(
        t =>
          (!t.subProjectDir || t.subProjectDir === subProjectDir) &&
          ((fileName && t.fileName === fileName) || (requestId && t.requestId === requestId))
      )
      .map(t => t.id)
    for (const id of matchingIds) {
      closeTab(id)
    }
  }

  function closeTabsForSubProject(subProjectDir: string) {
    const matchingIds = tabs.value
      .filter(t => t.subProjectDir === subProjectDir)
      .map(t => t.id)
    for (const id of matchingIds) {
      closeTab(id)
    }
  }

  function markCurrentDirty(dirty = true) {
    if (activeTab.value) {
      activeTab.value.isDirty = dirty
    }
  }

  /**
   * 统一保存激活 Tab 到指定（或当前）子项目，处理跨模块/分组迁移与文件名管理
   */
  async function saveActiveTab(options?: {
    subProjectDir?: string
    group?: string
    name?: string
  }): Promise<ApiRequest | null> {
    const tab = activeTab.value
    if (!tab) return null

    if (!workspaceStore.hasProject || workspaceStore.subProjects.length === 0) {
      appStore.showToast('请先在左侧边栏打开或创建一个本地项目及子项目模块，再执行保存', true)
      return null
    }

    const targetSubDir = options?.subProjectDir ?? tab.subProjectDir
    if (!targetSubDir) {
      appStore.showSaveModal = true
      return null
    }

    const reqName = (options?.name ?? tab.title ?? tab.draftRequest.path ?? '未命名请求').trim() || '未命名请求'
    const groupName =
      options && 'group' in options
        ? options.group?.trim() || undefined
        : tab.group || tab.draftRequest.group || undefined

    const baseFname = tab.fileName
      ? tab.fileName.includes('/')
        ? tab.fileName.split('/').pop()!
        : tab.fileName
      : `${sanitizeFileBaseName(reqName, 'req')}_${Date.now().toString().slice(-4)}.json`
    const newFileName = groupName ? `${groupName}/${baseFname}` : baseFname

    const prevSubDir = tab.subProjectDir
    const prevFileName = tab.fileName

    const reqId = tab.requestId || tab.draftRequest.id || crypto.randomUUID()
    const draft = tab.draftRequest
    const reqToSave: ApiRequest = normalizeRequest({
      ...structuredCloneSafe(draft),
      id: reqId,
      name: reqName,
      method: draft.method,
      path: draft.path.trim() || '/',
      subProjectId: targetSubDir,
      fileName: newFileName,
      group: groupName
    })

    const saved = await workspaceStore.saveRequest(targetSubDir, newFileName, reqToSave)

    // 新文件持久化成功后再清理旧位置文件，避免跨模块/分组保存失败导致原文件丢失
    if (prevSubDir && prevFileName && workspaceStore.projectPath) {
      const movedSub = prevSubDir !== targetSubDir
      const movedFile = prevFileName !== newFileName
      if (movedSub || movedFile) {
        try {
          await workspaceStore.deleteRequest(prevSubDir, prevFileName)
        } catch (err) {
          console.warn('清理旧位置请求文件失败 (可忽略):', err)
        }
      }
    }

    runWithoutDirty(() => {
      tab.title = reqName
      tab.method = saved.method
      tab.subProjectDir = targetSubDir
      tab.fileName = newFileName
      tab.requestId = reqId
      tab.group = groupName
      tab.isDirty = false
      tab.draftRequest.name = reqName
      tab.draftRequest.group = groupName
      tab.draftRequest.fileName = newFileName
      tab.draftRequest.subProjectId = targetSubDir
    })

    workspaceStore.currentSubProjectDir = targetSubDir
    return saved
  }

  async function autoSaveActiveTab(): Promise<void> {
    const tab = activeTab.value
    if (!tab?.subProjectDir || !tab.fileName || !workspaceStore.projectPath) {
      return
    }
    await saveActiveTab()
  }

  async function renameTab(tabId: string, newTitleRaw: string): Promise<void> {
    const tab = tabs.value.find(t => t.id === tabId)
    if (!tab) return
    const newTitle = newTitleRaw.trim() || '未命名请求'
    runWithoutDirty(() => {
      tab.title = newTitle
      tab.draftRequest.name = newTitle
      tab.isDirty = true
    })

    if (tab.subProjectDir && tab.fileName && workspaceStore.projectPath) {
      if (tab.id === activeTabId.value) {
        await saveActiveTab({ name: newTitle })
      } else {
        const updatedReq = normalizeRequest({
          ...structuredCloneSafe(tab.draftRequest),
          id: tab.requestId || tab.draftRequest.id,
          name: newTitle,
          fileName: tab.fileName,
          subProjectId: tab.subProjectDir,
          group: tab.group
        })
        await workspaceStore.saveRequest(tab.subProjectDir, tab.fileName, updatedReq)
        tab.isDirty = false
      }
    }
  }

  function syncRenamedRequest(
    subDir: string,
    fileName: string,
    reqId: string,
    newName: string,
    newPath: string
  ) {
    const openTabItem = tabs.value.find(
      t =>
        (t.fileName === fileName || t.requestId === reqId) &&
        (!t.subProjectDir || t.subProjectDir === subDir)
    )
    if (openTabItem) {
      runWithoutDirty(() => {
        openTabItem.title = newName
        openTabItem.draftRequest.name = newName
        openTabItem.draftRequest.path = newPath
      })
    }
  }

  async function sendActiveRequest(): Promise<void> {
    const targetTab = activeTab.value
    if (!targetTab) return
    const targetTabId = targetTab.id
    const rt = ensureRuntime(targetTabId)

    const requestSnapshot = structuredCloneSafe(targetTab.draftRequest)
    const subProjectDir = targetTab.subProjectDir
    const subConfig = workspaceStore.findSubProject(subProjectDir)?.config ?? null
    const effectiveBase = baseUrl.value

    const reqId = crypto.randomUUID()
    rt.loading = true
    rt.currentRequestId = reqId
    rt.errorMessage = null
    rt.response = null

    const ctx: RequestExecutionContext = {
      requestId: reqId,
      request: requestSnapshot,
      baseUrl: effectiveBase,
      subProjectDir,
      projectConfig: workspaceStore.projectConfig,
      subProjectConfig: subConfig,
      fallbackEnvironment: workspaceStore.activeEnvironment,
      networkSettings: workspaceStore.networkSettings,
      cookies: workspaceStore.sessionCookies,
      variableEngine: defaultVariableEngine,
      transport: transportService.sendRestRequest,
      varMap: new Map(),
      resolvedUrl: '',
      finalUrl: '',
      finalHeaders: [],
      finalBody: null,
      finalFormFields: null,
      metadata: {}
    }

    try {
      const resultCtx = await pipeline.execute(ctx)
      if (rt.currentRequestId !== reqId) return
      rt.lastContext = resultCtx
      if (resultCtx.response) {
        rt.response = resultCtx.response

        workspaceStore.mergeResponseCookies(resultCtx.finalUrl, resultCtx.response.cookies)

        try {
          await workspaceStore.recordHistory({
            id: crypto.randomUUID(),
            requestId: targetTab.requestId || requestSnapshot.id,
            name: requestSnapshot.path,
            method: requestSnapshot.method,
            url: resultCtx.finalUrl,
            status: resultCtx.response.status,
            durationMs: resultCtx.response.durationMs,
            timestamp: Date.now(),
            headers: resultCtx.finalHeaders,
            bodyType: requestSnapshot.bodyType,
            bodyContent: resultCtx.finalBody || undefined
          })
        } catch {
          // ignore history error
        }
      }
    } catch (err: any) {
      if (rt.currentRequestId !== reqId) return
      rt.errorMessage = err?.message || String(err)
      console.error(
        `%c[JustAPI ERROR]%c ${requestSnapshot.method} ${ctx.finalUrl || requestSnapshot.path}:`,
        'color:#ef4444;font-weight:bold',
        'color:inherit',
        err
      )
    } finally {
      if (rt.currentRequestId === reqId) {
        rt.loading = false
        rt.currentRequestId = null
      }
    }
  }

  async function cancelActiveRequest(): Promise<void> {
    const rt = activeRuntime.value
    if (!rt.loading || !rt.currentRequestId) return
    const idToCancel = rt.currentRequestId
    try {
      await transportService.cancelRestRequest(idToCancel)
    } catch {
      // ignore
    } finally {
      rt.loading = false
      rt.errorMessage = '请求已由用户手动取消'
      rt.currentRequestId = null
    }
  }

  function clearActiveResponse() {
    const rt = activeRuntime.value
    rt.response = null
    rt.errorMessage = null
    rt.lastContext = null
  }

  async function formatActiveJson(): Promise<void> {
    const req = activeRequest.value
    if (!req.bodyContent.trim()) return
    try {
      req.bodyContent = await formatterService.formatJsonFast(req.bodyContent)
    } catch (err: any) {
      appStore.showToast(`JSON 格式化失败: ${err?.message || err}`, true)
    }
  }

  async function minifyActiveJson(): Promise<void> {
    const req = activeRequest.value
    if (!req.bodyContent.trim()) return
    try {
      req.bodyContent = await formatterService.minifyJsonFast(req.bodyContent)
    } catch (err: any) {
      appStore.showToast(`JSON 压缩失败: ${err?.message || err}`, true)
    }
  }

  function loadHistoryItem(item: HistoryItem) {
    const currentTab = activeTab.value
    const isPristineDefault =
      currentTab &&
      !currentTab.subProjectDir &&
      !currentTab.isDirty &&
      currentTab.title === '新建请求' &&
      currentTab.draftRequest.path === '/'

    const method = (item.method || 'GET') as HttpMethod
    const path = item.url
    const restoredHeaders: KeyValuePair[] = (item.headers || []).map(([k, v]) => ({
      id: crypto.randomUUID(),
      key: k,
      value: v,
      enabled: true
    }))
    const bodyType = (item.bodyType as BodyType) || 'none'
    const bodyContent = item.bodyContent || ''

    if (isPristineDefault && currentTab) {
      runWithoutDirty(() => {
        currentTab.title = item.name || item.url
        currentTab.method = method
        currentTab.draftRequest = normalizeRequest({
          ...structuredCloneSafe(currentTab.draftRequest),
          name: currentTab.title,
          method,
          path,
          headers: restoredHeaders,
          bodyType,
          bodyContent
        })
      })
      clearActiveResponse()
    } else {
      const historyReq = normalizeRequest({
        id: crypto.randomUUID(),
        name: item.name || item.url,
        method,
        path,
        pathParams: [],
        queryParams: [],
        headers: restoredHeaders,
        bodyType,
        bodyContent
      })
      openTab(historyReq)
    }

    appStore.showToast(`已载入历史请求详情: [${method}] ${path}`)
  }

  function importParsedRequest(parsedReq: ApiRequest): void {
    const normalized = normalizeRequest(structuredCloneSafe(parsedReq))
    const currentTab = activeTab.value
    const isPristineDefault =
      currentTab &&
      !currentTab.subProjectDir &&
      !currentTab.isDirty &&
      currentTab.title === '新建请求' &&
      currentTab.draftRequest.path === '/' &&
      currentTab.draftRequest.bodyType === 'none' &&
      currentTab.draftRequest.headers.length === 0

    if (isPristineDefault && currentTab) {
      runWithoutDirty(() => {
        currentTab.title = normalized.name || normalized.path || '导入请求'
        currentTab.method = normalized.method
        currentTab.draftRequest = {
          ...normalized,
          id: currentTab.id
        }
        currentTab.isDirty = true
      })
      clearActiveResponse()
    } else {
      const id = crypto.randomUUID()
      const cloned = {
        ...normalized,
        id,
        fileName: undefined,
        subProjectId: undefined
      }
      const tab: TabSession = {
        id,
        title: cloned.name || cloned.path || '导入请求',
        method: cloned.method,
        isDirty: true,
        draftRequest: cloned
      }
      tabs.value.push(tab)
      ensureRuntime(id)
      activeTabId.value = id
    }
  }

  function buildExportPayload(): {
    request: ApiRequest
    resolvedUrl: string
    headers: [string, string][]
    body: string | null
  } {
    const reqSnapshot = structuredCloneSafe(activeRequest.value)
    const varMap = activeVarMap.value
    const resolved = defaultVariableEngine.interpolate(resolvedUrl.value, varMap)
    const headers: [string, string][] = headerResolution.value.sendableHeaders.map(h => [
      defaultVariableEngine.interpolate(h.key, varMap),
      defaultVariableEngine.interpolate(h.value, varMap)
    ])

    let body: string | null = null
    if (['json', 'raw'].includes(reqSnapshot.bodyType) && reqSnapshot.bodyContent) {
      body = defaultVariableEngine.interpolate(reqSnapshot.bodyContent, varMap)
    }

    if (reqSnapshot.formFields) {
      reqSnapshot.formFields = reqSnapshot.formFields.map(f => ({
        ...f,
        key: defaultVariableEngine.interpolate(f.key, varMap),
        value: defaultVariableEngine.interpolate(f.value, varMap)
      }))
    }

    return {
      request: reqSnapshot,
      resolvedUrl: resolved,
      headers,
      body
    }
  }

  function registerMiddleware(mw: RequestMiddleware): () => void {
    return pipeline.use(mw)
  }

  function handleTabTitleChange(newTitle: string) {
    if (!activeTab.value) return
    activeTab.value.title = newTitle
    activeTab.value.draftRequest.name = newTitle
    activeTab.value.isDirty = true
  }

  return {
    tabs,
    activeTabId,
    activeTab,
    activeRequest,
    activeRuntime,
    baseUrl,
    commitBaseUrl,
    loading,
    currentRequestId,
    response,
    errorMessage,
    lastExecutionContext,
    resolvedUrl,
    interpolatedBaseUrl,
    interpolatedUrl,
    urlVariableTokens,
    inheritedHeaders,
    headerResolution,
    pipeline,
    initSession,
    switchTab,
    newTab,
    openTab,
    closeTab,
    closeOtherTabs,
    closeTabsToTheRight,
    closeAllTabs,
    closeTabsForRequest,
    closeTabsForSubProject,
    duplicateMemoryTab,
    duplicateActiveOrSubprojectRequest,
    markCurrentDirty,
    handleTabTitleChange,
    renameTab,
    syncRenamedRequest,
    saveActiveTab,
    autoSaveActiveTab,
    sendActiveRequest,
    cancelActiveRequest,
    clearActiveResponse,
    formatActiveJson,
    minifyActiveJson,
    loadHistoryItem,
    importParsedRequest,
    buildExportPayload,
    registerMiddleware
  }
})
