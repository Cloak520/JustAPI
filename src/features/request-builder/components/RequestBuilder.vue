<template>
  <div class="flex flex-col h-full space-y-3">
    <!-- 基于 requestTabRegistry 动态渲染顶部 Tabs -->
    <div class="flex items-center justify-between border-b border-border pb-1 shrink-0 select-none">
      <div class="flex items-center space-x-1 text-xs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTabId = tab.id"
          :class="activeTabId === tab.id ? 'text-primary font-medium border-b-2 border-primary bg-muted/30' : 'text-muted-foreground hover:text-foreground'"
          class="px-3 py-1.5 rounded-t-md transition relative flex items-center space-x-1.5"
        >
          <span>{{ tab.label }}</span>
          <span
            v-if="tab.badge > 0"
            class="text-[10px] px-1 py-0.2 rounded-full bg-primary/20 text-primary font-mono"
          >
            {{ tab.badge }}
          </span>
        </button>
      </div>
    </div>

    <!-- 当前选中的扩展/内置 Tab 内容 -->
    <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
      <component :is="activeTabComponent" v-if="activeTabComponent" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { requestTabRegistry } from '@/core/registries/extensionRegistry'
import { useSessionStore } from '@/stores/sessionStore'

const sessionStore = useSessionStore()

const registeredTabs = computed(() => requestTabRegistry.list())
const activeTabId = ref<string>('headers')

watch(
  registeredTabs,
  list => {
    if (list.length > 0 && !list.some(t => t.id === activeTabId.value)) {
      activeTabId.value = list[0].id
    }
  },
  { immediate: true }
)

const tabs = computed(() =>
  registeredTabs.value.map(t => ({
    ...t,
    badge: t.badgeCount
      ? t.badgeCount({
          request: sessionStore.activeRequest,
          activeHeadersCount: sessionStore.headerResolution.activeHeadersCount
        })
      : 0
  }))
)

const activeTabComponent = computed(() => {
  return requestTabRegistry.get(activeTabId.value)?.component ?? null
})
</script>

