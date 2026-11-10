<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div class="flex flex-col w-full max-w-2xl h-[560px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      <div class="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/40 shrink-0 select-none">
        <div class="flex items-center space-x-2">
          <div class="w-6 h-6 rounded-md bg-primary/20 text-primary flex items-center justify-center">
            <FolderCog class="w-3.5 h-3.5" />
          </div>
          <h3 class="font-semibold text-sm">主项目全局配置</h3>
        </div>
        <button
          @click="close"
          class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="flex items-center justify-between px-4 pt-2 border-b border-border bg-muted/10 shrink-0 text-xs select-none">
        <div class="flex items-center space-x-1">
          <button
            @click="activeTab = 'general'"
            :class="activeTab === 'general' ? 'border-b-2 border-primary text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'"
            class="px-3 py-2 transition"
          >
            基础与 BaseURL
          </button>
          <button
            @click="activeTab = 'headers'"
            :class="activeTab === 'headers' ? 'border-b-2 border-primary text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'"
            class="px-3 py-2 transition flex items-center space-x-1.5"
          >
            <span>全局 Headers</span>
            <span
              v-if="localHeaders.length > 0"
              class="px-1.5 py-0.2 rounded-full bg-primary/20 text-primary text-[10px] font-mono"
            >
              {{ localHeaders.length }}
            </span>
          </button>
        </div>

        <div v-if="activeTab === 'headers'" class="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border text-[11px] mb-1">
          <button
            @click="headersMode = 'grid'"
            :class="headersMode === 'grid' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            class="px-2.5 py-0.5 rounded transition font-medium"
          >
            表格模式
          </button>
          <button
            @click="headersMode = 'bulk'"
            :class="headersMode === 'bulk' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            class="px-2.5 py-0.5 rounded transition font-medium"
          >
            文本模式
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-5">
        <div v-if="activeTab === 'general'" class="space-y-4">
          <div class="space-y-1">
            <label class="text-xs font-medium text-foreground">本地项目路径</label>
            <div class="px-2.5 py-1.5 rounded-lg bg-muted/60 border border-border text-[11px] font-mono text-muted-foreground truncate select-all">
              {{ workspaceStore.projectPath || '未打开项目' }}
            </div>
          </div>

          <div class="space-y-1">
            <label class="text-xs font-medium text-foreground">项目名称 (name)</label>
            <input
              v-model="localName"
              type="text"
              placeholder="My API Project"
              class="w-full text-xs px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div class="space-y-1 pt-2 border-t border-border/60">
            <div class="flex items-center justify-between">
              <label class="text-xs font-medium text-foreground">主目录根 BaseURL</label>
              <span class="text-[10px] text-muted-foreground font-mono">.justapi/project.json</span>
            </div>
            <input
              ref="baseUrlInputRef"
              v-model="localBaseUrl"
              type="text"
              placeholder="https://api.example.com"
              class="w-full text-xs font-mono px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p class="text-[11px] text-muted-foreground leading-relaxed pt-0.5">
              主目录全局基础接口地址。保存后将自动同步至 <code class="font-mono bg-muted px-1 py-0.2 rounded text-[10px]">project.json</code>，所有子项目默认级联继承该地址。
            </p>
          </div>
        </div>

        <div v-else-if="activeTab === 'headers'" class="space-y-4">
          <div class="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs space-y-1 text-foreground/90">
            <div class="font-medium flex items-center space-x-1.5 text-primary">
              <Sliders class="w-3.5 h-3.5" />
              <span>主项目全局 Headers 继承机制</span>
            </div>
            <p class="text-[11px] text-muted-foreground leading-relaxed">
              此处定义的 Headers 会作为公共请求头，<strong>自动级联下发</strong>给所有子项目及接口请求。<br />
              支持 <code v-pre class="font-mono bg-muted px-1 py-0.2 rounded text-[10px] text-emerald-400 font-semibold">{{variable_name}}</code> 动态环境变量插值。子项目或单接口若定义同名 Header 则优先覆盖。
            </p>
          </div>

          <div v-if="headersMode === 'bulk'" class="space-y-2">
            <BulkTextEditor
              :items="localHeaders"
              format="colon"
              :sub-project-dir="null"
              @update:items="val => (localHeaders = val)"
            />
          </div>

          <div v-else class="space-y-2">
            <div class="flex items-center justify-between text-xs text-muted-foreground pb-1 border-b border-border/60">
              <div class="flex items-center space-x-2">
                <span>全局请求头列表</span>
                <span class="text-[10px] text-muted-foreground/60">(勾选控制启用/禁用)</span>
              </div>
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
                v-for="(h, idx) in localHeaders"
                :key="h.id || idx"
                class="flex items-center space-x-2 group"
              >
                <input
                  v-model="h.enabled"
                  type="checkbox"
                  class="rounded border-border text-primary focus:ring-0 cursor-pointer"
                  title="启用/禁用此 Header"
                />
                <div class="w-48">
                  <AutocompleteInput
                    v-model="h.key"
                    placeholder="Header 键名 (如 Authorization, X-Token)"
                    :suggestions="COMMON_HEADER_SUGGESTIONS"
                    :sub-project-dir="null"
                    input-class="w-full text-xs font-mono px-2.5 py-1.5 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div class="flex-1">
                  <AutocompleteInput
                    v-model="h.value"
                    placeholder="Header 键值 (支持 {{token}})"
                    :suggestions="getHeaderValueSuggestions(h.key)"
                    :sub-project-dir="null"
                    input-class="w-full text-xs font-mono px-2.5 py-1.5 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <input
                  v-model="h.description"
                  type="text"
                  placeholder="说明 (可选)"
                  class="w-36 text-xs px-2.5 py-1.5 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary text-muted-foreground"
                />
                <button
                  @click="localHeaders.splice(idx, 1)"
                  class="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition opacity-0 group-hover:opacity-100"
                  title="删除"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>

              <div v-if="localHeaders.length === 0" class="text-center py-8 text-xs text-muted-foreground space-y-2">
                <div>暂无全局 Headers</div>
                <button
                  @click="addHeaderRow"
                  class="px-2.5 py-1 rounded bg-muted hover:bg-muted/80 text-foreground text-xs transition inline-flex items-center space-x-1"
                >
                  <Plus class="w-3 h-3 text-primary" />
                  <span>添加第一个全局 Header</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-end space-x-2 px-5 py-3 border-t border-border bg-muted/30 shrink-0">
        <button
          @click="close"
          class="px-3 py-1.5 rounded-lg hover:bg-muted text-muted-foreground transition text-xs"
        >
          取消
        </button>
        <button
          @click="saveAndClose"
          :disabled="saving"
          class="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition text-xs shadow-sm disabled:opacity-50"
        >
          <Save class="w-3.5 h-3.5" />
          <span>{{ saving ? '保存中...' : '保存配置' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { FolderCog, Plus, Save, Sliders, Trash2, X } from 'lucide-vue-next'
import AutocompleteInput from '@/components/common/AutocompleteInput.vue'
import BulkTextEditor from '@/components/request/BulkTextEditor.vue'
import { useEscapeCancel } from '@/composables/useEscapeCancel'
import { useVariableInput } from '@/composables/useVariableAutocomplete'
import { structuredCloneSafe } from '@/core/models/requestFactory'
import { useAppStore } from '@/stores/appStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { KeyValuePair } from '@/types'
import { COMMON_HEADER_SUGGESTIONS, getHeaderValueSuggestions } from '@/utils/headers'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved'): void
}>()

const workspaceStore = useWorkspaceStore()
const appStore = useAppStore()

const isOpen = ref(props.modelValue)
const saving = ref(false)
const activeTab = ref<'general' | 'headers'>('general')
const headersMode = ref<'grid' | 'bulk'>('grid')

const localName = ref('')
const localBaseUrl = ref('')
const localHeaders = ref<KeyValuePair[]>([])
const baseUrlInputRef = ref<HTMLInputElement | null>(null)

useVariableInput(baseUrlInputRef, {
  subProjectDir: () => null,
  onApplied: nextVal => {
    localBaseUrl.value = nextVal
  }
})

watch(
  () => props.modelValue,
  val => {
    isOpen.value = val
    if (val && workspaceStore.projectConfig) {
      localName.value = workspaceStore.projectConfig.name || ''
      localBaseUrl.value = workspaceStore.projectConfig.baseUrl || ''
      localHeaders.value = structuredCloneSafe(workspaceStore.projectConfig.headers || [])
    }
  }
)

function addHeaderRow() {
  localHeaders.value.push({
    id: crypto.randomUUID(),
    key: '',
    value: '',
    enabled: true,
    description: ''
  })
}

function close() {
  isOpen.value = false
  emit('update:modelValue', false)
}

useEscapeCancel(isOpen, () => {
  if (saving.value) return
  close()
})

async function saveAndClose() {
  if (!workspaceStore.projectConfig) return
  saving.value = true
  try {
    workspaceStore.projectConfig.name = localName.value.trim() || 'My API Project'
    workspaceStore.projectConfig.baseUrl = localBaseUrl.value.trim()
    workspaceStore.projectConfig.headers = localHeaders.value.filter(h => h.key.trim() !== '')
    await workspaceStore.saveProjectConfig()
    emit('saved')
    close()
  } catch (err: any) {
    appStore.showToast(`保存项目配置失败: ${err?.message || err}`, true)
  } finally {
    saving.value = false
  }
}
</script>
