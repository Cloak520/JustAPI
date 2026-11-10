<template>
  <div class="flex flex-col h-screen w-screen bg-background text-foreground select-none overflow-hidden">
    <!-- 顶部导航栏 / 窗口控制区 -->
    <header
      class="relative z-30 flex items-center justify-between px-3 h-10 border-b border-border bg-card/60 backdrop-blur shrink-0 select-none"
      data-tauri-drag-region
      @mousedown="handleHeaderMouseDown"
      @dblclick="handleHeaderDblClick"
    >
      <div class="flex items-center space-x-2 shrink-0" data-tauri-drag-region>
        <button
          @click="appStore.toggleSidebar()"
          :class="isMac ? 'ml-16' : 'ml-0'"
          class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
          title="展开/收起侧边栏 (Cmd/Ctrl + \)"
        >
          <PanelLeft class="w-4 h-4" :class="appStore.sidebarVisible ? 'text-primary' : 'text-muted-foreground'" />
        </button>

        <div class="flex items-center space-x-1.5 pl-1 cursor-default" data-tauri-drag-region>
          <div class="w-5 h-5 rounded bg-primary/20 flex items-center justify-center text-primary font-bold text-[11px] tracking-tighter pointer-events-none">
            J
          </div>
          <span class="font-semibold text-xs tracking-wide pointer-events-none">JustAPI</span>
        </div>
      </div>

      <div class="flex-1 h-full min-w-[20px]" data-tauri-drag-region />

      <!-- 中间：当前 BaseURL -->
      <div class="flex items-center space-x-2 text-xs shrink-0">
        <span class="text-muted-foreground text-[11px] font-mono select-none" data-tauri-drag-region>BaseURL:</span>
        <div class="relative flex items-center group">
          <input
            ref="baseUrlInputRef"
            v-model="sessionStore.baseUrl"
            @change="handleBaseUrlChange"
            @blur="handleBaseUrlChange"
            @keydown.enter="handleBaseUrlEnter"
            type="text"
            placeholder="https://api.example.com"
            class="font-mono text-xs px-2 py-0.5 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary w-64 text-foreground truncate transition"
            :title="workspaceStore.hasProject ? '主目录 BaseURL (回车或失焦自动保存到 project.json，输入 {{ 插入变量)' : 'BaseURL (输入 {{ 插入变量)'"
          />
          <span
            v-if="baseUrlSavedTarget"
            class="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-emerald-400 bg-card border border-emerald-500/30 px-1.5 py-0.2 rounded shadow whitespace-nowrap animate-in fade-in z-50 pointer-events-none"
          >
            已保存至 {{ baseUrlSavedTarget }}
          </span>
        </div>
      </div>

      <div class="flex-1 h-full min-w-[20px]" data-tauri-drag-region />

      <!-- 右侧：快速搜索、环境变量、主题、网络、保存与窗口控制 -->
      <div class="flex items-center space-x-2 text-xs shrink-0">
        <button
          @click="appStore.showQuickSearchModal = true"
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground text-[11px] font-medium transition border border-border/60"
          :title="`全局快速搜索与命令面板 (${isMac ? 'Cmd' : 'Ctrl'} + K / P)`"
        >
          <Search class="w-3 h-3 text-primary/80" />
          <span class="hidden md:inline">搜索</span>
          <kbd class="text-[10px] font-mono opacity-75 hidden sm:inline">{{ isMac ? '⌘K' : 'Ctrl+K' }}</kbd>
        </button>

        <div ref="envDropdownRef" class="relative">
          <button
            @click="showEnvDropdown = !showEnvDropdown"
            class="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-muted/80 hover:bg-muted text-foreground text-[11px] font-medium transition border border-border/60"
            title="切换当前全局环境变量"
          >
            <Globe class="w-3 h-3" :class="workspaceStore.activeEnvironment ? 'text-emerald-400' : 'text-muted-foreground'" />
            <span class="max-w-[100px] truncate">{{ workspaceStore.activeEnvironment?.name || '无环境' }}</span>
            <ChevronDown class="w-3 h-3 text-muted-foreground" />
          </button>

          <div
            v-if="showEnvDropdown"
            class="absolute right-0 top-full mt-1.5 w-52 rounded-xl border border-border bg-card p-1.5 shadow-2xl z-50 text-xs animate-in fade-in zoom-in-95"
            @click.stop
          >
            <div class="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              项目环境变量
            </div>

            <div
              v-for="env in workspaceStore.environments"
              :key="env.id"
              @click="selectEnv(env.id)"
              class="flex items-center justify-between px-2 py-1.5 rounded cursor-pointer hover:bg-muted transition text-xs"
              :class="workspaceStore.activeEnvironment?.id === env.id ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'"
            >
              <span class="truncate">{{ env.name }}</span>
              <Check v-if="workspaceStore.activeEnvironment?.id === env.id" class="w-3 h-3 text-emerald-400 shrink-0" />
            </div>

            <div
              @click="selectEnv(null)"
              class="flex items-center justify-between px-2 py-1.5 rounded cursor-pointer hover:bg-muted transition text-xs"
              :class="!workspaceStore.activeEnvironment ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground'"
            >
              <span>无环境 (No Env)</span>
              <Check v-if="!workspaceStore.activeEnvironment" class="w-3 h-3 text-emerald-400 shrink-0" />
            </div>

            <div class="my-1 border-t border-border/60" />

            <button
              @click="openEnvModal"
              class="w-full flex items-center space-x-1.5 px-2 py-1.5 rounded hover:bg-muted text-primary text-xs transition"
            >
              <Settings class="w-3 h-3" />
              <span>管理环境变量...</span>
            </button>
          </div>
        </div>

        <div ref="themeDropdownRef" class="relative">
          <button
            @click="showThemeDropdown = !showThemeDropdown"
            class="flex items-center space-x-1 px-2.5 py-1 rounded bg-muted/80 hover:bg-muted text-foreground text-[11px] font-medium transition border border-border/60"
            :title="`当前主题：${themeMode === 'dark' ? '深色' : themeMode === 'light' ? '浅色' : '跟随系统'}`"
          >
            <Moon v-if="themeMode === 'dark'" class="w-3.5 h-3.5 text-primary" />
            <Sun v-else-if="themeMode === 'light'" class="w-3.5 h-3.5 text-amber-400" />
            <Monitor v-else class="w-3.5 h-3.5 text-muted-foreground" />
          </button>

          <div
            v-if="showThemeDropdown"
            class="absolute right-0 top-full mt-1.5 w-40 rounded-xl border border-border bg-card p-1.5 shadow-2xl z-50 text-xs animate-in fade-in zoom-in-95"
            @click.stop
          >
            <div class="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              外观主题
            </div>
            <button
              @click="setTheme('dark'); showThemeDropdown = false"
              class="w-full flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-muted transition text-xs"
              :class="themeMode === 'dark' ? 'text-primary font-medium' : 'text-foreground'"
            >
              <Moon class="w-3.5 h-3.5 shrink-0" />
              <span>深色</span>
              <Check v-if="themeMode === 'dark'" class="w-3 h-3 ml-auto text-primary shrink-0" />
            </button>
            <button
              @click="setTheme('light'); showThemeDropdown = false"
              class="w-full flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-muted transition text-xs"
              :class="themeMode === 'light' ? 'text-primary font-medium' : 'text-foreground'"
            >
              <Sun class="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span>浅色</span>
              <Check v-if="themeMode === 'light'" class="w-3 h-3 ml-auto text-primary shrink-0" />
            </button>
            <button
              @click="setTheme('system'); showThemeDropdown = false"
              class="w-full flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-muted transition text-xs"
              :class="themeMode === 'system' ? 'text-primary font-medium' : 'text-foreground'"
            >
              <Monitor class="w-3.5 h-3.5 shrink-0" />
              <span>跟随系统</span>
              <Check v-if="themeMode === 'system'" class="w-3 h-3 ml-auto text-primary shrink-0" />
            </button>
          </div>
        </div>

        <button
          @click="appStore.showNetworkModal = true"
          class="flex items-center space-x-1 px-2.5 py-1 rounded bg-muted/80 hover:bg-muted text-foreground text-[11px] font-medium transition border border-border/60"
          :class="workspaceStore.networkSettings.dangerouslyDisableSsl || workspaceStore.networkSettings.enableProxy ? 'text-amber-400 border-amber-500/40' : ''"
          title="网络、SSL 证书与 Cookie 配置"
        >
          <SlidersHorizontal class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">网络</span>
        </button>

        <button
          @click="appStore.showPluginsModal = true"
          class="flex items-center space-x-1 px-2.5 py-1 rounded bg-muted/80 hover:bg-muted text-foreground text-[11px] font-medium transition border border-border/60"
          :class="defaultExternalPluginHost.activeCount.value > 0 ? 'border-primary/40 text-primary' : ''"
          title="管理 .justapi/plugins/ 外置插件"
        >
          <Puzzle class="w-3.5 h-3.5" />
          <span class="hidden sm:inline">插件</span>
          <span
            v-if="defaultExternalPluginHost.activeCount.value > 0"
            class="text-[10px] px-1 rounded-full bg-primary/20 text-primary font-mono"
          >
            {{ defaultExternalPluginHost.activeCount.value }}
          </span>
        </button>

        <button
          @click="saveCurrentRequest"
          class="flex items-center space-x-1 px-2.5 py-1 rounded bg-muted hover:bg-muted/80 text-foreground text-[11px] font-medium transition"
          title="保存当前接口到子项目 (Cmd/Ctrl + S)"
        >
          <Save class="w-3.5 h-3.5 text-primary" />
          <span>保存</span>
        </button>

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
            :title="isMaximized ? '还原' : '最大化'"
          >
            <Minimize2 v-if="isMaximized" class="w-3.5 h-3.5" />
            <Maximize2 v-else class="w-3.5 h-3.5" />
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

    <!-- 全局模态框与浮层宿主 -->
    <VariableAutocompleteHost />
    <QuickSearchModal />
    <EnvironmentModal v-model="appStore.showEnvModal" />
    <NetworkSettingsModal v-model="appStore.showNetworkModal" />
    <PluginsModal v-model="appStore.showPluginsModal" />
    <SaveRequestModal v-model="appStore.showSaveModal" />

    <!-- 主工作区 -->
    <div class="flex-1 flex overflow-hidden">
      <Sidebar
        v-show="appStore.sidebarVisible"
        :style="{ width: `${sidebarWidth}px` }"
        class="shrink-0"
      />

      <div
        v-if="appStore.sidebarVisible"
        class="w-1.5 hover:w-2 -ml-1 z-20 cursor-col-resize flex items-center justify-center shrink-0 group select-none transition-all hover:bg-primary/50 active:bg-primary"
        @mousedown="handleSidebarSplitterMouseDown"
        @dblclick="resetSidebarWidth"
        title="左右拖拽调整侧边栏宽度 (双击恢复默认 288px)"
      >
        <div class="w-0.5 h-8 rounded-full bg-border group-hover:bg-primary/80 transition-colors"></div>
      </div>

      <main class="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TabBar />

        <div class="flex-1 flex flex-col p-3 overflow-hidden">
          <section
            class="flex flex-col space-y-2.5 shrink-0 p-3 rounded-xl border border-border bg-card/40 backdrop-blur shadow-sm overflow-hidden"
            :style="{ height: `${requestHeight}px` }"
          >
            <UrlBar />
            <div class="flex-1 overflow-hidden min-h-0">
              <RequestBuilder />
            </div>
          </section>

          <div
            class="h-3 my-0.5 cursor-row-resize flex items-center justify-center shrink-0 group select-none transition"
            @mousedown="handleSplitterMouseDown"
            @dblclick="resetRequestHeight"
            title="上下拖拽调整请求与响应区高度 (双击恢复默认高度 350px)"
          >
            <div class="w-10 h-1 rounded-full bg-border/60 group-hover:bg-primary/70 group-active:bg-primary transition-colors"></div>
          </div>

          <section class="flex-1 flex flex-col p-3 rounded-xl border border-border bg-card/40 backdrop-blur shadow-sm overflow-hidden min-h-0">
            <ResponseViewer />
          </section>
        </div>
      </main>
    </div>

    <!-- 全局操作通知 Toast -->
    <div
      v-if="appStore.toastMessage"
      class="fixed bottom-4 right-4 z-50 flex items-center space-x-2 px-3.5 py-2.5 rounded-xl bg-card/95 border border-border shadow-2xl backdrop-blur text-xs animate-in fade-in slide-in-from-bottom-2 select-none"
    >
      <CheckCircle2 v-if="!appStore.toastIsError" class="w-4 h-4 text-emerald-400 shrink-0" />
      <AlertCircle v-else class="w-4 h-4 text-destructive shrink-0" />
      <span class="text-foreground font-medium leading-tight">{{ appStore.toastMessage }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { onClickOutside } from '@vueuse/core'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Globe,
  Maximize2,
  Minimize2,
  Minus,
  Monitor,
  Moon,
  PanelLeft,
  Puzzle,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  Sun,
  X
} from 'lucide-vue-next'
import EnvironmentModal from '@/components/modals/EnvironmentModal.vue'
import NetworkSettingsModal from '@/components/modals/NetworkSettingsModal.vue'
import PluginsModal from '@/components/modals/PluginsModal.vue'
import QuickSearchModal from '@/components/modals/QuickSearchModal.vue'
import SaveRequestModal from '@/components/modals/SaveRequestModal.vue'
import VariableAutocompleteHost from '@/components/common/VariableAutocompleteHost.vue'
import UrlBar from '@/components/request/UrlBar.vue'
import TabBar from '@/components/tabs/TabBar.vue'
import { useEscapeCancel } from '@/composables/useEscapeCancel'
import {
  isVariableAutocompleteActiveForElement,
  useVariableInput,
  wasVariableAutocompleteEnterHandled
} from '@/composables/useVariableAutocomplete'
import { useTheme } from '@/composables/useTheme'
import { defaultCommandRegistry } from '@/core/commands/commandRegistry'
import { defaultExternalPluginHost } from '@/core/plugins/pluginHost'
import { ESCAPE_PRIORITY } from '@/core/shortcuts/escapeStack'
import RequestBuilder from '@/features/request-builder/components/RequestBuilder.vue'
import ResponseViewer from '@/features/response-viewer/components/ResponseViewer.vue'
import Sidebar from '@/features/sidebar/components/Sidebar.vue'
import { useAppStore } from '@/stores/appStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'

const appStore = useAppStore()
const workspaceStore = useWorkspaceStore()
const sessionStore = useSessionStore()
const { themeMode, setTheme } = useTheme()

const isMac = ref(typeof navigator !== 'undefined' && /macintosh|mac os x/i.test(navigator.userAgent))
const isMaximized = ref(false)
let unlistenResized: (() => void) | null = null

const envDropdownRef = ref<HTMLElement | null>(null)
const showEnvDropdown = ref(false)
const themeDropdownRef = ref<HTMLElement | null>(null)
const showThemeDropdown = ref(false)

onClickOutside(envDropdownRef, () => {
  showEnvDropdown.value = false
})

onClickOutside(themeDropdownRef, () => {
  showThemeDropdown.value = false
})

useEscapeCancel(
  showEnvDropdown,
  () => {
    showEnvDropdown.value = false
  },
  { priority: ESCAPE_PRIORITY.DROPDOWN }
)

useEscapeCancel(
  showThemeDropdown,
  () => {
    showThemeDropdown.value = false
  },
  { priority: ESCAPE_PRIORITY.DROPDOWN }
)

// 侧边栏宽度与拖拽调整
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
  sidebarWidth.value = Math.round(Math.max(minW, Math.min(maxW, startSidebarWidth + delta)))
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

// 请求构建区高度与拖拽调整
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
  requestHeight.value = Math.round(Math.max(minH, Math.min(maxH, startHeight + delta)))
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

const baseUrlInputRef = ref<HTMLInputElement | null>(null)
const baseUrlSavedTarget = ref<'project.json' | '.subproject.json' | null>(null)
let baseUrlHintTimer: ReturnType<typeof setTimeout> | null = null

useVariableInput(baseUrlInputRef, {
  onApplied: nextVal => {
    sessionStore.baseUrl = nextVal
  }
})

function handleBaseUrlEnter(e: KeyboardEvent) {
  if (
    wasVariableAutocompleteEnterHandled(e) ||
    isVariableAutocompleteActiveForElement(e.currentTarget)
  ) {
    return
  }
  void handleBaseUrlChange()
}

async function handleBaseUrlChange() {
  const savedTarget = await sessionStore.commitBaseUrl()
  if (savedTarget) {
    baseUrlSavedTarget.value = savedTarget
    if (baseUrlHintTimer) clearTimeout(baseUrlHintTimer)
    baseUrlHintTimer = setTimeout(() => {
      baseUrlSavedTarget.value = null
    }, 2000)
  }
}

async function saveCurrentRequest() {
  const saved = await sessionStore.saveActiveTab()
  if (saved) {
    appStore.showToast(`接口已保存: ${saved.name}`)
  }
}

function selectEnv(id: string | null) {
  workspaceStore.setActiveEnvironment(id)
  showEnvDropdown.value = false
}

function openEnvModal() {
  showEnvDropdown.value = false
  appStore.showEnvModal = true
}

function handleGlobalKeyDown(e: KeyboardEvent) {
  void defaultCommandRegistry.handleKeyDown(e)
}

const commandCleanups: Array<() => void> = []
let stopWatchingProjectPlugins: (() => void) | null = null

onMounted(async () => {
  sessionStore.initSession()
  void defaultExternalPluginHost.sync(workspaceStore.projectPath)

  commandCleanups.push(
    defaultCommandRegistry.register({
      id: 'palette.open',
      title: '打开快速搜索与命令面板',
      hiddenInPalette: true,
      shortcut: { key: 'k', mod: true },
      run: () => {
        appStore.showQuickSearchModal = !appStore.showQuickSearchModal
      }
    }),
    defaultCommandRegistry.register({
      id: 'palette.open.quick',
      title: '快速打开请求',
      hiddenInPalette: true,
      shortcut: { key: 'p', mod: true },
      run: () => {
        appStore.showQuickSearchModal = true
      }
    }),
    defaultCommandRegistry.register({
      id: 'request.save',
      title: '保存当前请求',
      category: '请求',
      shortcut: { key: 's', mod: true },
      when: () => !appStore.showQuickSearchModal,
      run: saveCurrentRequest
    }),
    defaultCommandRegistry.register({
      id: 'tab.new',
      title: '新建标签页',
      category: '标签页',
      shortcut: { key: 't', mod: true },
      when: () => !appStore.showQuickSearchModal,
      run: () => {
        sessionStore.newTab()
      }
    }),
    defaultCommandRegistry.register({
      id: 'tab.close',
      title: '关闭当前标签页',
      category: '标签页',
      shortcut: { key: 'w', mod: true },
      when: () => !appStore.showQuickSearchModal,
      run: () => {
        sessionStore.closeTab(sessionStore.activeTabId)
      }
    }),
    defaultCommandRegistry.register({
      id: 'sidebar.toggle',
      title: '展开/收起侧边栏',
      category: '视图',
      shortcut: { key: '\\', mod: true },
      run: () => {
        appStore.toggleSidebar()
      }
    }),
    defaultCommandRegistry.register({
      id: 'request.send',
      title: '发送当前请求',
      category: '请求',
      shortcut: { key: 'Enter', mod: true },
      when: () => !appStore.showQuickSearchModal,
      run: () => sessionStore.sendActiveRequest()
    }),
    defaultCommandRegistry.register({
      id: 'collection.refresh',
      title: '刷新当前子项目接口文档',
      category: '集合',
      shortcut: { key: 'r', mod: true },
      when: () => !appStore.showQuickSearchModal,
      run: () =>
        workspaceStore.refreshCollectionWithFeedback(sessionStore.activeTab?.subProjectDir)
    }),
    defaultCommandRegistry.register({
      id: 'body.formatJson',
      title: '美化 JSON 请求体',
      category: '编辑器',
      shortcut: { key: 'f', shift: true, alt: true },
      when: () => !appStore.showQuickSearchModal,
      run: () => sessionStore.formatActiveJson()
    }),
    defaultCommandRegistry.register({
      id: 'body.minifyJson',
      title: '压缩 JSON 请求体为单行',
      category: '编辑器',
      run: () => sessionStore.minifyActiveJson()
    }),
    defaultCommandRegistry.register({
      id: 'request.clearResponse',
      title: '清空当前响应结果',
      category: '请求',
      run: () => sessionStore.clearActiveResponse()
    }),
    defaultCommandRegistry.register({
      id: 'request.locateInSidebar',
      title: '在侧边栏中定位当前接口',
      category: '集合',
      run: () => {
        appStore.revealRequestInSidebar(sessionStore.activeTab)
      }
    }),
    defaultCommandRegistry.register({
      id: 'project.open',
      title: '打开本地项目目录...',
      category: '工作区',
      run: () => workspaceStore.pickAndOpenProject()
    }),
    defaultCommandRegistry.register({
      id: 'env.manage',
      title: '管理环境变量...',
      category: '工作区',
      run: () => {
        appStore.showEnvModal = true
      }
    }),
    defaultCommandRegistry.register({
      id: 'network.settings',
      title: '打开网络与代理设置...',
      category: '工作区',
      run: () => {
        appStore.showNetworkModal = true
      }
    }),
    defaultCommandRegistry.register({
      id: 'plugins.manage',
      title: '管理外置插件...',
      category: '工作区',
      run: () => {
        appStore.showPluginsModal = true
      }
    }),
    defaultCommandRegistry.register({
      id: 'theme.dark',
      title: '切换外观主题：深色 (Dark)',
      category: '外观',
      run: () => setTheme('dark')
    }),
    defaultCommandRegistry.register({
      id: 'theme.light',
      title: '切换外观主题：浅色 (Light)',
      category: '外观',
      run: () => setTheme('light')
    }),
    defaultCommandRegistry.register({
      id: 'theme.system',
      title: '切换外观主题：跟随系统 (System)',
      category: '外观',
      run: () => setTheme('system')
    })
  )

  window.addEventListener('keydown', handleGlobalKeyDown)

  stopWatchingProjectPlugins = watch(
    () => [workspaceStore.projectPath, workspaceStore.projectConfig] as const,
    ([newPath]) => {
      void defaultExternalPluginHost.sync(newPath)
    }
  )

  try {
    isMaximized.value = await getCurrentWindow().isMaximized()
    unlistenResized = await getCurrentWindow().onResized(async () => {
      isMaximized.value = await getCurrentWindow().isMaximized()
    })
  } catch {
    // ignore in non-tauri context
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown)
  for (const cleanup of commandCleanups) cleanup()
  commandCleanups.length = 0
  stopWatchingProjectPlugins?.()
  stopWatchingProjectPlugins = null
  void defaultExternalPluginHost.unloadAll()

  window.removeEventListener('mousemove', handleSplitterMouseMove)
  window.removeEventListener('mouseup', handleSplitterMouseUp)
  window.removeEventListener('mousemove', handleSidebarSplitterMouseMove)
  window.removeEventListener('mouseup', handleSidebarSplitterMouseUp)
  if (baseUrlHintTimer) clearTimeout(baseUrlHintTimer)
  unlistenResized?.()
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
</script>
