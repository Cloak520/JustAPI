<template>
  <div v-if="sessionStore.response" class="h-full flex flex-col space-y-2 overflow-hidden">
    <!-- Body 子工具栏 -->
    <div class="flex items-center justify-between text-xs py-0.5 px-0.5 shrink-0">
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

      <div class="flex items-center space-x-1.5">
        <button
          v-if="isJson && bodyViewMode === 'pretty'"
          @click="isMinified = !isMinified"
          class="flex items-center space-x-1 px-2 py-1 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition border border-border/60"
          :title="isMinified ? '点击展开为缩进 JSON' : '点击压缩为单行 JSON'"
        >
          <Sparkles class="w-3 h-3 text-amber-400" />
          <span>{{ isMinified ? '展开缩进' : '压缩单行' }}</span>
        </button>

        <button
          @click="lineWrapping = !lineWrapping"
          class="flex items-center space-x-1 px-2 py-1 rounded text-[11px] transition border"
          :class="lineWrapping ? 'bg-primary/10 text-primary border-primary/30 font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 border-border/60'"
          :title="lineWrapping ? '已开启自动换行 (点击关闭)' : '点击开启自动换行'"
        >
          <WrapText class="w-3 h-3" />
          <span>换行</span>
        </button>

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

    <!-- 查找条 -->
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
        @keydown.esc="handleSearchBarEscape($event)"
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

    <!-- 主内容展示 -->
    <div class="flex-1 min-h-[160px] h-full overflow-hidden">
      <iframe
        v-if="bodyViewMode === 'preview' && isHtml"
        :srcdoc="sessionStore.response.body"
        sandbox="allow-same-origin"
        class="w-full h-full bg-white rounded-lg border border-border"
      />

      <div
        v-else-if="bodyViewMode === 'preview' && isImage"
        class="w-full h-full flex flex-col items-center justify-center bg-card/60 border border-border rounded-lg p-4 space-y-2 overflow-auto"
      >
        <img
          v-if="imageSrc && !imageLoadError"
          :src="imageSrc"
          alt="Response Image"
          class="max-w-full max-h-[80%] object-contain rounded shadow bg-[repeating-conic-gradient(#80808020_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]"
          @load="imageLoadError = false"
          @error="imageLoadError = true"
        />
        <div
          v-else
          class="flex flex-col items-center justify-center text-center space-y-1.5 text-muted-foreground p-6"
        >
          <span class="text-xs font-medium text-foreground">无法预览当前图片内容</span>
          <span class="text-[11px]">请尝试切换 Raw 查看原始数据，或点击右上角下载按钮保存到本地打开</span>
        </div>
        <span class="text-[11px] text-muted-foreground font-mono">
          {{ contentTypeTag || 'Image' }} ({{ formatSize(sessionStore.response.sizeBytes) }})
        </span>
      </div>

      <CodeEditor
        v-else
        :model-value="displayBody"
        :read-only="true"
        :language="editorLanguage"
        :line-wrapping="lineWrapping"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Code2, Eye, FileText, Search, Sparkles, WrapText, X } from 'lucide-vue-next'
import CodeEditor from '@/components/common/CodeEditor.vue'
import { defaultEscapeStack, ESCAPE_PRIORITY } from '@/core/shortcuts/escapeStack'
import { useSessionStore } from '@/stores/sessionStore'
import { buildImageDataUrl, useResponseViewState } from '../composables/useResponseViewState'

const sessionStore = useSessionStore()
const {
  bodyViewMode,
  isMinified,
  lineWrapping,
  showSearchBar,
  bodySearchQuery,
  isJson,
  isHtml,
  isImage,
  contentTypeTag,
  displayBody,
  editorLanguage
} = useResponseViewState()

const imageLoadError = ref(false)

function handleSearchBarEscape(e: KeyboardEvent) {
  if (defaultEscapeStack.hasActive(ESCAPE_PRIORITY.MODAL)) return
  showSearchBar.value = false
  e.preventDefault()
  e.stopPropagation()
}

const imageSrc = computed(() => buildImageDataUrl(sessionStore.response))

watch(imageSrc, () => {
  imageLoadError.value = false
})

const bodySearchMatchesCount = computed(() => {
  const q = bodySearchQuery.value.trim().toLowerCase()
  const content = displayBody.value
  if (!q || !content) return 0
  try {
    const text = content.toLowerCase()
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

function formatSize(bytes?: number) {
  if (bytes == null || isNaN(bytes)) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
</script>

