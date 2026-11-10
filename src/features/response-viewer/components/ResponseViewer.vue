<template>
  <div class="flex flex-col h-full space-y-2.5">
    <!-- 响应头部状态栏 -->
    <div class="flex items-center justify-between border-b border-border pb-1 shrink-0 select-none">
      <!-- 左侧 Tabs（基于 responseTabRegistry 动态渲染） -->
      <div class="flex items-center space-x-1 text-xs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTabId = tab.id"
          :class="activeTabId === tab.id ? 'text-primary font-medium border-b-2 border-primary bg-muted/30' : 'text-muted-foreground hover:text-foreground'"
          class="px-3 py-1.5 rounded-t-md transition flex items-center space-x-1.5"
        >
          <span>{{ tab.label }}</span>
          <span
            v-if="tab.badgeTextVal"
            class="text-[10px] px-1.5 py-0.2 rounded font-mono font-normal uppercase"
            :class="tab.badgeClassVal || 'bg-muted text-muted-foreground'"
          >
            {{ tab.badgeTextVal }}
          </span>
          <span
            v-else-if="tab.badgeCountVal > 0"
            class="text-[10px] px-1 py-0.2 rounded-full font-mono"
            :class="tab.badgeClassVal || 'bg-muted'"
          >
            {{ tab.badgeCountVal }}
          </span>
        </button>
      </div>

      <!-- 右侧指标与动作按钮 -->
      <div v-if="sessionStore.response" class="flex items-center space-x-2.5 text-xs">
        <div
          class="flex items-center space-x-1 font-mono font-bold px-2 py-0.5 rounded border shadow-sm transition"
          :class="statusBadgeClass"
          :title="`HTTP 响应码: ${sessionStore.response.status} ${sessionStore.response.statusText}`"
        >
          <span>{{ sessionStore.response.status }}</span>
          <span v-if="sessionStore.response.statusText" class="text-[11px] font-normal font-sans">
            {{ sessionStore.response.statusText }}
          </span>
        </div>

        <div class="w-px h-3 bg-border"></div>

        <div
          class="flex items-center space-x-1 font-mono text-[11px] transition"
          :class="durationColorClass"
          :title="`实际请求耗时: ${sessionStore.response.durationMs}ms${responseTimeStr ? ` (完成于 ${responseTimeStr})` : ''}`"
        >
          <Clock class="w-3.5 h-3.5 opacity-80" />
          <span>{{ formatDuration(sessionStore.response.durationMs) }}</span>
        </div>

        <div class="w-px h-3 bg-border"></div>

        <div
          class="flex items-center space-x-1 text-muted-foreground font-mono text-[11px]"
          :title="`响应体积: ${sessionStore.response.sizeBytes} 字节`"
        >
          <HardDrive class="w-3.5 h-3.5 text-muted-foreground/70" />
          <span>{{ formatSize(sessionStore.response.sizeBytes) }}</span>
        </div>

        <div class="flex items-center space-x-0.5 pl-1.5 border-l border-border/60">
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
            :disabled="saving"
            class="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition"
            :title="saved ? `已成功另存为: ${saveSuccessPath}` : '另存为本地文件'"
          >
            <Loader2 v-if="saving" class="w-3.5 h-3.5 text-primary animate-spin" />
            <Check v-else-if="saved" class="w-3.5 h-3.5 text-emerald-400" />
            <Download v-else class="w-3.5 h-3.5" />
          </button>
          <button
            @click="sessionStore.clearActiveResponse()"
            class="p-1 text-muted-foreground hover:text-rose-400 rounded hover:bg-rose-500/10 transition"
            title="清空响应面板"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- 响应主体区 -->
    <div class="flex-1 overflow-hidden relative flex flex-col">
      <div
        v-if="sessionStore.loading"
        class="absolute inset-0 flex flex-col items-center justify-center space-y-2 bg-background/50 backdrop-blur-sm z-10 select-none"
      >
        <Loader2 class="w-6 h-6 text-primary animate-spin" />
        <span class="text-xs text-muted-foreground font-medium">正在请求目标服务器...</span>
      </div>

      <div
        v-else-if="sessionStore.errorMessage"
        class="h-full flex flex-col items-center justify-center p-6 text-center space-y-3"
      >
        <div class="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
          <AlertCircle class="w-5 h-5" />
        </div>
        <div class="space-y-1">
          <h4 class="text-xs font-semibold text-destructive">网络请求出错</h4>
          <p class="text-xs text-muted-foreground max-w-md font-mono select-all">{{ sessionStore.errorMessage }}</p>
        </div>
      </div>

      <div v-else-if="sessionStore.response" class="h-full flex flex-col overflow-hidden">
        <component :is="activeTabComponent" v-if="activeTabComponent" />
      </div>

      <div v-else class="h-full flex flex-col items-center justify-center text-muted-foreground/50 space-y-2 select-none">
        <Send class="w-8 h-8 opacity-30" />
        <span class="text-xs">点击上方「Send」或按下 Cmd/Ctrl + Enter 发送请求</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  AlertCircle,
  Check,
  Clock,
  Copy,
  Download,
  HardDrive,
  Loader2,
  Send,
  Trash2
} from 'lucide-vue-next'
import { responseTabRegistry } from '@/core/registries/extensionRegistry'
import * as transportService from '@/services/transportService'
import { useAppStore } from '@/stores/appStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useResponseViewState } from '../composables/useResponseViewState'

const sessionStore = useSessionStore()
const appStore = useAppStore()
const {
  bodyViewMode,
  contentType,
  isJson,
  isHtml,
  displayBody
} = useResponseViewState()

const registeredTabs = computed(() => responseTabRegistry.list())
const activeTabId = ref<string>('body')

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
    badgeTextVal: t.badgeText
      ? t.badgeText(sessionStore.response, sessionStore.lastExecutionContext)
      : undefined,
    badgeCountVal: t.badgeCount
      ? t.badgeCount(sessionStore.response, sessionStore.lastExecutionContext)
      : 0,
    badgeClassVal: t.badgeClass
      ? t.badgeClass(sessionStore.response, sessionStore.lastExecutionContext)
      : undefined
  }))
)

const activeTabComponent = computed(() => {
  return responseTabRegistry.get(activeTabId.value)?.component ?? null
})

const copied = ref(false)
const saving = ref(false)
const saved = ref(false)
const saveSuccessPath = ref('')

const statusBadgeClass = computed(() => {
  const s = sessionStore.response?.status ?? 0
  if (s >= 200 && s < 300) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
  if (s >= 300 && s < 400) return 'text-blue-400 bg-blue-500/10 border-blue-500/30'
  if (s >= 400 && s < 500) return 'text-amber-400 bg-amber-500/10 border-amber-500/30'
  return 'text-rose-400 bg-rose-500/10 border-rose-500/30'
})

const durationColorClass = computed(() => {
  const ms = sessionStore.response?.durationMs ?? 0
  if (ms < 300) return 'text-emerald-400'
  if (ms < 1000) return 'text-sky-400'
  if (ms < 3000) return 'text-amber-400'
  return 'text-rose-400'
})

const responseTimeStr = computed(() => {
  if (!sessionStore.response?.timestamp) return ''
  try {
    return new Date(sessionStore.response.timestamp).toLocaleTimeString()
  } catch {
    return ''
  }
})

function formatDuration(ms?: number) {
  if (ms == null || isNaN(ms)) return '0 ms'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function formatSize(bytes?: number) {
  if (bytes == null || isNaN(bytes)) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

async function copyBody() {
  const res = sessionStore.response
  if (!res) return
  const text = displayBody.value || res.body || res.bodyBase64 || ''
  if (!text) return
  await navigator.clipboard.writeText(text)
  copied.value = true
  setTimeout(() => (copied.value = false), 1800)
}

async function saveToFile() {
  const res = sessionStore.response
  if (!res) {
    appStore.showToast('暂无响应内容可保存', true)
    return
  }
  if (saving.value) return

  let ext = 'txt'
  if (isJson.value) ext = 'json'
  else if (isHtml.value) ext = 'html'
  else if (contentType.value.includes('xml')) ext = 'xml'
  else if (contentType.value.includes('javascript')) ext = 'js'
  else if (contentType.value.includes('css')) ext = 'css'
  else if (contentType.value.includes('image/png')) ext = 'png'
  else if (contentType.value.includes('image/jpeg')) ext = 'jpg'
  else if (contentType.value.includes('image/gif')) ext = 'gif'
  else if (contentType.value.includes('image/webp')) ext = 'webp'
  else if (contentType.value.includes('image/bmp')) ext = 'bmp'
  else if (contentType.value.includes('image/x-icon') || contentType.value.includes('vnd.microsoft.icon')) ext = 'ico'
  else if (contentType.value.includes('image/svg')) ext = 'svg'
  else if (contentType.value.includes('application/pdf')) ext = 'pdf'

  let baseName = 'response'
  try {
    const urlObj = new URL(sessionStore.resolvedUrl)
    const segments = urlObj.pathname.split('/').filter(Boolean)
    if (segments.length > 0) {
      const last = segments[segments.length - 1]
      baseName = last.includes('.') ? last : last.replace(/[^a-zA-Z0-9_-]/g, '_')
    }
  } catch {
    // ignore URL parse errors
  }

  let defaultFilename = ''
  if (baseName.includes('.')) {
    defaultFilename = baseName
  } else {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const timeStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    defaultFilename = `${baseName}_${timeStr}.${ext}`
  }

  const isPrettyJson = isJson.value && bodyViewMode.value === 'pretty'
  const contentToSave = isPrettyJson ? displayBody.value || res.body : res.body
  const useRawBytes = !isPrettyJson

  try {
    saving.value = true
    const savedPath = await transportService.saveResponseToFile({
      defaultFilename,
      content: contentToSave,
      useRawBytes,
      requestId: res.requestId
    })

    if (savedPath) {
      saved.value = true
      saveSuccessPath.value = savedPath
      setTimeout(() => {
        saved.value = false
        saveSuccessPath.value = ''
      }, 2500)
    }
  } catch (err: any) {
    appStore.showToast(`保存文件失败: ${err?.message || err}`, true)
  } finally {
    saving.value = false
  }
}
</script>

