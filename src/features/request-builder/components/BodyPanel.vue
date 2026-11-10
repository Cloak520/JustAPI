<template>
  <div class="flex-1 min-h-0 flex flex-col h-full space-y-3 overflow-hidden">
    <!-- Body 类型选择器（基于 bodyEditorRegistry 动态渲染） -->
    <div class="flex items-center space-x-4 text-xs select-none shrink-0 flex-wrap gap-y-1">
      <label
        v-for="editor in bodyEditors"
        :key="editor.id"
        class="flex items-center space-x-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
      >
        <input
          type="radio"
          :value="editor.id"
          v-model="sessionStore.activeRequest.bodyType"
          class="text-primary focus:ring-0 cursor-pointer"
        />
        <span :class="sessionStore.activeRequest.bodyType === editor.id ? 'font-medium text-foreground' : ''">
          {{ editor.label }}
        </span>
      </label>
    </div>

    <!-- 对应 Body 编辑器 -->
    <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
      <component :is="activeEditorComponent" v-if="activeEditorComponent" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { bodyEditorRegistry } from '@/core/registries/extensionRegistry'
import { useSessionStore } from '@/stores/sessionStore'

const sessionStore = useSessionStore()

const bodyEditors = computed(() => bodyEditorRegistry.list())

const activeEditorComponent = computed(() => {
  const current = bodyEditorRegistry.get(sessionStore.activeRequest.bodyType)
  if (current) return current.component
  return bodyEditors.value[0]?.component ?? null
})
</script>

