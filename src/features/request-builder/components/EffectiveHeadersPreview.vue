<template>
  <div class="flex-1 min-h-0 flex flex-col space-y-2 overflow-hidden">
    <div class="flex items-center justify-between px-1 shrink-0 text-xs">
      <div class="flex items-center space-x-2">
        <span class="text-xs font-semibold text-foreground">
          全部生效 Headers (共 {{ sessionStore.headerResolution.activeHeadersCount }} 项生效)
        </span>
        <span class="text-[10px] text-muted-foreground/60 hidden sm:inline">
          已综合项目全局、子项目级联与接口专属覆盖配置
        </span>
      </div>

      <div class="relative w-56">
        <Search class="w-3.5 h-3.5 text-muted-foreground/50 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          v-model="previewSearchQuery"
          type="text"
          placeholder="搜索生效 Header..."
          class="w-full pl-8 pr-3 py-1 text-xs rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary/50 font-mono"
        />
      </div>
    </div>

    <div class="flex-1 min-h-0 flex flex-col border border-border rounded-lg bg-card/40 overflow-hidden text-xs">
      <div class="grid grid-cols-[36px_180px_1fr_100px_180px] bg-muted/60 px-3 py-1.5 font-medium text-[10px] text-muted-foreground select-none shrink-0 border-b border-border/40">
        <div class="text-center">状态</div>
        <div>Key</div>
        <div>最终发送 Value</div>
        <div>来源</div>
        <div>继承与覆盖说明</div>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto divide-y divide-border/30">
        <div
          v-for="item in filteredPreviewHeaders"
          :key="item.key"
          class="grid grid-cols-[36px_180px_1fr_100px_180px] items-center px-3 py-1.5 hover:bg-muted/20 transition text-[11px]"
          :class="!item.enabled ? 'opacity-50' : ''"
        >
          <div class="flex items-center justify-center">
            <span
              class="w-2 h-2 rounded-full"
              :class="item.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/40'"
              :title="item.enabled ? '此 Header 将随请求发送' : '未启用，不会发送'"
            ></span>
          </div>
          <div class="font-mono font-semibold text-foreground truncate pr-2" :title="item.key">
            {{ item.key }}
          </div>
          <div class="font-mono text-foreground/90 truncate pr-2" :title="item.value">
            {{ item.value || '(空)' }}
          </div>
          <div>
            <span
              class="text-[9px] px-1.5 py-0.2 rounded font-sans border font-medium inline-block"
              :class="{
                'bg-primary/10 text-primary border-primary/20': item.source === 'project',
                'bg-blue-500/10 text-blue-400 border-blue-500/20': item.source === 'subproject',
                'bg-purple-500/10 text-purple-400 border-purple-500/20': item.source === 'custom'
              }"
            >
              {{ item.sourceLabel }}
            </span>
          </div>
          <div class="text-[10px] truncate text-muted-foreground" :title="item.overrideNote || item.description">
            <span v-if="item.status === 'overridden'" class="text-amber-400 font-medium mr-1">
              已覆盖
            </span>
            <span v-else-if="item.status === 'disabled'" class="text-rose-400 font-medium mr-1">
              已在此接口禁用
            </span>
            <span v-if="item.overrideNote" class="text-muted-foreground/60">
              ({{ item.overrideNote }})
            </span>
            <span v-else-if="item.description" class="text-muted-foreground/60">
              {{ item.description }}
            </span>
            <span v-else class="text-muted-foreground/40">
              正常继承
            </span>
          </div>
        </div>

        <div v-if="filteredPreviewHeaders.length === 0" class="py-8 text-center text-xs text-muted-foreground/60">
          未找到匹配的 Header
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search } from 'lucide-vue-next'
import { useSessionStore } from '@/stores/sessionStore'

const sessionStore = useSessionStore()
const previewSearchQuery = ref('')

const filteredPreviewHeaders = computed(() => {
  const list = sessionStore.headerResolution.effectiveHeaders
  const q = previewSearchQuery.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(
    h =>
      h.key.toLowerCase().includes(q) ||
      h.value.toLowerCase().includes(q) ||
      (h.description && h.description.toLowerCase().includes(q))
  )
})
</script>

