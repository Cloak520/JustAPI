<template>
  <div class="flex-1 min-h-0 flex flex-col space-y-2 overflow-hidden">
    <div class="flex items-center justify-between text-xs shrink-0">
      <span class="text-muted-foreground text-[11px]">默认保持原始排版，不自动格式化</span>
      <div class="flex items-center space-x-2">
        <button
          @click="sessionStore.formatActiveJson()"
          class="flex items-center space-x-1 px-2 py-1 rounded bg-muted hover:bg-muted/80 text-foreground text-[11px] font-medium transition"
          title="基于 Rust 原生 serde_json 异步执行 (Shift+Alt+F)"
        >
          <Sparkles class="w-3.5 h-3.5 text-primary" />
          <span>格式化 (Prettify)</span>
        </button>
        <button
          @click="sessionStore.minifyActiveJson()"
          class="flex items-center space-x-1 px-2 py-1 rounded bg-muted hover:bg-muted/80 text-foreground text-[11px] font-medium transition"
          title="压缩为单行紧凑 JSON"
        >
          <Minimize2 class="w-3.5 h-3.5 text-amber-400" />
          <span>单行压缩 (Minify)</span>
        </button>
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-hidden">
      <CodeEditor v-model="sessionStore.activeRequest.bodyContent" language="json" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Sparkles, Minimize2 } from 'lucide-vue-next'
import CodeEditor from '@/components/common/CodeEditor.vue'
import { useSessionStore } from '@/stores/sessionStore'

const sessionStore = useSessionStore()
</script>

