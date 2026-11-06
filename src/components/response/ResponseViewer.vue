<template>
  <div class="flex flex-col h-full space-y-2.5">
    <!-- 响应头部状态栏 -->
    <div class="flex items-center justify-between border-b border-border pb-1 shrink-0 select-none">
      <!-- 左侧 Tabs (Body / Headers / Cookies) -->
      <div class="flex items-center space-x-1 text-xs">
        <button
          @click="activeTab = 'body'"
          :class="activeTab === 'body' ? 'text-primary font-medium border-b-2 border-primary bg-muted/30' : 'text-muted-foreground hover:text-foreground'"
          class="px-3 py-1.5 rounded-t-md transition flex items-center space-x-1.5"
        >
          <span>Body</span>
          <span v-if="contentTypeTag" class="text-[10px] px-1.5 py-0.2 rounded font-mono font-normal uppercase" :class="contentTypeBadgeClass">
            {{ contentTypeTag }}
          </span>
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
        <button
          @click="activeTab = 'cookies'"
          :class="activeTab === 'cookies' ? 'text-primary font-medium border-b-2 border-primary bg-muted/30' : 'text-muted-foreground hover:text-foreground'"
          class="px-3 py-1.5 rounded-t-md transition flex items-center space-x-1"
        >
          <span>Cookies</span>
          <span v-if="cookieCount > 0" class="text-[10px] px-1 py-0.2 rounded-full bg-muted font-mono">
            {{ cookieCount }}
          </span>
        </button>
      </div>

      <!-- 右侧指标状态展示 (Status Code, Duration, Size, Time, Actions) -->
      <div v-if="store.response" class="flex items-center space-x-2.5 text-xs">
        <!-- 状态码与状态描述 -->
        <div
          class="flex items-center space-x-1 font-mono font-bold px-2 py-0.5 rounded border shadow-sm transition"
          :class="statusBadgeClass"
          :title="`HTTP 响应码: ${store.response.status} ${store.response.statusText}`"
        >
          <span>{{ store.response.status }}</span>
          <span v-if="store.response.statusText" class="text-[11px] font-normal font-sans">{{ store.response.statusText }}</span>
        </div>

        <div class="w-px h-3 bg-border"></div>

        <!-- 耗时 -->
        <div
          class="flex items-center space-x-1 font-mono text-[11px] transition"
          :class="durationColorClass"
          :title="`实际请求耗时: ${store.response.durationMs}ms${responseTimeStr ? ` (完成于 ${responseTimeStr})` : ''}`"
        >
          <Clock class="w-3.5 h-3.5 opacity-80" />
          <span>{{ formatDuration(store.response.durationMs) }}</span>
        </div>

        <div class="w-px h-3 bg-border"></div>

        <!-- 体积 -->
        <div
          class="flex items-center space-x-1 text-muted-foreground font-mono text-[11px]"
          :title="`响应体积: ${store.response.sizeBytes} 字节`"
        >
          <HardDrive class="w-3.5 h-3.5 text-muted-foreground/70" />
          <span>{{ formatSize(store.response.sizeBytes) }}</span>
        </div>

        <!-- 快捷操作按钮: 复制、下载、清空 -->
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
            @click="store.clearResponse"
            class="p-1 text-muted-foreground hover:text-rose-400 rounded hover:bg-rose-500/10 transition"
            title="清空响应面板"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- 响应主体区域 -->
    <div class="flex-1 overflow-hidden relative flex flex-col">
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
          <p class="text-xs text-muted-foreground max-w-md font-mono select-all">{{ store.errorMessage }}</p>
        </div>
      </div>

      <!-- 正常响应展示 -->
      <div v-else-if="store.response" class="h-full flex flex-col overflow-hidden space-y-2">
        <!-- 1. Body 视图 -->
        <div v-if="activeTab === 'body'" class="h-full flex flex-col space-y-2 overflow-hidden">
          <!-- Body 子工具栏: Pretty / Raw / Preview 切换 + 自动换行 + 搜索 -->
          <div class="flex items-center justify-between text-xs py-0.5 px-0.5 shrink-0">
            <!-- 视图模式切换 -->
            <div class="flex items-center space-x-1 bg-muted/40 p-0.5 rounded-lg border border-border">
              <button
                @click="bodyViewMode = 'pretty'"
                :class="bodyViewMode === 'pretty' ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'"
                class="px-2.5 py-1 rounded text-[11px] transition flex items-center space-x-1"
              >
                <Code2 class="w-3 h-3" />
                <span>Pretty</span>
              </button>
              <button
                @click="bodyViewMode = 'raw'"
                :class="bodyViewMode === 'raw' ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'"
                class="px-2.5 py-1 rounded text-[11px] transition flex items-center space-x-1"
              >
                <FileText class="w-3 h-3" />
                <span>Raw</span>
              </button>
              <button
                v-if="isHtml || isImage"
                @click="bodyViewMode = 'preview'"
                :class="bodyViewMode === 'preview' ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'"
                class="px-2.5 py-1 rounded text-[11px] transition flex items-center space-x-1"
              >
                <Eye class="w-3 h-3" />
                <span>Preview</span>
              </button>
            </div>

            <!-- 右侧辅助工具: JSON 压缩/美化、换行开关、查找 -->
            <div class="flex items-center space-x-1.5">
              <!-- 快速美化 / 压缩 (仅当 JSON 模式且处于 pretty 视图时有效) -->
              <button
                v-if="isJson && bodyViewMode === 'pretty'"
                @click="toggleJsonIndent"
                class="flex items-center space-x-1 px-2 py-1 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition border border-border/60"
                :title="isMinified ? '点击展开为缩进 JSON' : '点击压缩为单行 JSON'"
              >
                <Sparkles class="w-3 h-3 text-amber-400" />
                <span>{{ isMinified ? '展开缩进' : '压缩单行' }}</span>
              </button>

              <!-- 自动换行开关 -->
              <button
                @click="lineWrapping = !lineWrapping"
                class="flex items-center space-x-1 px-2 py-1 rounded text-[11px] transition border"
                :class="lineWrapping ? 'bg-primary/10 text-primary border-primary/30 font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 border-border/60'"
                :title="lineWrapping ? '已开启自动换行 (点击关闭)' : '点击开启自动换行'"
              >
                <WrapText class="w-3 h-3" />
                <span>换行</span>
              </button>

              <!-- 搜索面板触发器 -->
              <button
                @click="showSearchBar = !showSearchBar"
                class="flex items-center space-x-1 px-2 py-1 rounded text-[11px] transition border"
                :class="showSearchBar ? 'bg-primary/10 text-primary border-primary/30 font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 border-border/60'"
                title="在响应内容中查找"
              >
                <Search class="w-3 h-3" />
                <span>查找</span>
              </button>
            </div>
          </div>

          <!-- 查找条 (展开条) -->
          <div
            v-if="showSearchBar"
            class="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg bg-card border border-border text-xs animate-in fade-in shrink-0"
          >
            <Search class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              v-model="bodySearchQuery"
              type="text"
              placeholder="在响应内容中查找关键字..."
              class="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/60 focus:outline-none font-mono text-[11px]"
              @keydown.esc="showSearchBar = false"
            />
            <span v-if="bodySearchQuery" class="text-[10px] text-muted-foreground font-mono shrink-0">
              {{ bodySearchMatchesCount > 0 ? `匹配 ${bodySearchMatchesCount} 处` : '未找到匹配项' }}
            </span>
            <button
              @click="showSearchBar = false; bodySearchQuery = ''"
              class="p-0.5 text-muted-foreground hover:text-foreground rounded"
            >
              <X class="w-3 h-3" />
            </button>
          </div>


          <!-- 主内容区域 (编辑器 / HTML 预览 / 图片预览) -->
          <div class="flex-1 min-h-[160px] h-full overflow-hidden">
            <!-- HTML 预览 -->
            <iframe
              v-if="bodyViewMode === 'preview' && isHtml"
              :srcdoc="store.response.body"
              sandbox="allow-same-origin"
              class="w-full h-full bg-white rounded-lg border border-border"
            />

            <!-- 图片预览 -->
            <div
              v-else-if="bodyViewMode === 'preview' && isImage"
              class="w-full h-full flex flex-col items-center justify-center bg-card/60 border border-border rounded-lg p-4 space-y-2"
            >
              <img
                :src="imageSrc"
                alt="Response Image"
                class="max-w-full max-h-[80%] object-contain rounded shadow"
              />
              <span class="text-[11px] text-muted-foreground font-mono">{{ contentTypeTag || 'Image' }} ({{ formatSize(store.response.sizeBytes) }})</span>
            </div>

            <!-- 代码编辑器展示 (Pretty 或 Raw) -->
            <CodeEditor
              v-else
              :model-value="displayBody"
              :read-only="true"
              :language="editorLanguage"
              :line-wrapping="lineWrapping"
            />
          </div>
        </div>

        <!-- 2. Headers 视图 -->
        <div v-else-if="activeTab === 'headers'" class="h-full flex flex-col space-y-2 overflow-hidden">
          <!-- 搜索过滤条与快捷复制全部 -->
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
                <div class="text-muted-foreground font-semibold truncate pr-2" :title="key">{{ key }}</div>
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

        <!-- 3. Cookies 视图 -->
        <div v-else class="h-full flex flex-col space-y-2 overflow-hidden">
          <!-- 搜索过滤条与快捷复制全部 -->
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
              v-if="store.response.cookies && store.response.cookies.length > 0"
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
import { invoke } from '@tauri-apps/api/core'
import {
  Clock,
  HardDrive,
  Copy,
  Check,
  Download,
  AlertCircle,
  Loader2,
  Send,
  Trash2,
  Search,
  WrapText,
  Eye,
  Code2,
  FileText,
  Sparkles,
  X
} from 'lucide-vue-next'
import { useRequestStore } from '@/stores/requestStore'
import CodeEditor from '@/components/common/CodeEditor.vue'

const store = useRequestStore()
const activeTab = ref<'body' | 'headers' | 'cookies'>('body')
const bodyViewMode = ref<'pretty' | 'raw' | 'preview'>('pretty')
const lineWrapping = ref(false)
const isMinified = ref(false)
const showSearchBar = ref(false)
const bodySearchQuery = ref('')
const headerSearchQuery = ref('')
const cookieSearchQuery = ref('')

const copied = ref(false)
const copiedHeaders = ref(false)
const copiedCookies = ref(false)
const copiedMap = ref<Record<string, boolean>>({})

const saving = ref(false)
const saved = ref(false)
const saveSuccessPath = ref('')

const headerCount = computed(() => {
  return store.response?.headers ? Object.keys(store.response.headers).length : 0
})

const cookieCount = computed(() => {
  return store.response?.cookies ? store.response.cookies.length : 0
})

const contentType = computed(() => {
  if (!store.response) return ''
  return (store.response.contentType || store.response.headers['content-type'] || store.response.headers['Content-Type'] || '').toLowerCase()
})

const isJson = computed(() => {
  if (!store.response) return false
  const ct = contentType.value
  const body = (store.response.body || '').trim()
  return ct.includes('application/json') || body.startsWith('{') || body.startsWith('[')
})

const isHtml = computed(() => {
  return contentType.value.includes('text/html') || contentType.value.includes('application/xhtml+xml')
})

const isImage = computed(() => {
  return contentType.value.includes('image/')
})

const contentTypeTag = computed(() => {
  if (!store.response) return ''
  if (isJson.value) return 'JSON'
  if (isHtml.value) return 'HTML'
  if (contentType.value.includes('xml')) return 'XML'
  if (isImage.value) return 'IMG'
  if (contentType.value.includes('text/plain')) return 'TXT'
  return contentType.value.split(';')[0].split('/')[1]?.toUpperCase() || ''
})

const contentTypeBadgeClass = computed(() => {
  if (isJson.value) return 'bg-emerald-500/10 text-emerald-400'
  if (isHtml.value) return 'bg-blue-500/10 text-blue-400'
  if (isImage.value) return 'bg-purple-500/10 text-purple-400'
  return 'bg-muted text-muted-foreground'
})

const displayBody = computed(() => {
  const raw = store.response?.body || ''
  if (!raw) return ''
  if (bodyViewMode.value === 'raw') return raw
  if (isJson.value) {
    try {
      const parsed = JSON.parse(raw)
      return isMinified.value ? JSON.stringify(parsed) : JSON.stringify(parsed, null, 2)
    } catch {
      return raw
    }
  }
  return raw
})

const editorLanguage = computed(() => {
  return isJson.value && bodyViewMode.value === 'pretty' ? 'json' : 'raw'
})

function toggleJsonIndent() {
  isMinified.value = !isMinified.value
}

const imageSrc = computed(() => {
  if (!store.response?.body) return ''
  const b = store.response.body
  if (b.startsWith('data:image')) return b
  const ct = contentType.value || 'image/png'
  return `data:${ct};base64,${b}`
})

const statusBadgeClass = computed(() => {
  if (!store.response) return ''
  const s = store.response.status
  if (s >= 200 && s < 300) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
  if (s >= 300 && s < 400) return 'text-blue-400 bg-blue-500/10 border-blue-500/30'
  if (s >= 400 && s < 500) return 'text-amber-400 bg-amber-500/10 border-amber-500/30'
  return 'text-rose-400 bg-rose-500/10 border-rose-500/30'
})

const durationColorClass = computed(() => {
  const ms = store.response?.durationMs ?? 0
  if (ms < 300) return 'text-emerald-400'
  if (ms < 1000) return 'text-sky-400'
  if (ms < 3000) return 'text-amber-400'
  return 'text-rose-400'
})

const responseTimeStr = computed(() => {
  if (!store.response?.timestamp) return ''
  try {
    const d = new Date(store.response.timestamp)
    return d.toLocaleTimeString()
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

const bodySearchMatchesCount = computed(() => {
  const q = bodySearchQuery.value.trim().toLowerCase()
  if (!q || !store.response?.body) return 0
  try {
    const text = store.response.body.toLowerCase()
    let count = 0
    let pos = text.indexOf(q)
    while (pos !== -1) {
      count++
      pos = text.indexOf(q, pos + q.length)
      if (count > 999) break
    }
    return count
  } catch {
    return 0
  }
})

const filteredHeaders = computed(() => {
  if (!store.response?.headers) return {}
  const q = headerSearchQuery.value.trim().toLowerCase()
  if (!q) return store.response.headers
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(store.response.headers)) {
    if (k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q)) {
      result[k] = v
    }
  }
  return result
})

const filteredCookies = computed(() => {
  const cookies = store.response?.cookies || []
  const q = cookieSearchQuery.value.trim().toLowerCase()
  if (!q) return cookies
  return cookies.filter(c =>
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

async function copyAllHeaders() {
  if (!store.response?.headers) return
  const text = Object.entries(store.response.headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
  await navigator.clipboard.writeText(text)
  copiedHeaders.value = true
  setTimeout(() => (copiedHeaders.value = false), 1800)
}

async function copyAllCookies() {
  const cookies = store.response?.cookies || []
  if (cookies.length === 0) return
  const text = cookies.map(c => `${c.name}=${c.value}`).join('; ')
  await navigator.clipboard.writeText(text)
  copiedCookies.value = true
  setTimeout(() => (copiedCookies.value = false), 1800)
}

async function copyBody() {
  if (!store.response?.body) return
  await navigator.clipboard.writeText(displayBody.value || store.response.body)
  copied.value = true
  setTimeout(() => (copied.value = false), 1800)
}

async function saveToFile() {
  if (!store.response) {
    alert('暂无响应内容可保存')
    return
  }
  if (saving.value) return

  // 1. 推断文件扩展名与智能默认文件名
  let ext = 'txt'
  if (isJson.value) ext = 'json'
  else if (isHtml.value) ext = 'html'
  else if (contentType.value.includes('xml')) ext = 'xml'
  else if (contentType.value.includes('javascript')) ext = 'js'
  else if (contentType.value.includes('css')) ext = 'css'
  else if (contentType.value.includes('image/png')) ext = 'png'
  else if (contentType.value.includes('image/jpeg')) ext = 'jpg'
  else if (contentType.value.includes('image/svg')) ext = 'svg'
  else if (contentType.value.includes('image/webp')) ext = 'webp'
  else if (contentType.value.includes('application/pdf')) ext = 'pdf'

  let baseName = 'response'
  try {
    const urlObj = new URL(store.resolvedUrl)
    const segments = urlObj.pathname.split('/').filter(Boolean)
    if (segments.length > 0) {
      const last = segments[segments.length - 1]
      if (last.includes('.')) {
        baseName = last
      } else {
        baseName = last.replace(/[^a-zA-Z0-9_-]/g, '_')
      }
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

  // 2. 准备要写入的内容
  // 如果当前处于 pretty 模式且为 JSON，则保存格式化后的内容
  // 如果处于 raw 模式或二进制内容，标记 useRawBytes = true，直接由 Rust 底层写入无损原始字节
  const isPrettyJson = isJson.value && bodyViewMode.value === 'pretty'
  const contentToSave = isPrettyJson ? (displayBody.value || store.response.body) : store.response.body
  const useRawBytes = !isPrettyJson

  try {
    saving.value = true
    // 调用 Tauri 原生文件选择与保存对话框
    const savedPath = await invoke<string | null>('save_response_to_file', {
      defaultFilename,
      content: contentToSave,
      useRawBytes
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
    console.error('另存为本地文件失败:', err)
    // 非 Tauri 或系统命令异常时，回退至浏览器 Blob 下载方案
    try {
      const blob = new Blob([contentToSave], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = defaultFilename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert(`保存文件失败: ${err?.message || err}`)
    }
  } finally {
    saving.value = false
  }
}
</script>
