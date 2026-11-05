<template>
  <div class="flex flex-col space-y-1.5">
    <div class="flex items-center space-x-2">
      <!-- Method 选择框 -->
      <div class="relative shrink-0">
        <select
          v-model="store.method"
          :class="methodColorClass"
          class="font-mono font-bold text-xs px-3 py-2 rounded-lg border border-border appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary pr-7 transition"
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
          <option value="PATCH">PATCH</option>
          <option value="HEAD">HEAD</option>
          <option value="OPTIONS">OPTIONS</option>
        </select>
        <ChevronDown class="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
      </div>

      <!-- URL 输入框群组 (BaseURL 拼接展示 + Path 输入) -->
      <div class="flex-1 flex items-center bg-card border border-border rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-primary transition">
        <!-- 继承的 BaseURL 标签/前缀 -->
        <div class="px-2.5 py-1.5 bg-muted/60 text-muted-foreground text-xs font-mono border-r border-border flex items-center space-x-1.5 shrink-0 select-none">
          <Globe class="w-3.5 h-3.5 text-primary/80" />
          <span class="max-w-[200px] truncate" :title="store.baseUrl">{{ store.baseUrl || '无 BaseURL' }}</span>
        </div>

        <!-- 相对路径 Path 输入 -->
        <input
          v-model="store.path"
          type="text"
          placeholder="/api/v1/resource/{id}"
          class="w-full bg-transparent px-3 py-2 text-xs font-mono text-foreground focus:outline-none"
          @keydown.enter="store.send"
        />
      </div>

      <!-- 发送按钮 -->
      <button
        @click="store.send"
        :disabled="store.loading"
        class="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-xs hover:bg-primary/90 transition shadow-sm disabled:opacity-50 shrink-0"
        title="快捷键: Cmd/Ctrl + Enter"
      >
        <Loader2 v-if="store.loading" class="w-3.5 h-3.5 animate-spin" />
        <Send v-else class="w-3.5 h-3.5" />
        <span>{{ store.loading ? '请求中...' : 'Send' }}</span>
      </button>
    </div>

    <!-- 实时拼接完整 URL 预览 -->
    <div class="flex items-center space-x-2 text-[11px] text-muted-foreground px-1 truncate">
      <span class="text-muted-foreground/70 shrink-0">拼接预览:</span>
      <span class="font-mono text-foreground/90 truncate">{{ store.resolvedUrl }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown, Send, Loader2, Globe } from 'lucide-vue-next'
import { useRequestStore } from '@/stores/requestStore'
import { onKeyStroke } from '@vueuse/core'

const store = useRequestStore()

const methodColorClass = computed(() => {
  switch (store.method) {
    case 'GET': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    case 'POST': return 'bg-amber-500/10 text-amber-400 border-amber-500/30'
    case 'PUT': return 'bg-blue-500/10 text-blue-400 border-blue-500/30'
    case 'DELETE': return 'bg-rose-500/10 text-rose-400 border-rose-500/30'
    case 'PATCH': return 'bg-purple-500/10 text-purple-400 border-purple-500/30'
    default: return 'bg-muted text-muted-foreground'
  }
})

// 快捷键 Cmd/Ctrl + Enter 发送请求
onKeyStroke('Enter', (e) => {
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault()
    store.send()
  }
})
</script>
