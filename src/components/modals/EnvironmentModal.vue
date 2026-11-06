<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div class="flex flex-col w-full max-w-4xl h-[560px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      <!-- 模态框顶部标题 -->
      <div class="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/40 shrink-0">
        <div class="flex items-center space-x-2 shrink-0 whitespace-nowrap">
          <div class="w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Globe class="w-3.5 h-3.5" />
          </div>
          <h3 class="font-semibold text-sm whitespace-nowrap">项目环境变量管理</h3>
          <span v-pre class="text-xs text-muted-foreground whitespace-nowrap">(支持 {{variable_name}} 动态插值)</span>
        </div>
        <button
          @click="close"
          class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition shrink-0"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- 模态框主体内容：左右分栏 (左侧环境列表，右侧变量编辑器) -->
      <div class="flex-1 flex min-h-0 overflow-hidden">
        <!-- 左侧：环境配置列表 (Dev, Test, Prod 等) -->
        <div class="w-52 border-r border-border bg-muted/20 flex flex-col shrink-0">
          <div class="flex items-center justify-between px-3 py-2 border-b border-border text-xs text-muted-foreground font-medium shrink-0 whitespace-nowrap">
            <span>环境列表</span>
            <button
              @click="addEnvironment"
              class="flex items-center space-x-1 px-1.5 py-0.5 rounded text-primary hover:bg-primary/10 transition text-xs shrink-0 whitespace-nowrap"
              title="新建一套环境"
            >
              <Plus class="w-3.5 h-3.5" />
              <span>新建</span>
            </button>
          </div>

          <div class="flex-1 overflow-y-auto divide-y divide-border/30">
            <div
              v-for="env in localEnvironments"
              :key="env.id"
              @click="switchEnv(env.id)"
              class="flex items-center justify-between px-3 py-2 cursor-pointer transition text-xs group"
              :class="selectedEnvId === env.id ? 'bg-primary/15 text-primary font-medium' : 'text-foreground hover:bg-muted/50'"
            >
              <div class="flex items-center space-x-2 truncate">
                <Check
                  v-if="activeEnvId === env.id"
                  class="w-3.5 h-3.5 text-emerald-400 shrink-0"
                  title="当前激活环境"
                />
                <span v-else class="w-3.5 h-3.5 inline-block shrink-0" />
                <span class="truncate">{{ env.name }}</span>
              </div>

              <div class="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition shrink-0" @click.stop>
                <button
                  v-if="activeEnvId !== env.id"
                  @click="setAsActive(env.id)"
                  class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-emerald-400 transition"
                  title="激活此环境"
                >
                  <Check class="w-3 h-3" />
                </button>
                <button
                  @click="deleteEnv(env.id)"
                  class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition"
                  title="删除环境"
                >
                  <Trash2 class="w-3 h-3" />
                </button>
              </div>
            </div>

            <div v-if="localEnvironments.length === 0" class="p-4 text-center text-xs text-muted-foreground">
              暂无环境配置，点击右上角「新建」创建
            </div>
          </div>
        </div>

        <!-- 右侧：当前选中环境的变量编辑区 -->
        <div class="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
          <template v-if="currentSelectedEnv">
            <!-- 环境名称与模式切换 -->
            <div class="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/40 shrink-0 gap-3">
              <div class="flex items-center space-x-3 shrink-0 whitespace-nowrap">
                <div class="flex items-center space-x-2 shrink-0 whitespace-nowrap">
                  <span class="text-xs text-muted-foreground shrink-0 font-medium whitespace-nowrap">环境名称:</span>
                  <input
                    v-model="currentSelectedEnv.name"
                    type="text"
                    placeholder="例如: Dev, Test, Prod"
                    class="text-xs px-2 py-1 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary w-40 font-medium"
                  />
                </div>

                <!-- 显式激活按钮 (防止换行) -->
                <button
                  @click="toggleActiveEnv(currentSelectedEnv.id)"
                  class="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition border shrink-0 whitespace-nowrap"
                  :class="activeEnvId === currentSelectedEnv.id ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-muted/40 text-muted-foreground border-border hover:text-foreground'"
                  :title="activeEnvId === currentSelectedEnv.id ? '当前环境已激活，点击取消激活' : '点击设为当前激活生效环境'"
                >
                  <Check class="w-3.5 h-3.5 shrink-0" :class="activeEnvId === currentSelectedEnv.id ? 'text-emerald-400' : 'text-muted-foreground'" />
                  <span class="whitespace-nowrap">{{ activeEnvId === currentSelectedEnv.id ? '已激活 (当前生效)' : '设为激活环境' }}</span>
                </button>
              </div>

              <!-- 表格 vs 文本批量模式切换 (防止换行) -->
              <div class="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border text-[11px] shrink-0 whitespace-nowrap">
                <button
                  @click="mode = 'grid'"
                  :class="mode === 'grid' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
                  class="px-2.5 py-0.5 rounded transition font-medium whitespace-nowrap"
                >
                  表格模式
                </button>
                <button
                  @click="mode = 'bulk'"
                  :class="mode === 'bulk' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
                  class="px-2.5 py-0.5 rounded transition font-medium whitespace-nowrap"
                >
                  文本模式
                </button>
              </div>
            </div>

            <!-- 变量编辑视图 -->
            <div class="flex-1 overflow-y-auto p-4">
              <!-- 1. 表格模式 -->
              <div v-if="mode === 'grid'" class="flex flex-col space-y-2">
                <div class="flex items-center justify-between text-xs text-muted-foreground pb-1 border-b border-border/60">
                  <div class="flex items-center space-x-4 shrink-0 whitespace-nowrap">
                    <span class="w-48 pl-2 shrink-0 whitespace-nowrap">变量名称 (Key)</span>
                    <span class="flex-1 shrink-0 whitespace-nowrap">变量值 (Value)</span>
                  </div>
                  <button
                    @click="addVariableRow"
                    class="flex items-center space-x-1 px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground text-xs transition shrink-0 whitespace-nowrap"
                  >
                    <Plus class="w-3 h-3 text-primary" />
                    <span>添加变量</span>
                  </button>
                </div>

                <div class="flex flex-col space-y-1.5">
                  <div
                    v-for="(row, idx) in variableRows"
                    :key="idx"
                    class="flex items-center space-x-2 group"
                  >
                    <div class="w-48 relative">
                      <input
                        v-model="row.key"
                        type="text"
                        placeholder="变量名 (如 baseUrl)"
                        class="w-full text-xs font-mono px-2.5 py-1.5 rounded bg-card border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div class="flex-1 relative">
                      <input
                        v-model="row.value"
                        type="text"
                        placeholder="对应的值"
                        class="w-full text-xs font-mono px-2.5 py-1.5 rounded bg-card border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <button
                      @click="removeVariableRow(idx)"
                      class="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition opacity-0 group-hover:opacity-100"
                      title="删除此变量"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div v-if="variableRows.length === 0" class="text-center py-8 text-xs text-muted-foreground">
                    暂无变量，点击上方「添加变量」或切换至「文本模式」快速贴入
                  </div>
                </div>
              </div>

              <!-- 2. 文本模式模式 (KEY=VALUE 或 KEY: VALUE) -->
              <div v-else class="flex flex-col h-full space-y-1.5">
                <div class="text-[11px] text-muted-foreground">
                  每行一条变量，支持 <code class="font-mono bg-muted px-1 py-0.2 rounded">KEY=VALUE</code> 或 <code class="font-mono bg-muted px-1 py-0.2 rounded">KEY: VALUE</code> 格式：
                </div>
                <textarea
                  v-model="bulkText"
                  @blur="syncFromBulkText"
                  placeholder="baseUrl=https://api.example.com
token=eyJhbGciOi...
timeout=5000"
                  class="flex-1 w-full p-3 font-mono text-xs rounded-lg bg-card border border-border focus:outline-none focus:ring-1 focus:ring-primary resize-none min-h-[260px]"
                />
              </div>
            </div>
          </template>

          <div v-else class="flex-1 flex flex-col items-center justify-center text-xs text-muted-foreground">
            <Globe class="w-8 h-8 opacity-20 mb-2" />
            <span>请在左侧选择或新建一个环境以配置变量</span>
          </div>
        </div>
      </div>

      <!-- 模态框底部操作栏 -->
      <div class="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/40 shrink-0">
        <div v-pre class="flex items-center space-x-2 text-xs text-muted-foreground shrink-0 whitespace-nowrap">
          <span>内置动态变量:</span>
          <code class="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">&#123;&#123;$guid&#125;&#125;</code>
          <code class="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">&#123;&#123;$timestamp&#125;&#125;</code>
          <code class="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">&#123;&#123;$randomInt&#125;&#125;</code>
        </div>

        <div class="flex items-center space-x-2 shrink-0 whitespace-nowrap">
          <button
            @click="close"
            class="px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-xs transition whitespace-nowrap"
          >
            取消
          </button>
          <button
            @click="saveAll"
            class="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-xs transition shadow-sm whitespace-nowrap"
          >
            保存变更
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, Plus, Trash2, Check, Globe } from 'lucide-vue-next'
import { useProjectStore } from '@/stores/projectStore'
import type { Environment } from '@/types'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const projectStore = useProjectStore()

// 本地可编辑的副本
const localEnvironments = ref<Environment[]>([])
const selectedEnvId = ref<string | null>(null)
const activeEnvId = ref<string | null>(null)
const mode = ref<'grid' | 'bulk'>('grid')
const bulkText = ref('')

interface VariableRow {
  key: string
  value: string
}
const variableRows = ref<VariableRow[]>([])

// 当前选中的环境对象
const currentSelectedEnv = computed(() => {
  return localEnvironments.value.find(e => e.id === selectedEnvId.value) || null
})

// 当模态框打开时，初始化数据副本
watch(() => props.modelValue, (open) => {
  if (open) {
    const rawEnvs = projectStore.environments || []
    localEnvironments.value = JSON.parse(JSON.stringify(rawEnvs))
    activeEnvId.value = projectStore.activeEnvironment?.id || null

    if (localEnvironments.value.length > 0) {
      selectedEnvId.value = activeEnvId.value || localEnvironments.value[0].id
    } else {
      selectedEnvId.value = null
    }
    loadCurrentEnvVariables()
  }
})

function switchEnv(id: string) {
  if (selectedEnvId.value === id) return
  commitCurrentEnvVariables()
  selectedEnvId.value = id
  loadCurrentEnvVariables()
}

// 监听模式切换，同步表格和文本
watch(mode, (newMode) => {
  if (newMode === 'bulk') {
    syncToBulkText()
  } else {
    syncFromBulkText()
  }
})

function loadCurrentEnvVariables() {
  if (!currentSelectedEnv.value) {
    variableRows.value = []
    bulkText.value = ''
    return
  }
  const vars = currentSelectedEnv.value.variables || {}
  variableRows.value = Object.entries(vars).map(([key, value]) => ({ key, value }))
  syncToBulkText()
}

function commitCurrentEnvVariables() {
  if (!currentSelectedEnv.value) return
  if (mode.value === 'bulk') {
    syncFromBulkText()
  }
  const map: Record<string, string> = {}
  for (const row of variableRows.value) {
    if (row.key.trim()) {
      map[row.key.trim()] = row.value
    }
  }
  currentSelectedEnv.value.variables = map
}

function syncToBulkText() {
  bulkText.value = variableRows.value
    .filter(r => r.key.trim())
    .map(r => `${r.key.trim()}=${r.value}`)
    .join('\n')
}

function syncFromBulkText() {
  const lines = bulkText.value.split('\n')
  const newRows: VariableRow[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    const colonIdx = trimmed.indexOf(':')

    let key = ''
    let val = ''
    if (eqIdx !== -1 && (colonIdx === -1 || eqIdx < colonIdx)) {
      key = trimmed.slice(0, eqIdx).trim()
      val = trimmed.slice(eqIdx + 1).trim()
    } else if (colonIdx !== -1) {
      key = trimmed.slice(0, colonIdx).trim()
      val = trimmed.slice(colonIdx + 1).trim()
    } else {
      key = trimmed
      val = ''
    }

    if (key) {
      newRows.push({ key, value: val })
    }
  }
  variableRows.value = newRows
}

function addEnvironment() {
  commitCurrentEnvVariables()
  const newEnv: Environment = {
    id: 'env_' + crypto.randomUUID().slice(0, 8),
    name: `环境 ${localEnvironments.value.length + 1}`,
    variables: {}
  }
  localEnvironments.value.push(newEnv)
  selectedEnvId.value = newEnv.id
  if (!activeEnvId.value) {
    activeEnvId.value = newEnv.id
  }
  loadCurrentEnvVariables()
}

function deleteEnv(id: string) {
  localEnvironments.value = localEnvironments.value.filter(e => e.id !== id)
  if (activeEnvId.value === id) {
    activeEnvId.value = localEnvironments.value[0]?.id || null
  }
  if (selectedEnvId.value === id) {
    selectedEnvId.value = localEnvironments.value[0]?.id || null
    loadCurrentEnvVariables()
  }
}

function setAsActive(id: string) {
  activeEnvId.value = id
}

function toggleActiveEnv(id: string) {
  if (activeEnvId.value === id) {
    activeEnvId.value = null
  } else {
    activeEnvId.value = id
  }
}

function addVariableRow() {
  variableRows.value.push({ key: '', value: '' })
}

function removeVariableRow(index: number) {
  variableRows.value.splice(index, 1)
}

function close() {
  isOpen.value = false
}

async function saveAll() {
  commitCurrentEnvVariables()

  // 若尚未指定激活环境，且当前有环境存在，默认将当前查看的环境设为激活环境
  let targetActive = activeEnvId.value
  if (!targetActive && localEnvironments.value.length > 0) {
    targetActive = selectedEnvId.value || localEnvironments.value[0].id
  }

  await projectStore.saveEnvironments(localEnvironments.value, targetActive)
  close()
}
</script>
