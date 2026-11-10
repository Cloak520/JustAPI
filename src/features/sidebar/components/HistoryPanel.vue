<template>
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- 历史搜索过滤栏 -->
    <div class="px-2.5 py-1.5 border-b border-border/50 bg-card/40 shrink-0">
      <div class="relative flex items-center">
        <Search class="w-3.5 h-3.5 text-muted-foreground/60 absolute left-2.5 pointer-events-none" />
        <input
          v-model="historySearchQuery"
          type="text"
          placeholder="搜索历史 URL、方法、状态码..."
          class="w-full pl-8 pr-7 py-1 text-xs rounded-md bg-muted/50 border border-border/60 focus:bg-background focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition text-foreground placeholder:text-muted-foreground/60 font-sans"
          @keydown.esc="handleSearchEscape($event)"
        />
        <button
          v-if="historySearchQuery"
          @click="historySearchQuery = ''"
          class="absolute right-2 p-0.5 text-muted-foreground/60 hover:text-foreground rounded transition"
          title="清空搜索"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>

    <div class="p-2 border-b border-border flex items-center justify-between shrink-0 bg-muted/20">
      <span class="text-[11px] font-medium text-muted-foreground">
        {{
          historySearchQuery.trim()
            ? `搜索结果 (${filteredHistory.length} / ${workspaceStore.history.length})`
            : `最近执行历史 (共 ${workspaceStore.history.length} 条)`
        }}
      </span>
      <button
        v-if="workspaceStore.history.length > 0"
        @click="workspaceStore.clearHistory"
        class="text-[10px] text-muted-foreground hover:text-destructive transition"
        title="清空全部历史记录"
      >
        清空全部
      </button>
    </div>

    <div class="flex-1 overflow-y-auto divide-y divide-border/60">
      <div
        v-for="h in filteredHistory"
        :key="h.id"
        class="p-2.5 hover:bg-muted/30 cursor-pointer transition space-y-1 group relative"
        @click="sessionStore.loadHistoryItem(h)"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-1.5">
            <span class="font-mono font-bold text-[10px]" :class="getMethodTextColor(h.method)">
              {{ h.method }}
            </span>
            <span
              class="font-mono text-[10px]"
              :class="h.status >= 200 && h.status < 300 ? 'text-emerald-400' : 'text-rose-400'"
            >
              {{ h.status }} ({{ h.durationMs }}ms)
            </span>
          </div>

          <button
            @click.stop="workspaceStore.deleteHistoryItem(h.id)"
            class="p-1 rounded text-muted-foreground/40 hover:text-destructive opacity-0 group-hover:opacity-100 transition"
            title="删除此条记录"
          >
            <Trash2 class="w-3 h-3" />
          </button>
        </div>

        <div class="text-[11px] text-foreground font-mono truncate" :title="h.url">
          {{ h.url }}
        </div>

        <div class="flex items-center justify-between text-[10px] text-muted-foreground/60">
          <span>{{ new Date(h.timestamp).toLocaleTimeString() }}</span>
          <span
            v-if="h.bodyType && h.bodyType !== 'none'"
            class="px-1 py-0.2 rounded bg-muted text-[9px] font-mono"
          >
            Body: {{ h.bodyType }}
          </span>
        </div>
      </div>

      <div v-if="filteredHistory.length === 0" class="py-6 text-center text-xs text-muted-foreground/60">
        {{ historySearchQuery.trim() ? '未找到匹配的历史记录' : '暂无请求历史' }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search, Trash2, X } from 'lucide-vue-next'
import { defaultEscapeStack, ESCAPE_PRIORITY } from '@/core/shortcuts/escapeStack'
import { useSessionStore } from '@/stores/sessionStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { getMethodTextColor } from '@/utils/methodStyle'

const workspaceStore = useWorkspaceStore()
const sessionStore = useSessionStore()

const historySearchQuery = ref('')

function handleSearchEscape(e: KeyboardEvent) {
  if (defaultEscapeStack.hasActive(ESCAPE_PRIORITY.MODAL)) return
  if (historySearchQuery.value) {
    historySearchQuery.value = ''
    e.preventDefault()
    e.stopPropagation()
  }
}

const filteredHistory = computed(() => {
  const q = historySearchQuery.value.trim().toLowerCase()
  if (!q) return workspaceStore.history
  return workspaceStore.history.filter(
    h =>
      h.url.toLowerCase().includes(q) ||
      h.method.toLowerCase().includes(q) ||
      String(h.status).includes(q) ||
      (h.name && h.name.toLowerCase().includes(q))
  )
})
</script>

