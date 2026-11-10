<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
  >
    <div class="flex flex-col w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
      <div class="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/40 shrink-0">
        <div class="flex items-center space-x-2">
          <div class="w-6 h-6 rounded-md bg-primary/20 text-primary flex items-center justify-center">
            <Terminal class="w-3.5 h-3.5" />
          </div>
          <h3 class="font-semibold text-sm">导入请求</h3>
        </div>
        <button
          @click="close"
          class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="p-5 space-y-3 text-xs">
        <div v-if="importers.length > 1" class="space-y-1">
          <label class="text-muted-foreground font-medium block">解析格式</label>
          <select
            v-model="selectedImporterId"
            class="w-full px-3 py-1.5 rounded-lg bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
          >
            <option value="auto">自动识别 ({{ detectedImporter?.label || '未匹配' }})</option>
            <option v-for="imp in importers" :key="imp.id" :value="imp.id">
              {{ imp.label }}
            </option>
          </select>
        </div>

        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <label class="text-foreground font-medium">
              {{ activeImporter?.description || '粘贴命令或请求文本' }}
            </label>
            <span
              v-if="activeImporter"
              class="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono"
            >
              {{ activeImporter.label }}
            </span>
          </div>

          <textarea
            ref="textareaRef"
            v-model="rawInput"
            rows="8"
            :placeholder="activeImporter?.placeholder || importers[0]?.placeholder || defaultPlaceholder"
            class="w-full p-3 font-mono text-[11px] leading-relaxed rounded-lg bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary resize-y text-foreground"
            @keydown.meta.enter.prevent="confirmImport"
            @keydown.ctrl.enter.prevent="confirmImport"
          />
        </div>

        <div
          v-if="parseError"
          class="p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-[11px]"
        >
          {{ parseError }}
        </div>
      </div>

      <div class="flex items-center justify-end space-x-2 px-5 py-3 border-t border-border bg-muted/40 shrink-0">
        <button
          @click="close"
          class="px-3.5 py-1.5 rounded-lg border border-border hover:bg-muted text-xs transition"
        >
          取消
        </button>
        <button
          @click="confirmImport"
          :disabled="!rawInput.trim() || importers.length === 0"
          class="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-xs transition shadow-sm disabled:opacity-50"
        >
          <Check class="w-3.5 h-3.5" />
          <span>导入并打开</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Check, Terminal, X } from 'lucide-vue-next'
import { useEscapeCancel } from '@/composables/useEscapeCancel'
import { requestImporterRegistry } from '@/core/registries/extensionRegistry'
import { useAppStore } from '@/stores/appStore'
import { useSessionStore } from '@/stores/sessionStore'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
}>()

const sessionStore = useSessionStore()
const appStore = useAppStore()

const rawInput = ref('')
const defaultPlaceholder = 'curl https://api.example.com/v1/users -H "Authorization: Bearer ..."'
const selectedImporterId = ref<string>('auto')
const parseError = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const importers = computed(() => requestImporterRegistry.list())

const detectedImporter = computed(() => {
  const txt = rawInput.value.trim()
  if (!txt) return importers.value[0] ?? null
  return importers.value.find(i => i.supports(txt)) ?? null
})

const activeImporter = computed(() => {
  if (selectedImporterId.value === 'auto') {
    return detectedImporter.value
  }
  return importers.value.find(i => i.id === selectedImporterId.value) ?? detectedImporter.value
})

watch(
  () => props.modelValue,
  open => {
    if (open) {
      parseError.value = ''
      nextTick(() => textareaRef.value?.focus())
    }
  }
)

function close() {
  emit('update:modelValue', false)
}

useEscapeCancel(() => props.modelValue, close)

function confirmImport() {
  const txt = rawInput.value.trim()
  if (!txt) return
  parseError.value = ''

  const importer = activeImporter.value || importers.value[0]
  if (!importer) {
    parseError.value = '当前没有可用的请求导入扩展'
    return
  }

  try {
    const parsed = importer.parse(txt)
    sessionStore.importParsedRequest(parsed)
    appStore.showToast(`已通过 ${importer.label} 导入请求: ${parsed.method} ${parsed.path}`)
    rawInput.value = ''
    close()
  } catch (err: any) {
    parseError.value = err?.message || String(err)
  }
}
</script>
