import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { TabItem, ApiRequest, HttpMethod } from '@/types'
import { useRequestStore } from './requestStore'

export const useTabStore = defineStore('tab', () => {
  const tabs = ref<TabItem[]>([
    {
      id: 'default_tab',
      title: '新建请求',
      method: 'GET',
      isDirty: false
    }
  ])
  const activeTabId = ref<string>('default_tab')
  const showSaveModal = ref(false)

  function newTab() {
    const id = crypto.randomUUID()
    tabs.value.push({
      id,
      title: '新建请求',
      method: 'GET',
      isDirty: false
    })
    activeTabId.value = id

    const reqStore = useRequestStore()
    reqStore.method = 'GET'
    reqStore.path = '/get'
    reqStore.group = ''
    reqStore.queryParams = []
    reqStore.headers = []
    reqStore.bodyType = 'none'
    reqStore.bodyContent = ''
    reqStore.response = null
  }

  function openTab(req: ApiRequest, subProjectDir?: string) {
    // 检查是否已经打开
    const existing = tabs.value.find(t => t.requestId === req.id || (t.fileName && t.fileName === req.fileName))
    if (existing) {
      activeTabId.value = existing.id
      loadRequestToStore(req)
      return
    }

    const id = crypto.randomUUID()
    tabs.value.push({
      id,
      title: req.name || req.path || '未命名请求',
      method: req.method,
      isDirty: false,
      subProjectDir,
      fileName: req.fileName,
      requestId: req.id,
      group: req.group
    })
    activeTabId.value = id
    loadRequestToStore(req)
  }

  function loadRequestToStore(req: ApiRequest) {
    const reqStore = useRequestStore()
    reqStore.method = req.method
    reqStore.path = req.path
    reqStore.group = req.group || ''
    reqStore.pathParams = req.pathParams || []
    reqStore.queryParams = req.queryParams || []
    reqStore.headers = req.headers || []
    reqStore.bodyType = req.bodyType || 'none'
    reqStore.bodyContent = req.bodyContent || ''
    reqStore.response = null
  }

  function closeTab(tabId: string) {
    const idx = tabs.value.findIndex(t => t.id === tabId)
    if (idx === -1) return

    tabs.value.splice(idx, 1)
    if (tabs.value.length === 0) {
      newTab()
    } else if (activeTabId.value === tabId) {
      const nextIdx = Math.max(0, idx - 1)
      activeTabId.value = tabs.value[nextIdx].id
    }
  }

  function markCurrentDirty(dirty = true) {
    const curr = tabs.value.find(t => t.id === activeTabId.value)
    if (curr) {
      curr.isDirty = dirty
    }
  }

  function duplicateMemoryTab(sourceTabId: string) {
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

    tabs.value.push({
      ...JSON.parse(JSON.stringify(sourceTab)),
      id,
      title: newTitle,
      isDirty: true,
      requestId: undefined,
      fileName: undefined
    })
    activeTabId.value = id
  }

  return {
    tabs,
    activeTabId,
    showSaveModal,
    newTab,
    openTab,
    closeTab,
    duplicateMemoryTab,
    markCurrentDirty
  }
})

