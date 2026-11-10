<template>
  <div class="flex-1 min-h-0 flex flex-col space-y-3 overflow-hidden">
    <!-- Path Variables -->
    <div v-if="sessionStore.activeRequest.pathParams.length > 0" class="shrink-0 space-y-1.5 max-h-36 flex flex-col">
      <div class="flex items-center justify-between shrink-0">
        <span class="text-xs font-semibold text-foreground/90 flex items-center space-x-1.5">
          <span>Path Variables (路径参数)</span>
          <span class="text-[10px] text-muted-foreground font-normal">自动从 URL 中提取</span>
        </span>
      </div>
      <div class="overflow-y-auto">
        <KeyValueGrid :items="sessionStore.activeRequest.pathParams" />
      </div>
    </div>

    <!-- Query Params -->
    <div class="flex-1 min-h-0 flex flex-col space-y-1.5">
      <div class="flex items-center justify-between shrink-0">
        <span class="text-xs font-semibold text-foreground/90">Query Params (URL 参数)</span>
        <button
          @click="paramsTextMode = !paramsTextMode"
          class="flex items-center space-x-1 px-2 py-0.5 rounded border border-border bg-card/60 hover:bg-muted/50 text-muted-foreground hover:text-foreground transition text-[11px]"
          :title="paramsTextMode ? '切换为表格模式' : '切换为文本模式'"
        >
          <Code2 v-if="!paramsTextMode" class="w-3 h-3 text-primary" />
          <Table2 v-else class="w-3 h-3 text-primary" />
          <span>{{ paramsTextMode ? '表格模式' : '文本模式' }}</span>
        </button>
      </div>

      <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
        <BulkTextEditor
          v-if="paramsTextMode"
          :items="sessionStore.activeRequest.queryParams"
          format="equal"
          @update:items="val => (sessionStore.activeRequest.queryParams = val)"
        />
        <KeyValueGrid v-else :items="sessionStore.activeRequest.queryParams" :fill-height="true" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Code2, Table2 } from 'lucide-vue-next'
import BulkTextEditor from '@/components/request/BulkTextEditor.vue'
import KeyValueGrid from '@/components/request/KeyValueGrid.vue'
import { useSessionStore } from '@/stores/sessionStore'

const sessionStore = useSessionStore()
const paramsTextMode = ref(false)
</script>

