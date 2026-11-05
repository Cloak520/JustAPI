<template>
  <div class="flex flex-col h-screen w-screen bg-background text-foreground select-none overflow-hidden">
    <!-- 顶部导航栏 / 窗口控制区 (支持 macOS 原生拖拽移动) -->
    <header class="relative z-30 flex items-center justify-between px-3 h-10 border-b border-border bg-card/60 backdrop-blur shrink-0" data-tauri-drag-region>
      <div class="flex items-center space-x-2">
        <!-- 侧边栏折叠切换按钮 (Cmd/Ctrl + \) -->
        <button
          @click="sidebarVisible = !sidebarVisible"
          :class="isMac ? 'ml-16' : 'ml-0'"
          class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
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
        <div class="relative flex items-center group">
          <input
            v-model="store.baseUrl"
            @change="handleBaseUrlChange"
            @blur="handleBaseUrlChange"
            @keydown.enter="handleBaseUrlChange"
            type="text"
            placeholder="https://api.example.com"
            class="font-mono text-xs px-2 py-0.5 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary w-64 text-foreground truncate transition"
            :title="projectStore.hasProject ? '主目录 BaseURL (回车或失焦自动保存到 project.json)' : 'BaseURL'"
          />
          <span
            v-if="baseUrlSavedHint"
            class="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-emerald-400 bg-card border border-emerald-500/30 px-1.5 py-0.2 rounded shadow whitespace-nowrap animate-in fade-in z-50 pointer-events-none"
          >
            已保存至 project.json
          </span>
        </div>
      </div>

      <!-- 右侧：环境变量快速切换 + 保存当前接口与快捷动作 -->
      <div class="flex items-center space-x-2 text-xs">
        <!-- 环境变量下拉切换器 -->
        <div ref="envDropdownRef" class="relative">
          <button
            @click="showEnvDropdown = !showEnvDropdown"
            class="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-muted/80 hover:bg-muted text-foreground text-[11px] font-medium transition border border-border/60"
            title="切换当前全局环境变量"
          >
            <Globe class="w-3 h-3" :class="projectStore.activeEnvironment ? 'text-emerald-400' : 'text-muted-foreground'" />
            <span class="max-w-[100px] truncate">{{ projectStore.activeEnvironment?.name || '无环境' }}</span>
            <ChevronDown class="w-3 h-3 text-muted-foreground" />
          </button>

          <!-- 环境下拉面板 -->
          <div
            v-if="showEnvDropdown"
            class="absolute right-0 top-full mt-1.5 w-52 rounded-xl border border-border bg-card p-1.5 shadow-2xl z-50 text-xs animate-in fade-in zoom-in-95"
            @click.stop
          >
            <div class="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              项目环境变量
            </div>

            <!-- 环境列表 -->
            <div
              v-for="env in projectStore.environments"
              :key="env.id"
              @click="selectEnv(env.id)"
              class="flex items-center justify-between px-2 py-1.5 rounded cursor-pointer hover:bg-muted transition text-xs"
              :class="projectStore.activeEnvironment?.id === env.id ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'"
            >
              <span class="truncate">{{ env.name }}</span>
              <Check v-if="projectStore.activeEnvironment?.id === env.id" class="w-3 h-3 text-emerald-400 shrink-0" />
            </div>

            <!-- 无环境选项 -->
            <div
              @click="selectEnv(null)"
              class="flex items-center justify-between px-2 py-1.5 rounded cursor-pointer hover:bg-muted transition text-xs"
              :class="!projectStore.activeEnvironment ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground'"
            >
              <span>无环境 (No Env)</span>
              <Check v-if="!projectStore.activeEnvironment" class="w-3 h-3 text-emerald-400 shrink-0" />
            </div>

            <div class="my-1 border-t border-border/60" />

            <!-- 管理环境按钮 -->
            <button
              @click="openEnvModal"
              class="w-full flex items-center space-x-1.5 px-2 py-1.5 rounded hover:bg-muted text-primary text-xs transition"
            >
              <Settings class="w-3 h-3" />
              <span>管理环境变量...</span>
            </button>
          </div>
        </div>

        <!-- 网络与 Cookie 设置按钮 -->
        <button
          @click="showNetworkModal = true"
          class="flex items-center space-x-1 px-2.5 py-1 rounded bg-muted/80 hover:bg-muted text-foreground text-[11px] font-medium transition border border-border/60"
          :class="store.networkSettings.dangerouslyDisableSsl || store.networkSettings.enableProxy ? 'text-amber-400 border-amber-500/40' : ''"
          title="网络、SSL 证书与 Cookie 配置"
        >
          <SlidersHorizontal class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">网络</span>
        </button>

        <button
          @click="saveCurrentRequest"
          class="flex items-center space-x-1 px-2.5 py-1 rounded bg-muted hover:bg-muted/80 text-foreground text-[11px] font-medium transition"
          title="保存当前接口到子项目 (Cmd/Ctrl + S)"
        >
          <Save class="w-3.5 h-3.5 text-primary" />
          <span>保存</span>
        </button>

        <!-- Windows / Linux 原生无边框窗口控制按钮 -->
        <div v-if="!isMac" class="flex items-center ml-1 border-l border-border/60 pl-1.5 space-x-0.5">
          <button
            @click="minimizeWindow"
            class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
            title="最小化"
          >
            <Minus class="w-3.5 h-3.5" />
          </button>
          <button
            @click="maximizeWindow"
            class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
            title="最大化 / 还原"
          >
            <Square class="w-3 h-3" />
          </button>
          <button
            @click="closeWindow"
            class="p-1 rounded hover:bg-destructive text-muted-foreground hover:text-destructive-foreground transition"
            title="关闭"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>

    <!-- 环境变量管理模态框 -->
    <EnvironmentModal v-model="showEnvModal" />

    <!-- 网络与 Cookie 设置模态框 -->
    <NetworkSettingsModal v-model="showNetworkModal" />

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
import { PanelLeft, Save, Globe, ChevronDown, Check, Settings, SlidersHorizontal, Minus, Square, X } from 'lucide-vue-next'
import { onKeyStroke, onClickOutside } from '@vueuse/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useRequestStore } from '@/stores/requestStore'
import { useProjectStore } from '@/stores/projectStore'
import { useTabStore } from '@/stores/tabStore'
import Sidebar from '@/components/sidebar/Sidebar.vue'
import TabBar from '@/components/tabs/TabBar.vue'
import UrlBar from '@/components/request/UrlBar.vue'
import RequestBuilder from '@/components/request/RequestBuilder.vue'
import ResponseViewer from '@/components/response/ResponseViewer.vue'
import EnvironmentModal from '@/components/modals/EnvironmentModal.vue'
import NetworkSettingsModal from '@/components/modals/NetworkSettingsModal.vue'
import type { ApiRequest } from '@/types'

const store = useRequestStore()
const projectStore = useProjectStore()
const tabStore = useTabStore()

const isMac = ref(typeof navigator !== 'undefined' && /macintosh|mac os x/i.test(navigator.userAgent))
const sidebarVisible = ref(true)
const envDropdownRef = ref<HTMLElement | null>(null)
const showEnvDropdown = ref(false)
const showEnvModal = ref(false)
const showNetworkModal = ref(false)

onClickOutside(envDropdownRef, () => {
  showEnvDropdown.value = false
})

async function minimizeWindow() {
  try {
    await getCurrentWindow().minimize()
  } catch {
    // ignore
  }
}

async function maximizeWindow() {
  try {
    await getCurrentWindow().toggleMaximize()
  } catch {
    // ignore
  }
}

async function closeWindow() {
  try {
    await getCurrentWindow().close()
  } catch {
    // ignore
  }
}

function selectEnv(id: string | null) {
  projectStore.setActiveEnvironment(id)
  showEnvDropdown.value = false
}

function openEnvModal() {
  showEnvDropdown.value = false
  showEnvModal.value = true
}

const baseUrlSavedHint = ref(false)
let baseUrlHintTimer: ReturnType<typeof setTimeout> | null = null

async function handleBaseUrlChange() {
  if (projectStore.hasProject && projectStore.projectConfig) {
    const val = store.baseUrl.trim()
    if (projectStore.projectConfig.baseUrl !== val) {
      await projectStore.updateBaseUrl(val)
      baseUrlSavedHint.value = true
      if (baseUrlHintTimer) clearTimeout(baseUrlHintTimer)
      baseUrlHintTimer = setTimeout(() => {
        baseUrlSavedHint.value = false
      }, 2000)
    }
  }
}

// 当激活的 Tab 变更时，如果该 Tab 关联子项目，自动计算级联继承的有效 BaseURL 和 Headers
watch(() => tabStore.activeTabId, () => {
  const activeTab = tabStore.tabs.find(t => t.id === tabStore.activeTabId)
  if (activeTab?.subProjectDir) {
    store.baseUrl = projectStore.resolveEffectiveBaseUrl(activeTab.subProjectDir)
  } else if (projectStore.projectConfig?.baseUrl) {
    store.baseUrl = projectStore.projectConfig.baseUrl
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

  const groupName = activeTab?.group || store.group || undefined
  const reqName = activeTab?.title || store.path || '未命名请求'
  const baseFname = `${reqName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_')}_${Date.now().toString().slice(-4)}.json`
  const fileName = activeTab?.fileName || (groupName ? `${groupName}/${baseFname}` : baseFname)

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
    fileName,
    group: groupName
  }

  await projectStore.saveRequest(targetSubDir, fileName, reqToSave)
  if (activeTab) {
    activeTab.subProjectDir = targetSubDir
    activeTab.fileName = fileName
    activeTab.requestId = reqToSave.id
    activeTab.group = groupName
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

// 快捷键: Cmd/Ctrl + Enter 发送请求
onKeyStroke('Enter', (e) => {
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault()
    store.send()
  }
})

// 快捷键: Cmd/Ctrl + R 刷新当前子项目的 Swagger API
onKeyStroke('r', (e) => {
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault()
    if (projectStore.currentSubProjectDir) {
      projectStore.refreshSwagger(projectStore.currentSubProjectDir)
    }
  }
})

// 快捷键: Shift + Alt + F 单次按需美化 JSON Body
onKeyStroke('F', (e) => {
  if (e.shiftKey && e.altKey) {
    e.preventDefault()
    store.formatJson()
  }
})
</script>
