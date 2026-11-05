<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div class="flex flex-col w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      <!-- 模态框顶部标题 -->
      <div class="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/40 shrink-0">
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

      <!-- 表单主体 -->
      <div class="p-5 space-y-4 text-xs">
        <!-- 项目目录 (只读展示) -->
        <div class="space-y-1">
          <label class="font-medium text-foreground">本地项目路径</label>
          <div class="px-2.5 py-1.5 rounded-lg bg-muted/60 border border-border text-[11px] font-mono text-muted-foreground truncate select-all">
            {{ projectStore.projectPath || '未打开项目' }}
          </div>
        </div>

        <!-- 项目名称 -->
        <div class="space-y-1">
          <label class="font-medium text-foreground">项目名称 (name)</label>
          <input
            v-model="localName"
            type="text"
            placeholder="My API Project"
            class="w-full text-xs px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <!-- 主目录 BaseURL -->
        <div class="space-y-1">
          <div class="flex items-center justify-between">
            <label class="font-medium text-foreground">主目录根 BaseURL</label>
            <span class="text-[10px] text-muted-foreground font-mono">.justapi/project.json</span>
          </div>
          <input
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

      <!-- 底部操作栏 -->
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
import { FolderCog, X, Save } from 'lucide-vue-next'
import { useProjectStore } from '@/stores/projectStore'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved'): void
}>()

const projectStore = useProjectStore()

const isOpen = ref(props.modelValue)
const saving = ref(false)
const localName = ref('')
const localBaseUrl = ref('')

watch(() => props.modelValue, (val) => {
  isOpen.value = val
  if (val && projectStore.projectConfig) {
    localName.value = projectStore.projectConfig.name || ''
    localBaseUrl.value = projectStore.projectConfig.baseUrl || ''
  }
})

function close() {
  isOpen.value = false
  emit('update:modelValue', false)
}

async function saveAndClose() {
  if (!projectStore.projectConfig) return
  saving.value = true
  try {
    projectStore.projectConfig.name = localName.value.trim() || 'My API Project'
    await projectStore.updateBaseUrl(localBaseUrl.value.trim())
    emit('saved')
    close()
  } finally {
    saving.value = false
  }
}
</script>

