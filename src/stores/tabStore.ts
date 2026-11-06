import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useStorage } from '@vueuse/core'
import type { TabItem, ApiRequest, ApiResponse } from '@/types'
import { useRequestStore } from './requestStore'
import { useProjectStore } from './projectStore'

export const useTabStore = defineStore('tab', () => {
  const defaultDraft: ApiRequest = {
    id: 'default_tab',
    name: '新建请求',
    method: 'GET',
    path: '/',
    pathParams: [],
    queryParams: [],
    headers: [],
    bodyType: 'none',
    bodyContent: ''
  }

  // 持久化保存打开的标签页列表与激活 Tab ID (应用重启自动恢复工作区)
  const tabs = useStorage<TabItem[]>('justapi_open_tabs', [
    {
      id: 'default_tab',
      title: '新建请求',
      method: 'GET',
      isDirty: false,
      draftRequest: defaultDraft
    }
  ])
  const activeTabId = useStorage<string>('justapi_active_tab_id', 'default_tab')
  const showSaveModal = ref(false)

  // 初始化会话状态恢复
  function initSession() {
    if (!tabs.value || tabs.value.length === 0) {
      tabs.value = [
        {
          id: 'default_tab',
          title: '新建请求',
          method: 'GET',
          isDirty: false,
          draftRequest: defaultDraft
        }
      ]
      activeTabId.value = 'default_tab'
    }

    const curr = tabs.value.find(t => t.id === activeTabId.value) || tabs.value[0]
    if (curr) {
      activeTabId.value = curr.id
      if (curr.draftRequest) {
        loadRequestToStore(curr.draftRequest, curr.cachedResponse)
      } else if (curr.subProjectDir && curr.fileName) {
        const projStore = useProjectStore()
        const sub = projStore.subProjects.find(s => s.dir_name === curr.subProjectDir)
        const existing = sub?.requests.find(r => r.fileName === curr.fileName || r.id === curr.requestId)
        if (existing) {
          curr.draftRequest = JSON.parse(JSON.stringify(existing))
          loadRequestToStore(existing, curr.cachedResponse)
        }
      }
    }
  }

  // 捕获当前 requestStore 状态快照至激活 Tab
  function captureCurrentDraft(): ApiRequest | null {
    const curr = tabs.value.find(t => t.id === activeTabId.value)
    if (!curr) return null

    const reqStore = useRequestStore()
    curr.cachedResponse = reqStore.response
    const draft: ApiRequest = {
      id: curr.requestId || curr.id,
      name: curr.title,
      method: reqStore.method,
      path: reqStore.path,
      pathParams: JSON.parse(JSON.stringify(reqStore.pathParams)),
      queryParams: JSON.parse(JSON.stringify(reqStore.queryParams)),
      headers: JSON.parse(JSON.stringify(reqStore.headers)),
      bodyType: reqStore.bodyType,
      bodyContent: reqStore.bodyContent,
      group: curr.group || reqStore.group || undefined,
      subProjectId: curr.subProjectDir,
      fileName: curr.fileName
    }
    curr.draftRequest = draft
    return draft
  }

  function loadRequestToStore(req: ApiRequest, cachedResponse?: ApiResponse | null) {
    const reqStore = useRequestStore()
    reqStore.method = req.method
    reqStore.path = req.path
    reqStore.group = req.group || ''
    reqStore.pathParams = req.pathParams ? JSON.parse(JSON.stringify(req.pathParams)) : []
    reqStore.queryParams = req.queryParams ? JSON.parse(JSON.stringify(req.queryParams)) : []
    reqStore.headers = req.headers ? JSON.parse(JSON.stringify(req.headers)) : []
    reqStore.bodyType = req.bodyType || 'none'
    reqStore.bodyContent = req.bodyContent || ''
    reqStore.response = cachedResponse ?? null
  }

  function switchTab(targetTabId: string) {
    if (activeTabId.value === targetTabId) return

    // 1. 暂存当前激活 Tab 的最新编辑状态
    captureCurrentDraft()

    // 2. 切换 Tab ID
    activeTabId.value = targetTabId

    // 3. 恢复目标 Tab 的请求内容
    const target = tabs.value.find(t => t.id === targetTabId)
    if (target) {
      if (target.draftRequest) {
        loadRequestToStore(target.draftRequest, target.cachedResponse)
      } else if (target.subProjectDir && target.fileName) {
        const projStore = useProjectStore()
        const sub = projStore.subProjects.find(s => s.dir_name === target.subProjectDir)
        const existing = sub?.requests.find(r => r.fileName === target.fileName || r.id === target.requestId)
        if (existing) {
          target.draftRequest = JSON.parse(JSON.stringify(existing))
          loadRequestToStore(existing, target.cachedResponse)
        }
      }
    }
  }

  function newTab() {
    captureCurrentDraft()

    const id = crypto.randomUUID()
    const newDraft: ApiRequest = {
      id,
      name: '新建请求',
      method: 'GET',
      path: '/',
      pathParams: [],
      queryParams: [],
      headers: [],
      bodyType: 'none',
      bodyContent: ''
    }

    tabs.value.push({
      id,
      title: '新建请求',
      method: 'GET',
      isDirty: false,
      draftRequest: newDraft
    })
    activeTabId.value = id
    loadRequestToStore(newDraft)
  }

  function openTab(req: ApiRequest, subProjectDir?: string) {
    captureCurrentDraft()

    // 检查是否已经打开
    const existing = tabs.value.find(t => t.requestId === req.id || (t.fileName && t.fileName === req.fileName))
    if (existing) {
      activeTabId.value = existing.id
      // 如果现有 Tab 处于未保存 (dirty) 状态，保留用户的编辑草稿；否则重新载入最新文件数据
      if (!existing.isDirty || !existing.draftRequest) {
        existing.draftRequest = JSON.parse(JSON.stringify(req))
        loadRequestToStore(req)
      } else {
        loadRequestToStore(existing.draftRequest)
      }
      return
    }

    const id = crypto.randomUUID()
    const draft = JSON.parse(JSON.stringify(req))
    tabs.value.push({
      id,
      title: req.name || req.path || '未命名请求',
      method: req.method,
      isDirty: false,
      subProjectDir,
      fileName: req.fileName,
      requestId: req.id,
      group: req.group,
      draftRequest: draft
    })
    activeTabId.value = id
    loadRequestToStore(draft)
  }

  function closeTab(tabId: string) {
    const idx = tabs.value.findIndex(t => t.id === tabId)
    if (idx === -1) return

    const isClosingActive = activeTabId.value === tabId
    tabs.value.splice(idx, 1)

    if (tabs.value.length === 0) {
      newTab()
    } else if (isClosingActive) {
      const nextIdx = Math.max(0, idx - 1)
      const nextTab = tabs.value[nextIdx]
      activeTabId.value = nextTab.id
      if (nextTab.draftRequest) {
        loadRequestToStore(nextTab.draftRequest, nextTab.cachedResponse)
      } else if (nextTab.subProjectDir && nextTab.fileName) {
        const projStore = useProjectStore()
        const sub = projStore.subProjects.find(s => s.dir_name === nextTab.subProjectDir)
        const existing = sub?.requests.find(r => r.fileName === nextTab.fileName || r.id === nextTab.requestId)
        if (existing) {
          nextTab.draftRequest = JSON.parse(JSON.stringify(existing))
          loadRequestToStore(existing, nextTab.cachedResponse)
        }
      }
    }
  }

  function markCurrentDirty(dirty = true) {
    const curr = tabs.value.find(t => t.id === activeTabId.value)
    if (curr) {
      curr.isDirty = dirty
    }
  }

  function duplicateMemoryTab(sourceTabId: string) {
    captureCurrentDraft()

    const sourceTab = tabs.value.find(t => t.id === sourceTabId)
    if (!sourceTab) return
    const id = crypto.randomUUID()
    const rawTitle = sourceTab.title || '未命名请求'
    const copyMatch = rawTitle.match(/^(.*?)(?:\s*\(副本(?:\s*(\d+))?\))?$/)
    let newTitle = ''
    if (copyMatch) {
      const baseTitle = copyMatch[1]
      const count = copyMatch[2] ? parseInt(copyMatch[2], 10) + 1 : (rawTitle.includes('(副本)') ? 2 : 1)
      newTitle = count === 1 ? `${baseTitle} (副本)` : `${baseTitle} (副本 ${count})`
    } else {
      newTitle = `${rawTitle} (副本)`
    }

    const clonedDraft = sourceTab.draftRequest
      ? JSON.parse(JSON.stringify(sourceTab.draftRequest))
      : undefined

    if (clonedDraft) {
      clonedDraft.id = id
      clonedDraft.name = newTitle
      clonedDraft.fileName = undefined
      clonedDraft.subProjectId = undefined
    }

    const newTabItem: TabItem = {
      ...JSON.parse(JSON.stringify(sourceTab)),
      id,
      title: newTitle,
      isDirty: true,
      requestId: undefined,
      fileName: undefined,
      draftRequest: clonedDraft
    }

    const sourceIdx = tabs.value.findIndex(t => t.id === sourceTabId)
    if (sourceIdx !== -1) {
      tabs.value.splice(sourceIdx + 1, 0, newTabItem)
    } else {
      tabs.value.push(newTabItem)
    }

    activeTabId.value = id
    if (clonedDraft) {
      loadRequestToStore(clonedDraft)
    }
  }

  function closeOtherTabs(targetTabId: string) {
    captureCurrentDraft()

    const targetTab = tabs.value.find(t => t.id === targetTabId)
    if (!targetTab) return

    tabs.value = [targetTab]
    activeTabId.value = targetTabId

    if (targetTab.draftRequest) {
      loadRequestToStore(targetTab.draftRequest, targetTab.cachedResponse)
    } else if (targetTab.subProjectDir && targetTab.fileName) {
      const projStore = useProjectStore()
      const sub = projStore.subProjects.find(s => s.dir_name === targetTab.subProjectDir)
      const existing = sub?.requests.find(r => r.fileName === targetTab.fileName || r.id === targetTab.requestId)
      if (existing) {
        targetTab.draftRequest = JSON.parse(JSON.stringify(existing))
        loadRequestToStore(existing, targetTab.cachedResponse)
      }
    }
  }

  function closeTabsToTheRight(targetTabId: string) {
    captureCurrentDraft()

    const targetIdx = tabs.value.findIndex(t => t.id === targetTabId)
    if (targetIdx === -1 || targetIdx === tabs.value.length - 1) return

    const activeIdx = tabs.value.findIndex(t => t.id === activeTabId.value)
    tabs.value = tabs.value.slice(0, targetIdx + 1)

    // 如果原先激活的 Tab 在右侧被关闭，自动激活目标 Tab
    if (activeIdx > targetIdx) {
      const targetTab = tabs.value[targetIdx]
      activeTabId.value = targetTab.id
      if (targetTab.draftRequest) {
        loadRequestToStore(targetTab.draftRequest, targetTab.cachedResponse)
      } else if (targetTab.subProjectDir && targetTab.fileName) {
        const projStore = useProjectStore()
        const sub = projStore.subProjects.find(s => s.dir_name === targetTab.subProjectDir)
        const existing = sub?.requests.find(r => r.fileName === targetTab.fileName || r.id === targetTab.requestId)
        if (existing) {
          targetTab.draftRequest = JSON.parse(JSON.stringify(existing))
          loadRequestToStore(existing, targetTab.cachedResponse)
        }
      }
    }
  }

  function closeAllTabs() {
    tabs.value = []
    newTab()
  }

  return {
    tabs,
    activeTabId,
    showSaveModal,
    initSession,
    switchTab,
    captureCurrentDraft,
    newTab,
    openTab,
    closeTab,
    closeOtherTabs,
    closeTabsToTheRight,
    closeAllTabs,
    duplicateMemoryTab,
    markCurrentDirty
  }
})
