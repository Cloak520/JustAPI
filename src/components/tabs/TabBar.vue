<template>
  <div
    class="flex items-center space-x-1 border-b border-border bg-card/40 px-2 h-9 shrink-0 select-none overflow-x-auto text-xs"
    data-tauri-drag-region
    @mousedown="handleTabBarMouseDown"
    @dblclick="handleTabBarDblClick"
  >
    <div
      v-for="tab in tabStore.tabs"
      :key="tab.id"
      @click="tabStore.switchTab(tab.id)"
      @contextmenu.prevent="openContextMenu($event, tab)"
      :class="tabStore.activeTabId === tab.id ? 'bg-background border-t-2 border-t-primary border-x border-border text-foreground' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground border-transparent'"
      class="group flex items-center space-x-2 px-3 py-1.5 rounded-t-md cursor-pointer transition max-w-[200px] border border-b-0 shrink-0"
    >
      <!-- Method 标签 -->
      <span class="font-mono font-bold text-[10px]" :class="getMethodColor(tab.method)">
        {{ tab.method }}
      </span>

      <!-- 标题 (双击可直接重命名) -->
      <input
        v-if="editingTabId === tab.id"
        ref="editInputRef"
        v-model="editingTitle"
        @blur="finishEditing(tab)"
        @keydown.enter="finishEditing(tab)"
        @keydown.esc="cancelEditing"
        @click.stop
        class="text-[11px] font-medium bg-background px-1 py-0.2 rounded border border-primary focus:outline-none w-28 text-foreground"
      />
      <span
        v-else
        @dblclick.stop="startEditing(tab)"
        class="truncate text-[11px] font-medium"
        :title="`${tab.title} (双击重命名)`"
      >
        {{ tab.title }}
      </span>

      <!-- 未保存小圆点 / 关闭按钮 -->
      <div class="flex items-center shrink-0 space-x-0.5 justify-end">
        <span v-if="tab.isDirty" class="w-1.5 h-1.5 rounded-full bg-primary group-hover:hidden"></span>
        <button
          @click.stop="tabStore.closeTab(tab.id)"
          class="rounded hover:bg-muted/80 p-0.5 text-muted-foreground/60 hover:text-foreground hidden group-hover:flex transition"
          title="关闭标签页"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>

    <!-- 新建 Tab 按钮 -->
    <button
      @click="tabStore.newTab"
      class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition shrink-0 ml-1"
      title="新建请求 (Cmd/Ctrl + T)"
    >
      <Plus class="w-3.5 h-3.5" />
    </button>

    <!-- Tab 栏右侧空白拖拽区域 -->
    <div class="flex-1 h-full min-w-[30px]" data-tauri-drag-region />

    <!-- Tab 标签页右键快捷上下文菜单 (关闭其他 / 关闭右侧 / 全部关闭 / 复制 Tab / 侧边栏定位) -->
    <Teleport to="body">
      <div
        v-if="contextMenuVisible && contextMenuTab"
        class="fixed inset-0 z-50"
        @click="closeContextMenu"
        @contextmenu.prevent="closeContextMenu"
      >
        <div
          class="fixed z-50 w-52 rounded-xl border border-border bg-card/95 backdrop-blur-md p-1.5 shadow-2xl text-xs text-foreground animate-in fade-in zoom-in-95 select-none"
          :style="{ left: `${contextMenuPos.x}px`, top: `${contextMenuPos.y}px` }"
          @click.stop
        >
          <!-- 1. 复制 Tab -->
          <button
            @click="handleDuplicateTab"
            class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground transition text-left group"
          >
            <Copy class="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            <span>复制 Tab</span>
          </button>

          <!-- 2. 在侧边栏快速定位文件 -->
          <button
            @click="handleRevealInSidebar"
            class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground transition text-left group"
            :class="!canReveal ? 'opacity-60' : ''"
            :title="canReveal ? '在左侧集合树中展开并高亮对应文件' : '此请求为临时草稿，尚未保存至本地文件'"
          >
            <FolderSearch class="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            <span>在侧边栏快速定位文件</span>
          </button>

          <div class="my-1 border-t border-border/60" />

          <!-- 3. 关闭其他标签页 -->
          <button
            @click="handleCloseOtherTabs"
            :disabled="tabStore.tabs.length <= 1"
            class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground transition text-left group disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Layers class="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
            <span>关闭其他标签页</span>
          </button>

          <!-- 4. 关闭右侧标签页 -->
          <button
            @click="handleCloseTabsToRight"
            :disabled="isTargetLastTab"
            class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg hover:bg-muted text-foreground transition text-left group disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowRightToLine class="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
            <span>关闭右侧标签页</span>
          </button>

          <div class="my-1 border-t border-border/60" />

          <!-- 5. 全部关闭 -->
          <button
            @click="handleCloseAllTabs"
            class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition text-left group"
          >
            <XCircle class="w-3.5 h-3.5 text-destructive/80 group-hover:text-destructive transition-colors" />
            <span>全部关闭</span>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { Plus, X, Copy, FolderSearch, Layers, ArrowRightToLine, XCircle } from 'lucide-vue-next'
import { onKeyStroke } from '@vueuse/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useTabStore } from '@/stores/tabStore'
import { useProjectStore } from '@/stores/projectStore'
import type { HttpMethod, TabItem } from '@/types'

const tabStore = useTabStore()
const projectStore = useProjectStore()

// 右键上下文菜单状态
const contextMenuVisible = ref(false)
const contextMenuPos = ref({ x: 0, y: 0 })
const contextMenuTab = ref<TabItem | null>(null)

const canReveal = computed(() => {
  return !!contextMenuTab.value?.subProjectDir && (!!contextMenuTab.value?.fileName || !!contextMenuTab.value?.requestId)
})

const isTargetLastTab = computed(() => {
  if (!contextMenuTab.value) return true
  const idx = tabStore.tabs.findIndex(t => t.id === contextMenuTab.value?.id)
  return idx === -1 || idx === tabStore.tabs.length - 1
})

function openContextMenu(e: MouseEvent, tab: TabItem) {
  contextMenuTab.value = tab

  const menuW = 210
  const menuH = 200
  let x = e.clientX
  let y = e.clientY

  if (x + menuW > window.innerWidth) {
    x = Math.max(10, window.innerWidth - menuW - 10)
  }
  if (y + menuH > window.innerHeight) {
    y = Math.max(10, window.innerHeight - menuH - 10)
  }

  contextMenuPos.value = { x, y }
  contextMenuVisible.value = true
}

function closeContextMenu() {
  contextMenuVisible.value = false
  contextMenuTab.value = null
}

function handleDuplicateTab() {
  if (!contextMenuTab.value) return
  const id = contextMenuTab.value.id
  closeContextMenu()
  tabStore.duplicateMemoryTab(id)
}

function handleRevealInSidebar() {
  if (!contextMenuTab.value) return
  const tab = contextMenuTab.value
  closeContextMenu()
  projectStore.revealRequestInSidebar(tab)
}

function handleCloseOtherTabs() {
  if (!contextMenuTab.value) return
  const id = contextMenuTab.value.id
  closeContextMenu()
  tabStore.closeOtherTabs(id)
}

function handleCloseTabsToRight() {
  if (!contextMenuTab.value) return
  const id = contextMenuTab.value.id
  closeContextMenu()
  tabStore.closeTabsToTheRight(id)
}

function handleCloseAllTabs() {
  closeContextMenu()
  tabStore.closeAllTabs()
}

onKeyStroke('Escape', () => {
  if (contextMenuVisible.value) {
    closeContextMenu()
  }
})

onMounted(() => {
  window.addEventListener('resize', closeContextMenu)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', closeContextMenu)
})

async function handleTabBarMouseDown(e: MouseEvent) {
  if (e.button !== 0) return
  const target = e.target as HTMLElement | null
  if (target?.closest('button, input, [role="button"], .group')) {
    return
  }
  try {
    await getCurrentWindow().startDragging()
  } catch {
    // ignore
  }
}

async function handleTabBarDblClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  if (target?.closest('button, input, [role="button"], .group')) {
    return
  }
  try {
    await getCurrentWindow().toggleMaximize()
  } catch {
    // ignore
  }
}

const editingTabId = ref<string | null>(null)
const editingTitle = ref('')
const editInputRef = ref<HTMLInputElement[] | null>(null)

function startEditing(tab: TabItem) {
  editingTabId.value = tab.id
  editingTitle.value = tab.title
  nextTick(() => {
    if (editInputRef.value && editInputRef.value[0]) {
      editInputRef.value[0].focus()
      editInputRef.value[0].select()
    }
  })
}

async function finishEditing(tab: TabItem) {
  if (editingTabId.value !== tab.id) return
  const newTitle = editingTitle.value.trim() || '未命名请求'
  tab.title = newTitle
  editingTabId.value = null
  tabStore.markCurrentDirty(true)

  if (tab.subProjectDir && tab.fileName && projectStore.projectPath) {
    const sub = projectStore.subProjects.find(s => s.dir_name === tab.subProjectDir)
    const existingReq = sub?.requests.find(r => r.fileName === tab.fileName || r.id === tab.requestId)
    if (existingReq) {
      existingReq.name = newTitle
      await projectStore.saveRequest(tab.subProjectDir, tab.fileName, existingReq)
    }
  }
}

function cancelEditing() {
  editingTabId.value = null
}

function getMethodColor(method: HttpMethod) {
  switch (method) {
    case 'GET': return 'text-emerald-400'
    case 'POST': return 'text-amber-400'
    case 'PUT': return 'text-blue-400'
    case 'DELETE': return 'text-rose-400'
    case 'PATCH': return 'text-purple-400'
    case 'HEAD': return 'text-teal-400'
    case 'OPTIONS': return 'text-indigo-400'
    default: return 'text-muted-foreground'
  }
}
</script>

