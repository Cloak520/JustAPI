<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/55 backdrop-blur-sm p-4 animate-in fade-in duration-100"
      @mousedown.self="close"
    >
      <div
        class="flex flex-col w-full max-w-2xl bg-card/95 border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-100"
        @mousedown.stop
      >
        <!-- 搜索输入栏 -->
        <div class="flex items-center px-4 py-3 border-b border-border bg-muted/20 space-x-2.5">
          <Search class="w-4 h-4 text-primary shrink-0" />
          <input
            ref="searchInputRef"
            v-model="query"
            type="text"
            placeholder="搜索接口、标签页、历史记录，或输入 > 执行命令 / @ 切换环境..."
            class="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            @keydown="handleInputKeyDown"
          />
          <button
            v-if="query"
            @click="query = ''; searchInputRef?.focus()"
            class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition"
            title="清空检索词"
          >
            <X class="w-3.5 h-3.5" />
          </button>
          <kbd
            class="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted/80 border border-border/80 rounded"
          >
            Esc
          </kbd>
        </div>

        <!-- 分类筛选标签 -->
        <div class="flex items-center justify-between px-3 py-1.5 border-b border-border/60 bg-muted/10 text-[11px] select-none">
          <div class="flex items-center space-x-1 overflow-x-auto">
            <button
              v-for="tab in categoryTabs"
              :key="tab.id"
              @click="selectCategory(tab.id)"
              class="px-2 py-0.5 rounded-md transition flex items-center space-x-1 whitespace-nowrap"
              :class="effectiveCategory === tab.id ? 'bg-primary/15 text-primary font-medium border border-primary/30' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent'"
            >
              <span>{{ tab.label }}</span>
              <span v-if="tab.prefix" class="font-mono text-[10px] opacity-60">{{ tab.prefix }}</span>
            </button>
          </div>
          <span class="text-[10px] text-muted-foreground font-mono shrink-0 ml-2">
            {{ results.length }} 项
          </span>
        </div>

        <!-- 搜索结果列表 -->
        <div ref="listContainerRef" class="max-h-[400px] overflow-y-auto p-1.5 space-y-0.5">
          <div
            v-if="results.length === 0"
            class="flex flex-col items-center justify-center py-12 text-center space-y-1.5 text-muted-foreground"
          >
            <Search class="w-6 h-6 opacity-30" />
            <span class="text-xs">未找到匹配结果</span>
            <span class="text-[11px] opacity-70">试试输入接口名称、URL 片段，或用 &gt; / @ / # 过滤</span>
          </div>

          <button
            v-for="(item, idx) in results"
            :key="item.id"
            :ref="el => setItemRef(el as HTMLElement | null, idx)"
            @click="executeItem(item)"
            @mouseenter="selectedIndex = idx"
            class="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition group"
            :class="idx === selectedIndex ? 'bg-primary/15 text-foreground ring-1 ring-primary/30' : 'hover:bg-muted/50 text-foreground'"
          >
            <div class="flex items-center space-x-2.5 min-w-0 flex-1">
              <!-- 类型徽标 -->
              <span
                v-if="item.kind === 'tab' || item.kind === 'request' || item.kind === 'history'"
                class="w-12 text-center font-mono font-bold text-[10px] px-1 py-0.5 rounded bg-muted border border-border/70 shrink-0"
                :class="getMethodTextColor(item.method || 'GET')"
              >
                {{ item.method || 'GET' }}
              </span>
              <span
                v-else-if="item.kind === 'command'"
                class="w-12 flex items-center justify-center py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0"
              >
                <Terminal class="w-3.5 h-3.5" />
              </span>
              <span
                v-else
                class="w-12 flex items-center justify-center py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0"
              >
                <Globe class="w-3.5 h-3.5" />
              </span>

              <!-- 标题与副标题 -->
              <div class="min-w-0 flex-1">
                <div class="flex items-center space-x-1.5 min-w-0">
                  <span class="text-xs font-medium truncate">{{ item.title }}</span>
                  <span
                    v-if="item.badge"
                    class="text-[10px] px-1.5 py-0.2 rounded font-mono shrink-0"
                    :class="getBadgeClass(item)"
                  >
                    {{ item.badge }}
                  </span>
                </div>
                <div v-if="item.subtitle" class="text-[11px] text-muted-foreground font-mono truncate">
                  {{ item.subtitle }}
                </div>
              </div>
            </div>

            <!-- 右侧快捷键提示 / 回车指示 -->
            <div class="flex items-center space-x-2 ml-3 shrink-0">
              <Check v-if="item.kind === 'environment' && item.active" class="w-3.5 h-3.5 text-emerald-400" />
              <kbd
                v-if="item.shortcutText"
                class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-background/80 border border-border text-muted-foreground"
              >
                {{ item.shortcutText }}
              </kbd>
              <CornerDownLeft
                v-if="idx === selectedIndex"
                class="w-3.5 h-3.5 text-primary/80 shrink-0"
              />
            </div>
          </button>
        </div>

        <!-- 底部快捷键说明 -->
        <div class="flex items-center justify-between px-4 py-2 border-t border-border/60 bg-muted/20 text-[10px] text-muted-foreground select-none">
          <div class="flex items-center space-x-3">
            <span><kbd class="font-mono">↑↓</kbd> 选择</span>
            <span><kbd class="font-mono">↵</kbd> 打开/执行</span>
            <span><kbd class="font-mono">Tab</kbd> 切换分类</span>
          </div>
          <div class="hidden sm:flex items-center space-x-2.5 font-mono">
            <span>&gt; 命令</span>
            <span>@ 环境</span>
            <span># 历史</span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Check, CornerDownLeft, Globe, Search, Terminal, X } from 'lucide-vue-next'
import { useEscapeCancel } from '@/composables/useEscapeCancel'
import { defaultCommandRegistry } from '@/core/commands/commandRegistry'
import {
  buildQuickSearchItems,
  filterQuickSearchItems,
  parseQuickSearchQuery,
  type QuickSearchCategory,
  type QuickSearchItem
} from '@/core/search/quickSearch'
import { ESCAPE_PRIORITY } from '@/core/shortcuts/escapeStack'
import { useAppStore } from '@/stores/appStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { getMethodTextColor } from '@/utils/methodStyle'

const appStore = useAppStore()
const workspaceStore = useWorkspaceStore()
const sessionStore = useSessionStore()

const isOpen = computed(() => appStore.showQuickSearchModal)
const isMac = typeof navigator !== 'undefined' && /macintosh|mac os x/i.test(navigator.userAgent)

const query = ref('')
const activeCategory = ref<QuickSearchCategory>('all')
const selectedIndex = ref(0)
const openRevision = ref(0)
const searchInputRef = ref<HTMLInputElement | null>(null)
const listContainerRef = ref<HTMLElement | null>(null)
const itemRefs = ref<Array<HTMLElement | null>>([])

const categoryTabs: Array<{ id: QuickSearchCategory; label: string; prefix?: string }> = [
  { id: 'all', label: '全部' },
  { id: 'request', label: '接口' },
  { id: 'command', label: '命令', prefix: '>' },
  { id: 'environment', label: '环境', prefix: '@' },
  { id: 'history', label: '历史', prefix: '#' }
]

const effectiveCategory = computed(() => {
  return parseQuickSearchQuery(query.value, activeCategory.value).category
})

const allItems = computed(() => {
  void openRevision.value
  return buildQuickSearchItems({
    tabs: sessionStore.tabs,
    activeTabId: sessionStore.activeTabId,
    subProjects: workspaceStore.subProjects,
    environments: workspaceStore.environments,
    activeEnvironmentId: workspaceStore.activeEnvironment?.id ?? null,
    commands: defaultCommandRegistry.list(),
    history: workspaceStore.history,
    isMac
  })
})

const results = computed(() => {
  return filterQuickSearchItems(allItems.value, query.value, activeCategory.value, 60)
})

watch(isOpen, async open => {
  if (open) {
    openRevision.value++
    query.value = ''
    activeCategory.value = 'all'
    selectedIndex.value = 0
    await nextTick()
    searchInputRef.value?.focus()
  }
})

watch(results, list => {
  itemRefs.value.length = list.length
  if (selectedIndex.value >= list.length) {
    selectedIndex.value = 0
  }
})

function setItemRef(el: HTMLElement | null, idx: number) {
  itemRefs.value[idx] = el
}

function close() {
  appStore.showQuickSearchModal = false
}

useEscapeCancel(isOpen, close, { priority: ESCAPE_PRIORITY.MODAL })

function selectCategory(cat: QuickSearchCategory) {
  activeCategory.value = cat
  // 如果当前搜索词带前缀，移除冲突前缀以免被前缀覆盖
  if (/^\s*[>@#]/.test(query.value)) {
    query.value = query.value.replace(/^\s*[>@#]\s*/, '')
  }
  selectedIndex.value = 0
  searchInputRef.value?.focus()
}

function scrollSelectedIntoView() {
  void nextTick(() => {
    const el = itemRefs.value[selectedIndex.value]
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function handleInputKeyDown(e: KeyboardEvent) {
  if (e.isComposing) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (results.value.length > 0) {
      selectedIndex.value = (selectedIndex.value + 1) % results.value.length
      scrollSelectedIntoView()
    }
    return
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (results.value.length > 0) {
      selectedIndex.value = (selectedIndex.value - 1 + results.value.length) % results.value.length
      scrollSelectedIntoView()
    }
    return
  }

  if (e.key === 'Tab') {
    e.preventDefault()
    const idx = categoryTabs.findIndex(t => t.id === effectiveCategory.value)
    const nextIdx = e.shiftKey
      ? (idx - 1 + categoryTabs.length) % categoryTabs.length
      : (idx + 1) % categoryTabs.length
    selectCategory(categoryTabs[nextIdx].id)
    return
  }

  if (e.key === 'Enter') {
    e.preventDefault()
    const item = results.value[selectedIndex.value]
    if (item) {
      void executeItem(item)
    }
  }
}

async function executeItem(item: QuickSearchItem) {
  close()
  const payload = item.payload

  if (payload.type === 'tab') {
    sessionStore.switchTab(payload.tabId)
    return
  }

  if (payload.type === 'request') {
    sessionStore.openTab(payload.request, payload.subProjectDir)
    return
  }

  if (payload.type === 'history') {
    sessionStore.loadHistoryItem(payload.item)
    return
  }

  if (payload.type === 'environment') {
    try {
      await workspaceStore.setActiveEnvironment(payload.envId)
      const envName =
        payload.envId == null
          ? '无环境 (No Env)'
          : workspaceStore.environments.find(e => e.id === payload.envId)?.name || payload.envId
      appStore.showToast(`已切换环境变量: ${envName}`)
    } catch (err: any) {
      appStore.showToast(`切换环境变量失败: ${err?.message || err}`, true)
    }
    return
  }

  if (payload.type === 'command') {
    await defaultCommandRegistry.execute(payload.commandId)
  }
}

function getBadgeClass(item: QuickSearchItem): string {
  if (item.kind === 'tab') {
    return item.active
      ? 'bg-primary/20 text-primary'
      : 'bg-sky-500/10 text-sky-400'
  }
  if (item.kind === 'environment') {
    return item.active
      ? 'bg-emerald-500/15 text-emerald-400'
      : 'bg-muted text-muted-foreground'
  }
  if (item.kind === 'history') {
    const s = item.status ?? 0
    if (s >= 200 && s < 300) return 'bg-emerald-500/10 text-emerald-400'
    if (s >= 400) return 'bg-rose-500/10 text-rose-400'
    return 'bg-muted text-muted-foreground'
  }
  return 'bg-muted text-muted-foreground'
}
</script>
