<template>
  <div v-if="sessionStore.response" class="h-full flex flex-col space-y-2 overflow-hidden">
    <div class="flex items-center justify-between text-xs py-0.5 px-0.5 shrink-0">
      <div class="relative flex-1 max-w-xs">
        <Search class="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          v-model="cookieSearchQuery"
          type="text"
          placeholder="过滤 Cookie (Name / Domain / Value)..."
          class="w-full pl-7 pr-3 py-1 rounded-lg bg-card border border-border text-foreground text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <button
        v-if="sessionStore.response.cookies && sessionStore.response.cookies.length > 0"
        @click="copyAllCookies"
        class="flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition border border-border/60"
        title="复制全部 Cookie 为 name=value 格式"
      >
        <Check v-if="copiedCookies" class="w-3 h-3 text-emerald-400" />
        <Copy v-else class="w-3 h-3" />
        <span>{{ copiedCookies ? '已复制全部' : '复制全部 Cookies' }}</span>
      </button>
    </div>

    <div class="flex-1 overflow-y-auto border border-border rounded-lg overflow-hidden bg-card/40 text-xs font-mono">
      <div class="grid grid-cols-[180px_160px_1fr_60px] bg-muted/40 border-b border-border font-medium text-muted-foreground px-3 py-1.5 select-none">
        <div>Cookie Name</div>
        <div>Domain / Path</div>
        <div>Value</div>
        <div class="text-right">Action</div>
      </div>
      <div class="divide-y divide-border/60">
        <div
          v-for="(c, idx) in filteredCookies"
          :key="idx"
          class="grid grid-cols-[180px_160px_1fr_60px] px-3 py-1.5 hover:bg-muted/20 transition group items-center"
        >
          <div class="text-muted-foreground font-semibold truncate pr-2" :title="c.name">{{ c.name }}</div>
          <div class="text-muted-foreground text-[11px] truncate pr-2">{{ c.domain || '*' }}{{ c.path || '' }}</div>
          <div class="text-foreground truncate pr-2 select-all" :title="c.raw">{{ c.value }}</div>
          <div class="text-right">
            <button
              @click="copyText(`${c.name}=${c.value}`, `c_${idx}`)"
              class="p-1 rounded hover:bg-muted text-muted-foreground/60 hover:text-foreground transition inline-flex items-center"
              :title="`复制 ${c.name}`"
            >
              <Check v-if="copiedMap[`c_${idx}`]" class="w-3 h-3 text-emerald-400" />
              <Copy v-else class="w-3 h-3 opacity-0 group-hover:opacity-100 transition" />
            </button>
          </div>
        </div>
        <div v-if="filteredCookies.length === 0" class="p-8 text-center text-xs text-muted-foreground font-sans">
          {{ cookieSearchQuery ? '未找到匹配的 Cookie' : '服务端未返回 Set-Cookie 响应头' }}
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
const cookieSearchQuery = ref('')
const copiedCookies = ref(false)
const copiedMap = ref<Record<string, boolean>>({})

const filteredCookies = computed(() => {
  const cookies = sessionStore.response?.cookies || []
  const q = cookieSearchQuery.value.trim().toLowerCase()
  if (!q) return cookies
  return cookies.filter(
    c =>
      c.name.toLowerCase().includes(q) ||
      c.value.toLowerCase().includes(q) ||
      (c.domain && c.domain.toLowerCase().includes(q))
  )
})

async function copyText(text: string, id: string) {
  if (!text) return
  await navigator.clipboard.writeText(text)
  copiedMap.value[id] = true
  setTimeout(() => {
    copiedMap.value[id] = false
  }, 1800)
}

async function copyAllCookies() {
  const cookies = sessionStore.response?.cookies || []
  if (cookies.length === 0) return
  const text = cookies.map(c => `${c.name}=${c.value}`).join('; ')
  await navigator.clipboard.writeText(text)
  copiedCookies.value = true
  setTimeout(() => (copiedCookies.value = false), 1800)
}
</script>

