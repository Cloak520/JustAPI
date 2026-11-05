<template>
  <div class="flex flex-col h-full space-y-3">
    <!-- Tab 头部导航 -->
    <div class="flex items-center justify-between border-b border-border pb-1 shrink-0 select-none">
      <div class="flex items-center space-x-1 text-xs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="activeTab === tab.id ? 'text-primary font-medium border-b-2 border-primary bg-muted/30' : 'text-muted-foreground hover:text-foreground'"
          class="px-3 py-1.5 rounded-t-md transition relative flex items-center space-x-1.5"
        >
          <span>{{ tab.label }}</span>
          <span
            v-if="tab.badgeCount && tab.badgeCount > 0"
            class="text-[10px] px-1 py-0.2 rounded-full bg-primary/20 text-primary font-mono"
          >
            {{ tab.badgeCount }}
          </span>
        </button>
      </div>

      <!-- 右侧辅助工具：Headers & Params 模式切换 (表格 vs 纯文本) -->
      <div v-if="['headers', 'params'].includes(activeTab)" class="flex items-center space-x-1 text-[11px]">
        <button
          @click="toggleMode"
          class="flex items-center space-x-1 px-2 py-1 rounded border border-border bg-card/60 hover:bg-muted/50 text-muted-foreground hover:text-foreground transition"
          :title="isTextMode ? '切换为表格模式' : '切换为批量文本模式'"
        >
          <Code2 v-if="!isTextMode" class="w-3.5 h-3.5 text-primary" />
          <Table2 v-else class="w-3.5 h-3.5 text-primary" />
          <span>{{ isTextMode ? '表格模式' : '文本模式 (Bulk Edit)' }}</span>
        </button>
      </div>
    </div>

    <!-- Tab 页面内容区 -->
    <div class="flex-1 overflow-y-auto">
      <!-- 1. Headers Tab -->
      <div v-if="activeTab === 'headers'" class="space-y-3">
        <!-- 级联继承公共 Headers 提示与列表 -->
        <div v-if="effectiveInheritedHeaders.length > 0" class="rounded-lg border border-border/70 bg-muted/20 overflow-hidden text-xs">
          <div
            @click="showInheritedHeaders = !showInheritedHeaders"
            class="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-muted/40 transition select-none text-muted-foreground hover:text-foreground"
          >
            <div class="flex items-center space-x-2">
              <ChevronRight
                class="w-3.5 h-3.5 text-muted-foreground/60 transition-transform duration-150"
                :class="showInheritedHeaders ? 'rotate-90' : ''"
              />
              <span class="font-medium text-[11px] text-foreground/90">公共级联继承 Headers</span>
              <span class="text-[10px] px-1.5 py-0.2 rounded-full bg-primary/10 text-primary font-mono font-medium">
                {{ effectiveInheritedHeaders.length }} 个公共 Header
              </span>
            </div>
            <span class="text-[10px] text-muted-foreground/70">
              {{ showInheritedHeaders ? '收起' : '展开查看' }} (在发送时自动生效)
            </span>
          </div>

          <div v-if="showInheritedHeaders" class="border-t border-border/50 divide-y divide-border/30 bg-card/30">
            <div
              v-for="h in effectiveInheritedHeaders"
              :key="h.id"
              class="flex items-center justify-between px-3 py-1.5 text-[11px] font-mono text-muted-foreground"
            >
              <div class="flex items-center space-x-2 truncate">
                <span
                  class="text-[9px] px-1.5 py-0.2 rounded font-sans border font-medium shrink-0"
                  :class="h.inheritedFrom === 'project' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'"
                >
                  {{ h.inheritedFrom === 'project' ? '主项目全局' : '子项目' }}
                </span>
                <span class="text-foreground font-semibold">{{ h.key }}</span>
                <span class="text-muted-foreground/60">:</span>
                <span class="truncate text-foreground/80">{{ h.value }}</span>
              </div>
              <span v-if="h.description" class="text-[10px] text-muted-foreground/60 font-sans truncate pl-2">
                {{ h.description }}
              </span>
            </div>
          </div>
        </div>

        <BulkTextEditor
          v-if="headersTextMode"
          :items="store.headers"
          format="colon"
          @update:items="val => store.headers = val"
        />
        <KeyValueGrid v-else :items="store.headers" />
      </div>

      <!-- 2. Params Tab (Path Variables + Query Params) -->
      <div v-if="activeTab === 'params'" class="space-y-4">
        <!-- 路径参数 (Path Variables) -->
        <div v-if="store.pathParams.length > 0" class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-foreground/90 flex items-center space-x-1.5">
              <span>Path Variables (路径参数)</span>
              <span class="text-[10px] text-muted-foreground font-normal">自动从 URL 中提取</span>
            </span>
          </div>
          <KeyValueGrid :items="store.pathParams" />
        </div>

        <!-- 查询参数 (Query Params) -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-foreground/90">Query Params (URL 参数)</span>
          </div>

          <BulkTextEditor
            v-if="paramsTextMode"
            :items="store.queryParams"
            format="equal"
            @update:items="val => store.queryParams = val"
          />
          <KeyValueGrid v-else :items="store.queryParams" />
        </div>
      </div>

      <!-- 3. Body Tab -->
      <div v-if="activeTab === 'body'" class="flex flex-col h-full space-y-3">
        <!-- Body 类型选择器 -->
        <div class="flex items-center space-x-4 text-xs select-none">
          <label
            v-for="type in bodyTypes"
            :key="type.value"
            class="flex items-center space-x-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <input
              type="radio"
              :value="type.value"
              v-model="store.bodyType"
              class="text-primary focus:ring-0 cursor-pointer"
            />
            <span :class="store.bodyType === type.value ? 'font-medium text-foreground' : ''">{{ type.label }}</span>
          </label>
        </div>

        <!-- Body 内容编辑器 -->
        <div class="flex-1 flex flex-col min-h-[220px]">
          <!-- none -->
          <div v-if="store.bodyType === 'none'" class="flex-1 flex items-center justify-center border border-dashed border-border rounded-lg text-xs text-muted-foreground/60">
            该请求无需发送 Body
          </div>

          <!-- JSON 模式 (CodeMirror 6 + 手动格式化/压缩) -->
          <div v-else-if="store.bodyType === 'json'" class="flex-1 flex flex-col space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="text-muted-foreground text-[11px]">默认保持原始排版，不自动格式化</span>
              <div class="flex items-center space-x-2">
                <button
                  @click="store.formatJson"
                  class="flex items-center space-x-1 px-2 py-1 rounded bg-muted hover:bg-muted/80 text-foreground text-[11px] font-medium transition"
                  title="基于 Rust 原生 serde_json 异步执行"
                >
                  <Sparkles class="w-3.5 h-3.5 text-primary" />
                  <span>格式化 (Prettify)</span>
                </button>
                <button
                  @click="store.minifyJson"
                  class="flex items-center space-x-1 px-2 py-1 rounded bg-muted hover:bg-muted/80 text-foreground text-[11px] font-medium transition"
                  title="压缩为单行紧凑 JSON"
                >
                  <Minimize2 class="w-3.5 h-3.5 text-amber-400" />
                  <span>单行压缩 (Minify)</span>
                </button>
              </div>
            </div>

            <div class="flex-1 h-56 min-h-[200px]">
              <CodeEditor v-model="store.bodyContent" language="json" />
            </div>
          </div>

          <!-- Raw 纯文本模式 -->
          <div v-else-if="store.bodyType === 'raw'" class="flex-1 h-56 min-h-[200px]">
            <CodeEditor v-model="store.bodyContent" language="raw" />
          </div>

          <!-- Form-Data / x-www-form-urlencoded -->
          <div v-else class="space-y-2">
            <div class="text-[11px] text-muted-foreground">键值对表单配置：</div>
            <div class="space-y-1">
              <div
                v-for="(field, index) in store.formFields"
                :key="field.id || index"
                class="grid grid-cols-[36px_1fr_1fr_60px_36px] items-center gap-2 px-2 py-1 bg-card/40 border border-border rounded"
              >
                <input type="checkbox" v-model="field.enabled" class="rounded border-border text-primary" />
                <input v-model="field.key" placeholder="Key" class="bg-transparent font-mono text-xs focus:outline-none" />
                <input v-model="field.value" placeholder="Value (文件路径或文本)" class="bg-transparent font-mono text-xs focus:outline-none" />
                <label v-if="store.bodyType === 'form-data'" class="flex items-center space-x-1 text-[10px] text-muted-foreground cursor-pointer">
                  <input type="checkbox" v-model="field.is_file" />
                  <span>文件</span>
                </label>
                <button @click="store.formFields.splice(index, 1)" class="text-muted-foreground hover:text-destructive text-xs">×</button>
              </div>
              <button
                @click="addFormField"
                class="text-xs text-primary font-medium hover:underline pt-1"
              >
                + 添加字段
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Sparkles, Minimize2, Code2, Table2, ChevronRight } from 'lucide-vue-next'
import { useRequestStore } from '@/stores/requestStore'
import { useTabStore } from '@/stores/tabStore'
import { useProjectStore } from '@/stores/projectStore'
import KeyValueGrid from './KeyValueGrid.vue'
import BulkTextEditor from './BulkTextEditor.vue'
import CodeEditor from '@/components/common/CodeEditor.vue'

const store = useRequestStore()
const tabStore = useTabStore()
const projectStore = useProjectStore()
const activeTab = ref<'headers' | 'params' | 'body'>('headers')

const paramsTextMode = ref(false)
const headersTextMode = ref(false)
const showInheritedHeaders = ref(false)

const activeTabItem = computed(() => tabStore.tabs.find(t => t.id === tabStore.activeTabId))
const effectiveInheritedHeaders = computed(() => {
  return projectStore.resolveEffectiveHeaders(activeTabItem.value?.subProjectDir)
})

const isTextMode = computed(() => {
  return activeTab.value === 'headers' ? headersTextMode.value : paramsTextMode.value
})

function toggleMode() {
  if (activeTab.value === 'headers') {
    headersTextMode.value = !headersTextMode.value
  } else if (activeTab.value === 'params') {
    paramsTextMode.value = !paramsTextMode.value
  }
}

function addFormField() {
  store.formFields.push({
    id: crypto.randomUUID(),
    key: '',
    value: '',
    is_file: false,
    enabled: true
  })
}

const tabs = computed(() => [
  {
    id: 'headers' as const,
    label: 'Headers',
    badgeCount: store.headers.filter(h => h.enabled && h.key.trim()).length + effectiveInheritedHeaders.value.length
  },
  {
    id: 'params' as const,
    label: 'Params',
    badgeCount: store.queryParams.filter(p => p.enabled && p.key.trim()).length + store.pathParams.length
  },
  {
    id: 'body' as const,
    label: 'Body',
    badgeCount: store.bodyType !== 'none' ? 1 : 0
  }
])

const bodyTypes = [
  { label: 'none', value: 'none' },
  { label: 'JSON', value: 'json' },
  { label: 'form-data', value: 'form-data' },
  { label: 'x-www-form-urlencoded', value: 'x-www-form-urlencoded' },
  { label: 'Raw Text', value: 'raw' }
]
</script>
