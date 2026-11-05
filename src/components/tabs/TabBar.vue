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

      <!-- 标题 -->
      <span class="truncate text-[11px] font-medium" :title="tab.title">
        {{ tab.title }}
      </span>

      <!-- 未保存小圆点 / 关闭按钮 -->
      <div class="flex items-center shrink-0 w-3.5 h-3.5 justify-center">
        <span v-if="tab.isDirty" class="w-1.5 h-1.5 rounded-full bg-primary group-hover:hidden"></span>
        <button
          @click.stop="tabStore.closeTab(tab.id)"
          class="rounded hover:bg-muted/80 p-0.5 text-muted-foreground/60 hover:text-foreground hidden group-hover:flex"
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
import { Plus, X } from 'lucide-vue-next'
import { useTabStore } from '@/stores/tabStore'
import type { HttpMethod } from '@/types'

const tabStore = useTabStore()

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

