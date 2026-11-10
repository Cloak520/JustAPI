<template>
  <div class="flex flex-col space-y-2 h-full flex-1 min-h-0">
    <div class="flex items-center justify-between text-xs shrink-0">
      <span class="text-muted-foreground text-[11px]">
        文本模式：每行一个键值对，格式为 <code class="text-primary font-mono">{{ format === 'colon' ? 'Header-Key: Value' : 'key=value' }}</code>
      </span>
      <span class="text-muted-foreground/60 text-[10px]">实时双向同步</span>
    </div>

    <textarea
      ref="textareaRef"
      v-model="rawText"
      rows="8"
      :placeholder="placeholderText"
      class="w-full flex-1 min-h-0 font-mono text-xs p-3 rounded-lg bg-card/60 border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/40 leading-relaxed resize-none"
      @input="syncToItems"
    ></textarea>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useVariableInput } from '@/composables/useVariableAutocomplete'
import type { KeyValuePair } from '@/types'
import { parseBulkTextToPairs, formatPairsToBulkText } from '@/utils/parser'

const props = withDefaults(defineProps<{
  items: KeyValuePair[]
  format?: 'colon' | 'equal'
  subProjectDir?: string | null
}>(), {
  format: 'colon',
  subProjectDir: undefined
})

const emit = defineEmits<{
  (e: 'update:items', val: KeyValuePair[]): void
}>()

const rawText = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

useVariableInput(textareaRef, {
  subProjectDir: () => props.subProjectDir,
  onApplied: nextVal => {
    rawText.value = nextVal
    syncToItems()
  }
})

const placeholderText = computed(() => {
  return props.format === 'colon'
    ? 'Authorization: Bearer token_xxx\nContent-Type: application/json\nX-Custom-Header: value'
    : 'page=1\nsize=20\nkeyword=search_term'
})

// 初始化与从外部更新时同步到 textarea
watch(() => props.items, (newItems) => {
  const currentFormatted = formatPairsToBulkText(newItems, props.format)
  // 避免输入时的死循环光标跳动
  if (currentFormatted !== rawText.value.trim()) {
    rawText.value = currentFormatted
  }
}, { immediate: true, deep: true })

function syncToItems() {
  const parsed = parseBulkTextToPairs(rawText.value)
  // 如果空，保持至少一个空行
  if (parsed.length === 0) {
    parsed.push({
      id: crypto.randomUUID(),
      key: '',
      value: '',
      enabled: true
    })
  }
  emit('update:items', parsed)
}
</script>

