<template>
  <div class="flex flex-col h-screen w-screen bg-background text-foreground select-none overflow-hidden">
    <!-- 顶部导航栏 / 窗口控制区 (支持 macOS 原生拖拽移动) -->
    <header
      class="relative z-30 flex items-center justify-between px-3 h-10 border-b border-border bg-card/60 backdrop-blur shrink-0 select-none"
      data-tauri-drag-region
      @mousedown="handleHeaderMouseDown"
      @dblclick="handleHeaderDblClick"
    >
      <div class="flex items-center space-x-2 shrink-0" data-tauri-drag-region>
        <!-- 侧边栏折叠切换按钮 (Cmd/Ctrl + \) -->
        <button
          @click="sidebarVisible = !sidebarVisible"
          :class="isMac ? 'ml-16' : 'ml-0'"
          class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
          title="展开/收起侧边栏 (Cmd/Ctrl + \)"
        >
          <PanelLeft class="w-4 h-4" :class="sidebarVisible ? 'text-primary' : 'text-muted-foreground'" />
        </button>

        <div class="flex items-center space-x-1.5 pl-1 cursor-default" data-tauri-drag-region>
          <div class="w-5 h-5 rounded bg-primary/20 flex items-center justify-center text-primary font-bold text-[11px] tracking-tighter pointer-events-none">
            J
          </div>
          <span class="font-semibold text-xs tracking-wide pointer-events-none">JustAPI</span>
        </div>
      </div>

      <!-- 左中之间空白拖拽区 -->
      <div class="flex-1 h-full min-w-[20px]" data-tauri-drag-region />

      <!-- 中间：当前 BaseURL 与级联继承显示 -->
      <div class="flex items-center space-x-2 text-xs shrink-0">
        <span class="text-muted-foreground text-[11px] font-mono select-none" data-tauri-drag-region>BaseURL:</span>
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

      <!-- 中右之间空白拖拽区 -->
      <div class="flex-1 h-full min-w-[20px]" data-tauri-drag-region />

      <!-- 右侧：环境变量快速切换 + 保存当前接口与快捷动作 -->
      <div class="flex items-center space-x-2 text-xs shrink-0">
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

        <!-- 主题切换下拉按钮 (深色 / 浅色 / 跟随系统) -->
        <div ref="themeDropdownRef" class="relative">
          <button
            @click="showThemeDropdown = !showThemeDropdown"
            class="flex items-center justify-center w-7 h-7 rounded bg-muted/80 hover:bg-muted text-foreground transition border border-border/60"
            :title="themeTitle"
          >
            <Moon v-if="colorMode === 'dark'" class="w-3.5 h-3.5 text-primary" />
            <Sun v-else-if="colorMode === 'light'" class="w-3.5 h-3.5 text-amber-500" />
            <Laptop v-else class="w-3.5 h-3.5 text-emerald-500" />
          </button>

          <!-- 主题切换下拉选项面板 -->
          <div
            v-if="showThemeDropdown"
            class="absolute right-0 top-full mt-1.5 w-36 rounded-xl border border-border bg-card p-1 shadow-2xl z-50 text-xs animate-in fade-in zoom-in-95"
            @click.stop
          >
            <div
              @click="selectTheme('dark')"
              class="flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-muted transition text-xs"
              :class="colorMode === 'dark' ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'"
            >
              <div class="flex items-center space-x-2">
                <Moon class="w-3.5 h-3.5 text-primary" />
                <span>深色模式</span>
              </div>
              <Check v-if="colorMode === 'dark'" class="w-3.5 h-3.5 text-primary" />
            </div>

            <div
              @click="selectTheme('light')"
              class="flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-muted transition text-xs"
              :class="colorMode === 'light' ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'"
            >
              <div class="flex items-center space-x-2">
                <Sun class="w-3.5 h-3.5 text-amber-500" />
                <span>浅色模式</span>
              </div>
              <Check v-if="colorMode === 'light'" class="w-3.5 h-3.5 text-primary" />
            </div>

            <div
              @click="selectTheme('auto')"
              class="flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-muted transition text-xs"
              :class="colorMode === 'auto' ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'"
            >
              <div class="flex items-center space-x-2">
                <Laptop class="w-3.5 h-3.5 text-emerald-500" />
                <span>跟随系统</span>
              </div>
              <Check v-if="colorMode === 'auto'" class="w-3.5 h-3.5 text-primary" />
            </div>
          </div>
        </div>

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

    <!-- 保存请求与子项目归属模态框 -->
    <SaveRequestModal v-model="tabStore.showSaveModal" />

    <!-- 主工作区：左侧边栏 (项目与子项目树) + 右侧标签页与构建器 -->
    <div class="flex-1 flex overflow-hidden">
      <!-- 1. 左侧边栏 (树形项目与历史记录，支持左右自由拖拽调整宽度) -->
      <Sidebar
        v-show="sidebarVisible"
        :style="{ width: `${sidebarWidth}px` }"
        class="shrink-0"
      />

      <!-- 侧边栏左右拖拽调整手柄 (双击恢复默认宽度 288px) -->
      <div
        v-if="sidebarVisible"
        class="w-1.5 hover:w-2 -ml-1 z-20 cursor-col-resize flex items-center justify-center shrink-0 group select-none transition-all hover:bg-primary/50 active:bg-primary"
        @mousedown="handleSidebarSplitterMouseDown"
        @dblclick="resetSidebarWidth"
        title="左右拖拽调整侧边栏宽度 (双击恢复默认 288px)"
      >
        <div class="w-0.5 h-8 rounded-full bg-border group-hover:bg-primary/80 transition-colors"></div>
      </div>

      <!-- 2. 右侧主工作台 -->
      <main class="flex-1 flex flex-col min-w-0 overflow-hidden">
        <!-- 标签页管理栏 -->
        <TabBar />

        <div class="flex-1 flex flex-col p-3 overflow-hidden">
          <!-- 上半区：请求构建器 (固定高度，切换Tab不改变高度) -->
          <section
            class="flex flex-col space-y-2.5 shrink-0 p-3 rounded-xl border border-border bg-card/40 backdrop-blur shadow-sm overflow-hidden"
            :style="{ height: `${requestHeight}px` }"
          >
            <UrlBar />
            <div class="flex-1 overflow-hidden min-h-0">
              <RequestBuilder />
            </div>
          </section>

          <!-- 上下分栏拖拽调整手柄 (双击恢复默认高度 350px) -->
          <div
            class="h-3 my-0.5 cursor-row-resize flex items-center justify-center shrink-0 group select-none transition"
            @mousedown="handleSplitterMouseDown"
            @dblclick="resetRequestHeight"
            title="上下拖拽调整请求与响应区高度 (双击恢复默认高度 350px)"
          >
            <div class="w-10 h-1 rounded-full bg-border/60 group-hover:bg-primary/70 group-active:bg-primary transition-colors"></div>
          </div>

          <!-- 下半区：响应查看器 (自适应撑满剩余高度) -->
          <section class="flex-1 flex flex-col p-3 rounded-xl border border-border bg-card/40 backdrop-blur shadow-sm overflow-hidden min-h-0">
            <ResponseViewer />
          </section>
        </div>
      </main>
    </div>

    <!-- 全局操作通知 Toast (浮动右下角，不受侧边栏折叠影响) -->
    <div
      v-if="projectStore.toastMessage"
      class="fixed bottom-4 right-4 z-50 flex items-center space-x-2 px-3.5 py-2.5 rounded-xl bg-card/95 border border-border shadow-2xl backdrop-blur text-xs animate-in fade-in slide-in-from-bottom-2 select-none"
    >
      <CheckCircle2 v-if="!projectStore.toastIsError" class="w-4 h-4 text-emerald-400 shrink-0" />
      <AlertCircle v-else class="w-4 h-4 text-destructive shrink-0" />
      <span class="text-foreground font-medium leading-tight">{{ projectStore.toastMessage }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  PanelLeft, Save, Globe, ChevronDown, Check, Settings, SlidersHorizontal,
  Minus, Square, X, CheckCircle2, AlertCircle, Sun, Moon, Laptop
} from 'lucide-vue-next'
import { onKeyStroke, onClickOutside, useColorMode } from '@vueuse/core'
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
import SaveRequestModal from '@/components/modals/SaveRequestModal.vue'
import type { ApiRequest } from '@/types'

const store = useRequestStore()
const projectStore = useProjectStore()
const tabStore = useTabStore()

// 多主题外观管理 (深色 / 浅色 / 跟随系统)
type ThemeMode = 'dark' | 'light' | 'auto'

const colorMode = ref<ThemeMode>((localStorage.getItem('justapi_theme_mode') as ThemeMode) || 'dark')
const isSystemDark = ref(typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)

const isEffectiveDark = computed(() => {
  if (colorMode.value === 'dark') return true
  if (colorMode.value === 'light') return false
  return isSystemDark.value
})

function applyTheme(mode: ThemeMode) {
  colorMode.value = mode
  localStorage.setItem('justapi_theme_mode', mode)

  const isDark = mode === 'dark' || (mode === 'auto' && isSystemDark.value)
  if (isDark) {
    document.documentElement.classList.add('dark')
    document.documentElement.style.colorScheme = 'dark'
  } else {
    document.documentElement.classList.remove('dark')
    document.documentElement.style.colorScheme = 'light'
  }

  // 同步更新 Windows / macOS 窗口原生主题模式 (Windows DWM 沉浸式深浅色边框与标题栏)
  try {
    const win = getCurrentWindow()
    if (win && typeof win.setTheme === 'function') {
      win.setTheme(mode === 'auto' ? null : (isDark ? 'dark' : 'light'))
    }
  } catch {
    // ignore
  }
}

// 监听系统深浅色偏好变动 (当用户选择跟随系统时实时生效)
if (typeof window !== 'undefined' && window.matchMedia) {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const updateSystemDark = (e: MediaQueryListEvent | MediaQueryList) => {
    isSystemDark.value = e.matches
    if (colorMode.value === 'auto') {
      applyTheme('auto')
    }
  }
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', updateSystemDark)
  } else if ((mediaQuery as any).addListener) {
    (mediaQuery as any).addListener(updateSystemDark)
  }
}

onMounted(() => {
  applyTheme(colorMode.value)
})

const themeDropdownRef = ref<HTMLElement | null>(null)
const showThemeDropdown = ref(false)

onClickOutside(themeDropdownRef, () => {
  showThemeDropdown.value = false
})

function selectTheme(mode: ThemeMode) {
  applyTheme(mode)
  showThemeDropdown.value = false
}

const themeTitle = computed(() => {
  if (colorMode.value === 'dark') return '当前主题: 深色模式'
  if (colorMode.value === 'light') return '当前主题: 浅色模式'
  return `当前主题: 跟随系统 (${isEffectiveDark.value ? '深色' : '浅色'})`
})

const isMac = ref(typeof navigator !== 'undefined' && /macintosh|mac os x/i.test(navigator.userAgent))
const sidebarVisible = computed({
  get: () => projectStore.sidebarVisible,
  set: (val: boolean) => { projectStore.sidebarVisible = val }
})
const envDropdownRef = ref<HTMLElement | null>(null)
const showEnvDropdown = ref(false)
const showEnvModal = ref(false)
const showNetworkModal = ref(false)

// 侧边栏宽度与左右拖拽调整 (默认 288px)
const DEFAULT_SIDEBAR_WIDTH = 288
const sidebarWidth = ref<number>(
  (() => {
    const saved = localStorage.getItem('justapi_sidebar_width')
    const parsed = saved ? parseInt(saved, 10) : NaN
    return !isNaN(parsed) && parsed >= 200 && parsed <= 600 ? parsed : DEFAULT_SIDEBAR_WIDTH
  })()
)

let isDraggingSidebar = false
let startSidebarX = 0
let startSidebarWidth = 0

function handleSidebarSplitterMouseDown(e: MouseEvent) {
  isDraggingSidebar = true
  startSidebarX = e.clientX
  startSidebarWidth = sidebarWidth.value
  window.addEventListener('mousemove', handleSidebarSplitterMouseMove)
  window.addEventListener('mouseup', handleSidebarSplitterMouseUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function handleSidebarSplitterMouseMove(e: MouseEvent) {
  if (!isDraggingSidebar) return
  const delta = e.clientX - startSidebarX
  const minW = 200
  const maxW = Math.min(600, window.innerWidth - 450)
  const newWidth = Math.max(minW, Math.min(maxW, startSidebarWidth + delta))
  sidebarWidth.value = Math.round(newWidth)
}

function handleSidebarSplitterMouseUp() {
  if (!isDraggingSidebar) return
  isDraggingSidebar = false
  window.removeEventListener('mousemove', handleSidebarSplitterMouseMove)
  window.removeEventListener('mouseup', handleSidebarSplitterMouseUp)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  localStorage.setItem('justapi_sidebar_width', String(sidebarWidth.value))
}

function resetSidebarWidth() {
  sidebarWidth.value = DEFAULT_SIDEBAR_WIDTH
  localStorage.setItem('justapi_sidebar_width', String(DEFAULT_SIDEBAR_WIDTH))
}

// 请求构建区固定高度与分栏拖拽调整
const DEFAULT_REQUEST_HEIGHT = 350
const requestHeight = ref<number>(
  (() => {
    const saved = localStorage.getItem('justapi_request_section_height')
    const parsed = saved ? parseInt(saved, 10) : NaN
    return !isNaN(parsed) && parsed >= 200 && parsed <= 800 ? parsed : DEFAULT_REQUEST_HEIGHT
  })()
)

let isDraggingSplitter = false
let startY = 0
let startHeight = 0

function handleSplitterMouseDown(e: MouseEvent) {
  isDraggingSplitter = true
  startY = e.clientY
  startHeight = requestHeight.value
  window.addEventListener('mousemove', handleSplitterMouseMove)
  window.addEventListener('mouseup', handleSplitterMouseUp)
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
}

function handleSplitterMouseMove(e: MouseEvent) {
  if (!isDraggingSplitter) return
  const delta = e.clientY - startY
  const minH = 220
  const maxH = Math.max(minH, window.innerHeight - 260)
  const newHeight = Math.max(minH, Math.min(maxH, startHeight + delta))
  requestHeight.value = Math.round(newHeight)
}

function handleSplitterMouseUp() {
  if (!isDraggingSplitter) return
  isDraggingSplitter = false
  window.removeEventListener('mousemove', handleSplitterMouseMove)
  window.removeEventListener('mouseup', handleSplitterMouseUp)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  localStorage.setItem('justapi_request_section_height', String(requestHeight.value))
}

function resetRequestHeight() {
  requestHeight.value = DEFAULT_REQUEST_HEIGHT
  localStorage.setItem('justapi_request_section_height', String(DEFAULT_REQUEST_HEIGHT))
}

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', handleSplitterMouseMove)
  window.removeEventListener('mouseup', handleSplitterMouseUp)
  window.removeEventListener('mousemove', handleSidebarSplitterMouseMove)
  window.removeEventListener('mouseup', handleSidebarSplitterMouseUp)
})

onMounted(() => {
  tabStore.initSession()
  window.addEventListener('beforeunload', () => {
    tabStore.captureCurrentDraft()
  })
})

onClickOutside(envDropdownRef, () => {
  showEnvDropdown.value = false
})

async function handleHeaderMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  const target = e.target as HTMLElement | null
  if (target?.closest('button, input, select, textarea, [role="button"], a')) {
    return
  }
  try {
    await getCurrentWindow().startDragging()
  } catch {
    // ignore
  }
}

async function handleHeaderDblClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  if (target?.closest('button, input, select, textarea, [role="button"], a')) {
    return
  }
  try {
    await getCurrentWindow().toggleMaximize()
  } catch {
    // ignore
  }
}

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
  if (!activeTab) return

  if (!projectStore.hasProject || projectStore.subProjects.length === 0) {
    alert('请先在左侧边栏打开或创建一个本地项目及子项目模块，再执行保存！')
    return
  }

  // 若尚未指定子项目，弹出「保存请求」弹窗供用户自主选择
  if (!activeTab.subProjectDir) {
    tabStore.showSaveModal = true
    return
  }

  const targetSubDir = activeTab.subProjectDir
  const groupName = activeTab.group || store.group || undefined
  const reqName = activeTab.title || store.path || '未命名请求'
  const baseFname = activeTab.fileName
    ? (activeTab.fileName.includes('/') ? activeTab.fileName.split('/').pop()! : activeTab.fileName)
    : `${reqName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_')}_${Date.now().toString().slice(-4)}.json`
  const fileName = activeTab.fileName || (groupName ? `${groupName}/${baseFname}` : baseFname)

  const reqToSave: ApiRequest = {
    id: activeTab.requestId || crypto.randomUUID(),
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
  activeTab.isDirty = false
  if (!activeTab.fileName) activeTab.fileName = fileName
  if (!activeTab.requestId) activeTab.requestId = reqToSave.id
  projectStore.showToast(`接口已保存: ${reqName}`)
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

// 快捷键: Cmd/Ctrl + Enter 发送请求 (唯一全局监听)
onKeyStroke('Enter', (e) => {
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault()
    store.send()
  }
})

// 快捷键: Cmd/Ctrl + R 刷新当前接口所属或当前选定子项目的 Swagger API (唯一全局监听)
onKeyStroke('r', (e) => {
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault()
    const activeTab = tabStore.tabs.find(t => t.id === tabStore.activeTabId)
    const targetDir = activeTab?.subProjectDir || projectStore.currentSubProjectDir || projectStore.subProjects[0]?.dir_name
    if (targetDir) {
      projectStore.refreshSwaggerWithFeedback(targetDir)
    } else {
      projectStore.showToast('请先打开或选择包含 Swagger 的子项目模块', true)
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
