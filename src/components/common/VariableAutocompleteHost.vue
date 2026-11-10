<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      ref="popoverRef"
      :style="popoverStyle"
      class="fixed z-[9999] w-[340px] max-w-[92vw] max-h-60 overflow-y-auto rounded-xl border border-border bg-popover/95 p-1 text-popover-foreground shadow-2xl backdrop-blur-md text-xs select-none animate-in fade-in zoom-in-95 duration-100"
      @mousedown.prevent
    >
      <div class="px-2 py-1 flex items-center justify-between text-[10px] text-muted-foreground border-b border-border/50 mb-0.5">
        <span class="font-medium">插入变量 <code class="font-mono text-primary">&#123;&#123;...&#125;&#125;</code></span>
        <span class="font-mono opacity-75">↑↓ ↵/Tab 选择 · Esc 关闭</span>
      </div>

      <div
        v-for="(item, idx) in state.suggestions"
        :key="`${item.source}:${item.key}`"
        :ref="el => setRowRef(el as HTMLElement | null, idx)"
        @mousedown.prevent="selectVariableAutocompleteItem(item)"
        @mouseenter="state.activeIndex = idx"
        class="flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition space-x-2"
        :class="idx === state.activeIndex ? 'bg-primary/20 text-foreground font-medium' : 'hover:bg-muted/60 text-foreground'"
      >
        <div class="flex items-center space-x-1.5 min-w-0">
          <span
            class="text-[10px] px-1.5 py-0.2 rounded font-mono border shrink-0"
            :class="sourceBadgeClass(item)"
          >
            <template v-if="item.source === 'system'">⚡ 动态</template>
            <template v-else-if="item.source === 'subproject'">子项目</template>
            <template v-else>{{ item.environmentName || '环境' }}</template>
          </span>
          <span class="font-mono truncate text-foreground">
            &#123;&#123;{{ item.key }}&#125;&#125;
          </span>
        </div>

        <span
          class="text-[11px] font-mono text-muted-foreground truncate max-w-[130px] shrink-0"
          :title="item.source === 'system' ? item.description : item.value"
        >
          {{ item.source === 'system' ? (item.description || '动态变量') : (item.value || '(空字符串)') }}
        </span>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useEscapeCancel } from '@/composables/useEscapeCancel'
import {
  closeVariableAutocomplete,
  getVariableAutocompleteState,
  handleVariableAutocompleteKeyDown,
  isVariableAutocompleteOpen,
  selectVariableAutocompleteItem
} from '@/composables/useVariableAutocomplete'
import type { VariableSuggestion } from '@/core/interpolation/suggestions'
import { ESCAPE_PRIORITY } from '@/core/shortcuts/escapeStack'

const state = getVariableAutocompleteState()
const isOpen = isVariableAutocompleteOpen

const popoverRef = ref<HTMLElement | null>(null)
const rowRefs = ref<Array<HTMLElement | null>>([])

function setRowRef(el: HTMLElement | null, idx: number) {
  rowRefs.value[idx] = el
}

watch(
  () => state.activeIndex,
  async idx => {
    await nextTick()
    rowRefs.value[idx]?.scrollIntoView({ block: 'nearest' })
  }
)

watch(
  () => state.suggestions,
  list => {
    rowRefs.value.length = list.length
  }
)

const popoverStyle = computed<Record<string, string>>(() => {
  if (typeof window === 'undefined') {
    return { top: '0px', left: '0px' }
  }
  const width = Math.min(340, window.innerWidth - 16)
  const estHeight = Math.min(240, state.suggestions.length * 32 + 36)
  const left = Math.max(
    8,
    Math.min(state.anchorRect.left, window.innerWidth - width - 8)
  )
  const spaceBelow = window.innerHeight - state.anchorRect.bottom
  let top = state.anchorRect.bottom + 4
  if (spaceBelow < estHeight + 12 && state.anchorRect.top > estHeight + 12) {
    top = state.anchorRect.top - estHeight - 4
  }
  top = Math.max(8, Math.min(top, window.innerHeight - estHeight - 8))

  return {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`
  }
})

function sourceBadgeClass(item: VariableSuggestion): string {
  if (item.source === 'system') {
    return 'bg-purple-500/10 text-purple-400 border-purple-500/20'
  }
  if (item.source === 'subproject') {
    return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
  }
  return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
}

useEscapeCancel(
  isOpen,
  () => {
    closeVariableAutocomplete()
  },
  { priority: ESCAPE_PRIORITY.OVERLAY }
)

function onCaptureKeyDown(e: KeyboardEvent) {
  if (!isOpen.value) return
  handleVariableAutocompleteKeyDown(e)
}

function onGlobalScroll(e: Event) {
  if (!isOpen.value) return
  const target = e.target as Node | null
  if (target && popoverRef.value?.contains(target)) {
    return
  }
  closeVariableAutocomplete()
}

function onWindowResize() {
  if (isOpen.value) {
    closeVariableAutocomplete()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onCaptureKeyDown, true)
  window.addEventListener('scroll', onGlobalScroll, true)
  window.addEventListener('resize', onWindowResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onCaptureKeyDown, true)
  window.removeEventListener('scroll', onGlobalScroll, true)
  window.removeEventListener('resize', onWindowResize)
})
</script>

