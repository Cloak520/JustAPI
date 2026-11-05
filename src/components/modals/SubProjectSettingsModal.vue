<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div class="flex flex-col w-full max-w-2xl h-[560px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      <!-- 模态框顶部标题 -->
      <div class="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/40 shrink-0">
        <div class="flex items-center space-x-2">
          <div class="w-6 h-6 rounded-md bg-primary/20 text-primary flex items-center justify-center">
            <Settings2 class="w-3.5 h-3.5" />
          </div>
          <h3 class="font-semibold text-sm">子项目配置: {{ targetSub?.config.name || dirName }}</h3>
        </div>
        <button
          @click="close"
          class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- 选项卡导航 (基本与BaseURL, 环境变量, Headers) -->
      <div class="flex items-center space-x-1 px-4 pt-2 border-b border-border bg-muted/10 shrink-0 text-xs">
        <button
          @click="activeTab = 'general'"
          :class="activeTab === 'general' ? 'border-b-2 border-primary text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'"
          class="px-3 py-2 transition"
        >
          基础与 BaseURL
        </button>
        <button
          @click="activeTab = 'variables'"
          :class="activeTab === 'variables' ? 'border-b-2 border-primary text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'"
          class="px-3 py-2 transition flex items-center space-x-1.5"
        >
          <span>环境变量与覆盖</span>
          <span
            v-if="variableRows.length > 0"
            class="px-1.5 py-0.2 rounded-full bg-primary/20 text-primary text-[10px] font-mono"
          >
            {{ variableRows.length }}
          </span>
        </button>
        <button
          @click="activeTab = 'headers'"
          :class="activeTab === 'headers' ? 'border-b-2 border-primary text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'"
          class="px-3 py-2 transition flex items-center space-x-1.5"
        >
          <span>子项目 Headers</span>
          <span
            v-if="localConfig.headers.length > 0"
            class="px-1.5 py-0.2 rounded-full bg-primary/20 text-primary text-[10px] font-mono"
          >
            {{ localConfig.headers.length }}
          </span>
        </button>
      </div>

      <!-- 选项卡主体内容 -->
      <div class="flex-1 overflow-y-auto p-5">
        <!-- 1. 基础与 BaseURL -->
        <div v-if="activeTab === 'general'" class="space-y-4">
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-foreground">子项目显示名称</label>
            <input
              v-model="localConfig.name"
              type="text"
              placeholder="例如: 认证与用户服务"
              class="w-full text-xs px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div class="space-y-2 pt-2 border-t border-border/60">
            <div class="flex items-center justify-between">
              <label class="text-xs font-medium text-foreground">BaseURL 配置</label>
              <label class="flex items-center space-x-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  v-model="localConfig.inheritBaseUrl"
                  type="checkbox"
                  class="rounded border-border text-primary focus:ring-0"
                />
                <span>继承主项目 BaseURL (拼接子路径)</span>
              </label>
            </div>

            <div class="space-y-1.5">
              <input
                v-model="localConfig.baseUrl"
                type="text"
                :placeholder="localConfig.inheritBaseUrl ? '相对子路径 (如 /api/v1/auth)' : '独立 BaseURL (如 https://auth.api.com)'"
                class="w-full text-xs font-mono px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p class="text-[11px] text-muted-foreground">
                主项目根 BaseURL: <code class="font-mono bg-muted px-1 py-0.2 rounded text-[10px]">{{ projectStore.projectConfig?.baseUrl || '无' }}</code>
              </p>
            </div>
          </div>
        </div>

        <!-- 2. 环境变量与覆盖 -->
        <div v-else-if="activeTab === 'variables'" class="space-y-4">
          <!-- 继承开关 -->
          <div class="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
            <div>
              <div class="text-xs font-medium text-foreground">继承主项目环境变量</div>
              <div class="text-[11px] text-muted-foreground">
                当前激活环境: <span class="font-semibold text-emerald-400">{{ projectStore.activeEnvironment?.name || '无激活环境' }}</span>
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                v-model="localConfig.inheritVariables"
                type="checkbox"
                class="sr-only peer"
              />
              <div class="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <!-- 子项目专属变量或重写 -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs text-muted-foreground pb-1 border-b border-border/60">
              <span>子项目覆盖/专属变量</span>
              <button
                @click="addVariableRow"
                class="flex items-center space-x-1 px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground text-xs transition"
              >
                <Plus class="w-3 h-3 text-primary" />
                <span>添加变量</span>
              </button>
            </div>

            <div class="space-y-1.5">
              <div
                v-for="(row, idx) in variableRows"
                :key="idx"
                class="flex items-center space-x-2 group"
              >
                <div class="w-44 relative">
                  <input
                    v-model="row.key"
                    type="text"
                    placeholder="变量名 (如 token)"
                    class="w-full text-xs font-mono px-2.5 py-1.5 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <!-- 覆盖指示标记 -->
                  <span
                    v-if="isOverridingProjectVar(row.key)"
                    class="absolute -top-2 right-1 text-[9px] px-1 bg-amber-500/20 text-amber-400 rounded border border-amber-500/30 select-none"
                    title="此变量覆盖了主项目环境中的同名变量"
                  >
                    覆盖主变量
                  </span>
                </div>
                <div class="flex-1 relative">
                  <input
                    v-model="row.value"
                    type="text"
                    placeholder="变量值"
                    class="w-full text-xs font-mono px-2.5 py-1.5 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <button
                  @click="removeVariableRow(idx)"
                  class="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition opacity-0 group-hover:opacity-100"
                  title="删除"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>

              <div v-if="variableRows.length === 0" class="text-center py-6 text-xs text-muted-foreground">
                暂无子项目专属变量，默认使用主项目继承变量
              </div>
            </div>
          </div>
        </div>

        <!-- 3. Headers -->
        <div v-else-if="activeTab === 'headers'" class="space-y-4">
          <div class="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
            <div>
              <div class="text-xs font-medium text-foreground">继承主项目全局 Headers</div>
              <div class="text-[11px] text-muted-foreground">
                关闭后本子项目下的请求将不再附加主项目全局 Headers
              </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                v-model="localConfig.inheritHeaders"
                type="checkbox"
                class="sr-only peer"
              />
              <div class="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs text-muted-foreground pb-1 border-b border-border/60">
              <span>子项目自定义 Headers</span>
              <button
                @click="addHeaderRow"
                class="flex items-center space-x-1 px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground text-xs transition"
              >
                <Plus class="w-3 h-3 text-primary" />
                <span>添加 Header</span>
              </button>
            </div>

            <div class="space-y-1.5">
              <div
                v-for="(h, idx) in localConfig.headers"
                :key="h.id || idx"
                class="flex items-center space-x-2 group"
              >
                <input
                  v-model="h.enabled"
                  type="checkbox"
                  class="rounded border-border text-primary focus:ring-0"
                />
                <input
                  v-model="h.key"
                  type="text"
                  placeholder="Header 键名 (如 Authorization)"
                  class="w-48 text-xs font-mono px-2.5 py-1.5 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  v-model="h.value"
                  type="text"
                  placeholder="Header 值"
                  class="flex-1 text-xs font-mono px-2.5 py-1.5 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  @click="localConfig.headers.splice(idx, 1)"
                  class="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition opacity-0 group-hover:opacity-100"
                  title="删除"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>

              <div v-if="localConfig.headers.length === 0" class="text-center py-6 text-xs text-muted-foreground">
                暂无子项目 Header
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 模态框底部 -->
      <div class="flex items-center justify-end space-x-2 px-5 py-3 border-t border-border bg-muted/40 shrink-0">
        <button
          @click="close"
          class="px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-xs transition"
        >
          取消
        </button>
        <button
          @click="saveConfig"
          class="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-xs transition shadow-sm"
        >
          保存配置
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, Settings2, Plus, Trash2 } from 'lucide-vue-next'
import { useProjectStore } from '@/stores/projectStore'
import type { SubProjectConfig, KeyValuePair } from '@/types'

const props = defineProps<{
  modelValue: boolean
  dirName: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const projectStore = useProjectStore()
const activeTab = ref<'general' | 'variables' | 'headers'>('general')

const targetSub = computed(() => {
  return projectStore.subProjects.find(s => s.dir_name === props.dirName)
})

const localConfig = ref<SubProjectConfig>({
  id: '',
  name: '',
  baseUrl: '',
  inheritBaseUrl: true,
  headers: [],
  inheritHeaders: true,
  variables: {},
  inheritVariables: true
})

interface VariableRow {
  key: string
  value: string
}
const variableRows = ref<VariableRow[]>([])

watch(() => props.modelValue, (open) => {
  if (open && targetSub.value) {
    localConfig.value = JSON.parse(JSON.stringify(targetSub.value.config))
    variableRows.value = Object.entries(localConfig.value.variables || {}).map(([key, value]) => ({ key, value }))
    activeTab.value = 'general'
  }
})

function isOverridingProjectVar(key: string): boolean {
  if (!key.trim() || !projectStore.activeEnvironment?.variables) return false
  return Object.prototype.hasOwnProperty.call(projectStore.activeEnvironment.variables, key.trim())
}

function addVariableRow() {
  variableRows.value.push({ key: '', value: '' })
}

function removeVariableRow(idx: number) {
  variableRows.value.splice(idx, 1)
}

function addHeaderRow() {
  const newHeader: KeyValuePair = {
    id: crypto.randomUUID(),
    key: '',
    value: '',
    enabled: true
  }
  localConfig.value.headers.push(newHeader)
}

function close() {
  isOpen.value = false
}

async function saveConfig() {
  const map: Record<string, string> = {}
  for (const r of variableRows.value) {
    if (r.key.trim()) {
      map[r.key.trim()] = r.value
    }
  }
  localConfig.value.variables = map

  await projectStore.updateSubProjectConfig(props.dirName, localConfig.value)
  close()
}
</script>
