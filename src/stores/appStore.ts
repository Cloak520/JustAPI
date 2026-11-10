import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface RevealTarget {
  subDir: string
  fileName?: string
  requestId?: string
  group?: string
  timestamp: number
}

export const useAppStore = defineStore('app', () => {
  const sidebarVisible = ref(true)
  const revealTarget = ref<RevealTarget | null>(null)

  // 全局模态框控制
  const showQuickSearchModal = ref(false)
  const showSaveModal = ref(false)
  const showEnvModal = ref(false)
  const showNetworkModal = ref(false)
  const showPluginsModal = ref(false)

  // 全局 Toast
  const toastMessage = ref('')
  const toastIsError = ref(false)
  let toastTimer: ReturnType<typeof setTimeout> | null = null

  function showToast(msg: string, isError = false) {
    toastMessage.value = msg
    toastIsError.value = isError
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      toastMessage.value = ''
    }, 4000)
  }

  function toggleSidebar() {
    sidebarVisible.value = !sidebarVisible.value
  }

  function revealRequestInSidebar(tab: {
    subProjectDir?: string
    fileName?: string
    requestId?: string
    group?: string
    title?: string
  }): boolean {
    if (!tab.subProjectDir || (!tab.fileName && !tab.requestId)) {
      showToast('当前请求为临时草稿，尚未保存至本地项目文件', true)
      return false
    }
    sidebarVisible.value = true
    revealTarget.value = {
      subDir: tab.subProjectDir,
      fileName: tab.fileName,
      requestId: tab.requestId,
      group: tab.group,
      timestamp: Date.now()
    }
    return true
  }

  return {
    sidebarVisible,
    revealTarget,
    showQuickSearchModal,
    showSaveModal,
    showEnvModal,
    showNetworkModal,
    showPluginsModal,
    toastMessage,
    toastIsError,
    showToast,
    toggleSidebar,
    revealRequestInSidebar
  }
})

