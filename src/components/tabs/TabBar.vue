<template>
  <div class="flex items-center space-x-1 border-b border-border bg-card/40 px-2 h-9 shrink-0 select-none overflow-x-auto text-xs">
    <div
      v-for="tab in tabStore.tabs"
      :key="tab.id"
      @click="tabStore.activeTabId = tab.id"
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

      <!-- 未保存小圆点 / 关闭与复制按钮 -->
      <div class="flex items-center shrink-0 space-x-0.5 justify-end">
        <span v-if="tab.isDirty" class="w-1.5 h-1.5 rounded-full bg-primary group-hover:hidden"></span>
        <button
          @click.stop="duplicateTab(tab)"
          class="rounded hover:bg-muted/80 p-0.5 text-muted-foreground/60 hover:text-foreground hidden group-hover:flex transition"
          title="复制此接口 (Duplicate)"
        >
          <Copy class="w-3 h-3" />
        </button>
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
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { Plus, X, Copy } from 'lucide-vue-next'
import { useTabStore } from '@/stores/tabStore'
import { useProjectStore } from '@/stores/projectStore'
import { useRequestStore } from '@/stores/requestStore'
import type { HttpMethod, TabItem, ApiRequest } from '@/types'

const tabStore = useTabStore()
const projectStore = useProjectStore()
const requestStore = useRequestStore()

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

async function duplicateTab(tab: TabItem) {
  if (tab.subProjectDir && tab.fileName && projectStore.projectPath) {
    const sub = projectStore.subProjects.find(s => s.dir_name === tab.subProjectDir)
    const existingReq = sub?.requests.find(r => r.fileName === tab.fileName || r.id === tab.requestId)
    if (existingReq) {
      let reqToClone: ApiRequest = existingReq
      if (tab.id === tabStore.activeTabId) {
        reqToClone = {
          ...existingReq,
          name: tab.title,
          method: requestStore.method,
          path: requestStore.path,
          pathParams: JSON.parse(JSON.stringify(requestStore.pathParams)),
          queryParams: JSON.parse(JSON.stringify(requestStore.queryParams)),
          headers: JSON.parse(JSON.stringify(requestStore.headers)),
          bodyType: requestStore.bodyType,
          bodyContent: requestStore.bodyContent,
          group: tab.group || requestStore.group || undefined
        }
      }
      const cloned = await projectStore.duplicateRequest(tab.subProjectDir, reqToClone)
      if (cloned) {
        tabStore.openTab(cloned, tab.subProjectDir)
      }
      return
    }
  }

  tabStore.duplicateMemoryTab(tab.id)
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
    default: return 'text-muted-foreground'
  }
}
</script>

