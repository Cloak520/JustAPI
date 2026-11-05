<template>
  <div class="flex flex-col h-full space-y-3">
    <!-- 响应头部状态栏 -->
    <div class="flex items-center justify-between border-b border-border pb-1 shrink-0 select-none">
      <!-- 左侧 Tabs (Body / Headers) -->
      <div class="flex items-center space-x-1 text-xs">
        <button
          @click="activeTab = 'body'"
          :class="activeTab === 'body' ? 'text-primary font-medium border-b-2 border-primary bg-muted/30' : 'text-muted-foreground hover:text-foreground'"
          class="px-3 py-1.5 rounded-t-md transition"
        >
          Body
        </button>
        <button
          @click="activeTab = 'headers'"
          :class="activeTab === 'headers' ? 'text-primary font-medium border-b-2 border-primary bg-muted/30' : 'text-muted-foreground hover:text-foreground'"
          class="px-3 py-1.5 rounded-t-md transition flex items-center space-x-1"
        >
          <span>Headers</span>
          <span v-if="headerCount > 0" class="text-[10px] px-1 py-0.2 rounded-full bg-muted font-mono">
            {{ headerCount }}
          </span>
        </button>
      </div>

      <!-- 右侧指标状态展示 (Status Code, Duration, Size) -->
      <div v-if="store.response" class="flex items-center space-x-3 text-xs">
        <!-- 状态码 -->
        <div class="flex items-center space-x-1 font-mono font-bold" :class="statusColorClass">
          <span>{{ store.response.status }}</span>
          <span class="text-[11px] font-normal font-sans">{{ store.response.statusText }}</span>
        </div>

        <div class="w-px h-3 bg-border"></div>

        <!-- 耗时 -->
        <div class="flex items-center space-x-1 text-muted-foreground font-mono text-[11px]">
          <Clock class="w-3.5 h-3.5 text-muted-foreground/70" />
          <span>{{ formatDuration(store.response.durationMs) }}</span>
        </div>

        <div class="w-px h-3 bg-border"></div>

        <!-- 体积 -->
        <div class="flex items-center space-x-1 text-muted-foreground font-mono text-[11px]">
          <HardDrive class="w-3.5 h-3.5 text-muted-foreground/70" />
          <span>{{ formatSize(store.response.sizeBytes) }}</span>
        </div>

        <!-- 复制与下载按钮 -->
        <div class="flex items-center space-x-1 pl-2">
          <button
            @click="copyBody"
            class="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition"
            title="复制响应内容到剪贴板"
          >
            <Check v-if="copied" class="w-3.5 h-3.5 text-emerald-400" />
            <Copy v-else class="w-3.5 h-3.5" />
          </button>
          <button
            @click="saveToFile"
            class="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition"
            title="另存为本地文件"
          >
            <Download class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- 响应主体区域 -->
    <div class="flex-1 overflow-hidden relative">
      <!-- 加载中遮罩 -->
      <div v-if="store.loading" class="absolute inset-0 flex flex-col items-center justify-center space-y-2 bg-background/50 backdrop-blur-sm z-10 select-none">
        <Loader2 class="w-6 h-6 text-primary animate-spin" />
        <span class="text-xs text-muted-foreground font-medium">正在请求目标服务器...</span>
      </div>

      <!-- 错误状态提示 -->
      <div v-else-if="store.errorMessage" class="h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
        <div class="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
          <AlertCircle class="w-5 h-5" />
        </div>
        <div class="space-y-1">
          <h4 class="text-xs font-semibold text-destructive">网络请求出错</h4>
          <p class="text-xs text-muted-foreground max-w-md font-mono">{{ store.errorMessage }}</p>
        </div>
      </div>

      <!-- 正常响应展示 -->
      <div v-else-if="store.response" class="h-full flex flex-col">
        <!-- 1. Body 视图 -->
        <div v-if="activeTab === 'body'" class="h-full flex flex-col space-y-2">
          <!-- 超大响应保护提示条 -->
          <div
            v-if="store.response.isTruncated"
            class="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center justify-between"
          >
            <div class="flex items-center space-x-2">
              <AlertTriangle class="w-4 h-4 shrink-0" />
              <span>响应体积超过 5MB（共 {{ formatSize(store.response.sizeBytes) }}），已自动截断仅渲染前 1MB 预览。</span>
            </div>
            <button
              @click="saveToFile"
              class="underline font-medium hover:text-amber-200 shrink-0 ml-2"
            >
              下载完整文件
            </button>
          </div>

          <div class="flex-1 min-h-[160px] h-full">
            <CodeEditor
              :model-value="displayBody"
              :read-only="true"
              :language="isJson ? 'json' : 'raw'"
            />
          </div>
        </div>

        <!-- 2. Headers 视图 -->
        <div v-else class="h-full overflow-y-auto">
          <div class="border border-border rounded-lg overflow-hidden bg-card/40 text-xs font-mono">
            <div class="grid grid-cols-[200px_1fr] bg-muted/40 border-b border-border font-medium text-muted-foreground px-3 py-1.5 select-none">
              <div>Header Name</div>
              <div>Value</div>
            </div>
            <div class="divide-y divide-border/60">
              <div
                v-for="(val, key) in store.response.headers"
                :key="key"
                class="grid grid-cols-[200px_1fr] px-3 py-1.5 hover:bg-muted/20 transition break-all"
              >
                <div class="text-muted-foreground font-semibold">{{ key }}</div>
                <div class="text-foreground">{{ val }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 无响应空白提示 -->
      <div v-else class="h-full flex flex-col items-center justify-center text-muted-foreground/50 space-y-2 select-none">
        <Send class="w-8 h-8 opacity-30" />
        <span class="text-xs">点击上方「Send」或按下 Cmd/Ctrl + Enter 发送请求</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Clock, HardDrive, Copy, Check, Download, AlertCircle, AlertTriangle, Loader2, Send } from 'lucide-vue-next'
import { useRequestStore } from '@/stores/requestStore'
import CodeEditor from '@/components/common/CodeEditor.vue'

const store = useRequestStore()
const activeTab = ref<'body' | 'headers'>('body')
const copied = ref(false)

const headerCount = computed(() => {
  return store.response ? Object.keys(store.response.headers).length : 0
})

const isJson = computed(() => {
  if (!store.response) return false
  const ct = store.response.headers['content-type'] || store.response.headers['Content-Type'] || ''
  return ct.includes('application/json') || store.response.body.trim().startsWith('{') || store.response.body.trim().startsWith('[')
})

const displayBody = computed(() => {
  return store.response?.body || ''
})

const statusColorClass = computed(() => {
  if (!store.response) return ''
  const s = store.response.status
  if (s >= 200 && s < 300) return 'text-emerald-400'
  if (s >= 300 && s < 400) return 'text-blue-400'
  if (s >= 400 && s < 500) return 'text-amber-400'
  return 'text-rose-400'
})

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

async function copyBody() {
  if (!store.response?.body) return
  await navigator.clipboard.writeText(store.response.body)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

function saveToFile() {
  if (!store.response?.body) return
  const blob = new Blob([store.response.body], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `response_${Date.now()}.${isJson.value ? 'json' : 'txt'}`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

