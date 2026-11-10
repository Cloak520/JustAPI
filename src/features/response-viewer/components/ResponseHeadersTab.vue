<template>
  <div v-if="sessionStore.response" class="h-full flex flex-col space-y-2 overflow-hidden">
    <div class="flex items-center justify-between text-xs py-0.5 px-0.5 shrink-0">
      <div class="relative flex-1 max-w-xs">
        <Search class="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          v-model="headerSearchQuery"
          type="text"
          placeholder="过滤响应头 (Header Name / Value)..."
          class="w-full pl-7 pr-3 py-1 rounded-lg bg-card border border-border text-foreground text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <button
        @click="copyAllHeaders"
        class="flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition border border-border/60"
        title="复制全部响应头为 Key: Value 格式"
      >
        <Check v-if="copiedHeaders" class="w-3 h-3 text-emerald-400" />
        <Copy v-else class="w-3 h-3" />
        <span>{{ copiedHeaders ? '已复制全部' : '复制全部 Headers' }}</span>
      </button>
    </div>

    <div class="flex-1 overflow-y-auto border border-border rounded-lg overflow-hidden bg-card/40 text-xs font-mono">
      <div class="grid grid-cols-[220px_1fr_60px] bg-muted/40 border-b border-border font-medium text-muted-foreground px-3 py-1.5 select-none">
        <div>Header Name</div>
        <div>Value</div>
        <div class="text-right">Action</div>
      </div>
      <div class="divide-y divide-border/60">
        <div
          v-for="(val, key) in filteredHeaders"
          :key="key"
          class="grid grid-cols-[220px_1fr_60px] px-3 py-1.5 hover:bg-muted/20 transition group items-center"
        >
          <div class="text-muted-foreground font-semibold truncate pr-2" :title="String(key)">{{ key }}</div>
          <div class="text-foreground break-all pr-2 select-all">{{ val }}</div>
          <div class="text-right">
            <button
              @click="copyText(`${key}: ${val}`, `h_${key}`)"
              class="p-1 rounded hover:bg-muted text-muted-foreground/60 hover:text-foreground transition inline-flex items-center"
              :title="`复制 ${key}`"
            >
              <Check v-if="copiedMap[`h_${key}`]" class="w-3 h-3 text-emerald-400" />
              <Copy v-else class="w-3 h-3 opacity-0 group-hover:opacity-100 transition" />
            </button>
          </div>
        </div>
        <div v-if="Object.keys(filteredHeaders).length === 0" class="p-8 text-center text-xs text-muted-foreground font-sans">
          {{ headerSearchQuery ? '未找到匹配的响应头' : '暂无响应头数据' }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Copy, Search } from 'lucide-vue-next'
import { useSessionStore } from '@/stores/sessionStore'

const sessionStore = useSessionStore()
const headerSearchQuery = ref('')
const copiedHeaders = ref(false)
const copiedMap = ref<Record<string, boolean>>({})

const filteredHeaders = computed(() => {
  const headers = sessionStore.response?.headers
  if (!headers) return {}
  const q = headerSearchQuery.value.trim().toLowerCase()
  if (!q) return headers
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q)) {
      result[k] = v
    }
  }
  return result
})

async function copyText(text: string, id: string) {
  if (!text) return
  await navigator.clipboard.writeText(text)
  copiedMap.value[id] = true
  setTimeout(() => {
    copiedMap.value[id] = false
  }, 1800)
}

async function copyAllHeaders() {
  const headers = sessionStore.response?.headers
  if (!headers) return
  const text = Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
  await navigator.clipboard.writeText(text)
  copiedHeaders.value = true
  setTimeout(() => (copiedHeaders.value = false), 1800)
}
</script>

