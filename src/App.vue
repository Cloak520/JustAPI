<template>
  <div class="flex flex-col h-screen w-screen bg-background text-foreground select-none overflow-hidden">
    <!-- 顶部导航栏 / 窗口控制区 (支持 macOS 原生拖拽移动) -->
    <header class="flex items-center justify-between px-3 h-10 border-b border-border bg-card/60 backdrop-blur shrink-0" data-tauri-drag-region>
      <div class="flex items-center space-x-2">
        <!-- 侧边栏折叠切换按钮 (Cmd/Ctrl + \) -->
        <button
          @click="sidebarVisible = !sidebarVisible"
          class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition ml-16 sm:ml-0"
          title="展开/收起侧边栏 (Cmd/Ctrl + \)"
        >
          <PanelLeft class="w-4 h-4" :class="sidebarVisible ? 'text-primary' : 'text-muted-foreground'" />
        </button>

        <div class="flex items-center space-x-1.5 pl-1">
          <div class="w-5 h-5 rounded bg-primary/20 flex items-center justify-center text-primary font-bold text-[11px] tracking-tighter">
            J
          </div>
          <span class="font-semibold text-xs tracking-wide">JustAPI</span>
        </div>
      </div>

      <!-- 中间：当前 BaseURL 与级联继承显示 -->
      <div class="flex items-center space-x-2 text-xs">
        <span class="text-muted-foreground text-[11px] font-mono">BaseURL:</span>
        <div class="relative flex items-center">
          <input
            v-model="store.baseUrl"
            type="text"
            placeholder="https://api.example.com"
            class="font-mono text-xs px-2 py-0.5 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary w-64 text-foreground truncate"
          />
        </div>
      </div>

      <!-- 右侧：保存当前接口与快捷动作 -->
      <div class="flex items-center space-x-2 text-xs">
        <button
          @click="saveCurrentRequest"
          class="flex items-center space-x-1 px-2.5 py-1 rounded bg-muted hover:bg-muted/80 text-foreground text-[11px] font-medium transition"
          title="保存当前接口到子项目 (Cmd/Ctrl + S)"
        >
          <Save class="w-3.5 h-3.5 text-primary" />
          <span>保存</span>
        </button>
      </div>
    </header>

    <!-- 主工作区：左侧边栏 (项目与子项目树) + 右侧标签页与构建器 -->
    <div class="flex-1 flex overflow-hidden">
      <!-- 1. 左侧边栏 (树形项目与历史记录) -->
      <Sidebar v-show="sidebarVisible" class="w-72 shrink-0 transition-all" />

      <!-- 2. 右侧主工作台 -->
      <main class="flex-1 flex flex-col min-w-0 overflow-hidden">
        <!-- 标签页管理栏 -->
        <TabBar />

        <div class="flex-1 flex flex-col p-3 space-y-3 overflow-hidden">
          <!-- 上半区：请求构建器 -->
          <section class="flex flex-col space-y-2.5 shrink-0 max-h-[50%] min-h-[250px] p-3 rounded-xl border border-border bg-card/40 backdrop-blur shadow-sm">
            <UrlBar />
            <div class="flex-1 overflow-hidden min-h-0">
              <RequestBuilder />
            </div>
          </section>

          <!-- 下半区：响应查看器 -->
          <section class="flex-1 flex flex-col p-3 rounded-xl border border-border bg-card/40 backdrop-blur shadow-sm overflow-hidden min-h-0">
            <ResponseViewer />
          </section>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { PanelLeft, Save } from 'lucide-vue-next'
import { onKeyStroke } from '@vueuse/core'
import { useRequestStore } from '@/stores/requestStore'
import { useProjectStore } from '@/stores/projectStore'
import { useTabStore } from '@/stores/tabStore'
import Sidebar from '@/components/sidebar/Sidebar.vue'
import TabBar from '@/components/tabs/TabBar.vue'
import UrlBar from '@/components/request/UrlBar.vue'
import RequestBuilder from '@/components/request/RequestBuilder.vue'
import ResponseViewer from '@/components/response/ResponseViewer.vue'
import type { ApiRequest } from '@/types'

const store = useRequestStore()
const projectStore = useProjectStore()
const tabStore = useTabStore()

const sidebarVisible = ref(true)

// 当激活的 Tab 变更时，如果该 Tab 关联子项目，自动计算级联继承的有效 BaseURL 和 Headers
watch(() => tabStore.activeTabId, () => {
  const activeTab = tabStore.tabs.find(t => t.id === tabStore.activeTabId)
  if (activeTab?.subProjectDir) {
    store.baseUrl = projectStore.resolveEffectiveBaseUrl(activeTab.subProjectDir)
  }
})

// 保存当前请求到子项目
async function saveCurrentRequest() {
  const activeTab = tabStore.tabs.find(t => t.id === tabStore.activeTabId)

  // 如果尚未选择子项目，默认选用第一个子项目或提示创建
  let targetSubDir = activeTab?.subProjectDir || projectStore.currentSubProjectDir
  if (!targetSubDir && projectStore.subProjects.length > 0) {
    targetSubDir = projectStore.subProjects[0].dir_name
  }

  if (!projectStore.hasProject || !targetSubDir) {
    alert('请先在左侧边栏打开或创建一个本地项目及子项目模块，再执行保存！')
    return
  }

  const reqName = activeTab?.title || store.path || '未命名请求'
  const fileName = activeTab?.fileName || `${reqName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_')}_${Date.now().toString().slice(-4)}.json`

  const reqToSave: ApiRequest = {
    id: activeTab?.requestId || crypto.randomUUID(),
    name: reqName,
    method: store.method,
    path: store.path,
    pathParams: store.pathParams,
    queryParams: store.queryParams,
    headers: store.headers,
    bodyType: store.bodyType,
    bodyContent: store.bodyContent,
    subProjectId: targetSubDir,
    fileName
  }

  await projectStore.saveRequest(targetSubDir, fileName, reqToSave)
  if (activeTab) {
    activeTab.subProjectDir = targetSubDir
    activeTab.fileName = fileName
    activeTab.requestId = reqToSave.id
    activeTab.isDirty = false
  }
}

// 快捷键: Cmd/Ctrl + S 保存
onKeyStroke('s', (e) => {
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault()
    saveCurrentRequest()
  }
})

// 快捷键: Cmd/Ctrl + T 新建 Tab
onKeyStroke('t', (e) => {
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault()
    tabStore.newTab()
  }
})

// 快捷键: Cmd/Ctrl + W 关闭 Tab
onKeyStroke('w', (e) => {
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault()
    tabStore.closeTab(tabStore.activeTabId)
  }
})

// 快捷键: Cmd/Ctrl + \ 切换侧边栏
onKeyStroke('\\', (e) => {
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault()
    sidebarVisible.value = !sidebarVisible.value
  }
})
</script>
