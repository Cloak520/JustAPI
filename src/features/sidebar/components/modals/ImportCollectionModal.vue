<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
  >
    <div class="bg-card border border-border rounded-xl p-5 w-full max-w-md space-y-4 shadow-xl">
      <div class="flex items-center justify-between gap-2">
        <h3 class="font-semibold text-sm">导入接口文档 / 集合</h3>
        <span
          v-if="selectedImporter"
          class="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono truncate max-w-[200px]"
          :title="selectedImporter.label"
        >
          {{ selectedImporter.shortLabel || selectedImporter.label }}
        </span>
      </div>

      <!-- 若未启用任何文档集合导入插件 -->
      <div
        v-if="importers.length === 0"
        class="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-2.5 text-xs"
      >
        <div class="font-semibold text-amber-400">暂无可用的文档导入插件</div>
        <p class="text-[11px] text-muted-foreground leading-relaxed">
          Swagger / OpenAPI 等文档解析能力现已通过外置插件提供。请前往「插件管理」启用
          <code class="font-mono text-foreground">justapi.swagger</code> 或安装其他集合导入插件。
        </p>
        <div class="flex justify-end space-x-2 pt-1">
          <button
            @click="emit('update:modelValue', false)"
            class="px-3 py-1.5 rounded text-xs text-muted-foreground hover:bg-muted"
          >
            关闭
          </button>
          <button
            @click="openPluginsManager"
            class="px-3.5 py-1.5 rounded text-xs bg-primary text-primary-foreground font-medium hover:bg-primary/90"
          >
            打开插件管理
          </button>
        </div>
      </div>

      <template v-else>
        <div class="space-y-3 text-xs">
          <div v-if="importers.length > 1">
            <label class="text-muted-foreground block mb-1">文档解析插件</label>
            <select
              v-model="selectedImporterId"
              class="w-full p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="auto">自动识别格式</option>
              <option v-for="imp in importers" :key="imp.id" :value="imp.id">
                {{ imp.label }}
              </option>
            </select>
          </div>

          <div>
            <label class="text-muted-foreground block mb-1">文档来源 URL 或本地文件路径</label>
            <div class="flex items-center space-x-1.5">
              <input
                v-model="sourceUrl"
                type="text"
                :placeholder="activePlaceholder"
                class="flex-1 p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary font-mono text-[11px]"
              />
              <button
                type="button"
                @click="browseLocalFile"
                class="px-2.5 py-2 rounded bg-muted hover:bg-muted/80 text-foreground text-[11px] shrink-0 flex items-center space-x-1 transition"
                title="选择本地 JSON / YAML 文档文件"
              >
                <FolderOpen class="w-3.5 h-3.5" />
                <span>文件</span>
              </button>
            </div>
            <p
              v-if="selectedImporter?.description"
              class="text-[10px] text-muted-foreground/80 mt-1"
            >
              {{ selectedImporter.description }}
            </p>
          </div>

          <div>
            <label class="text-muted-foreground block mb-1">导入至子项目模块</label>
            <select
              v-model="targetSubDir"
              class="w-full p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="__NEW__">+ 创建新子项目模块</option>
              <option
                v-for="sub in workspaceStore.subProjects"
                :key="sub.dirName"
                :value="sub.dirName"
              >
                {{ sub.config.name }} ({{ sub.dirName }})
              </option>
            </select>
          </div>

          <div
            v-if="targetSubDir === '__NEW__'"
            class="space-y-2 p-2.5 rounded-lg bg-muted/20 border border-border"
          >
            <div>
              <label class="text-muted-foreground block mb-1 text-[11px]">新建模块名称</label>
              <input
                v-model="newSubName"
                type="text"
                placeholder="用户中心 API"
                class="w-full p-1.5 rounded bg-background border border-border text-xs"
              />
            </div>
            <div>
              <label class="text-muted-foreground block mb-1 text-[11px]">文件夹名 (英文)</label>
              <input
                v-model="newSubDir"
                type="text"
                placeholder="user_api"
                class="w-full p-1.5 rounded bg-background border border-border text-xs font-mono"
              />
            </div>
          </div>

          <div class="text-[11px] text-muted-foreground/80 leading-relaxed bg-primary/5 border border-primary/10 p-2.5 rounded-lg space-y-1">
            <div class="font-medium text-primary">💡 智能导入与无损合并规则：</div>
            <div>• <b>自动分类分组</b>：按文档 Tags / 分组归类到目录，支持在左侧折叠查看</div>
            <div>• <b>自动同步 BaseURL</b>：若文档包含服务地址，自动填充子项目 BaseURL</div>
            <div>• <b>已有接口</b>：无损保留此前填写的测试参数值、Header 与扩展数据</div>
            <div>• <b>新增接口</b>：自动按分组添加到该子项目</div>
            <div>• <b>已删除接口</b>：标记为 <code class="text-amber-400 font-mono">[已下线]</code>，坚决不删本地文件</div>
          </div>
        </div>

        <div class="flex justify-end space-x-2 pt-2">
          <button
            @click="emit('update:modelValue', false)"
            class="px-3 py-1.5 rounded text-xs text-muted-foreground hover:bg-muted"
          >
            取消
          </button>
          <button
            @click="confirmImport"
            :disabled="importing || !sourceUrl.trim()"
            class="px-4 py-1.5 rounded text-xs bg-primary text-primary-foreground font-medium hover:bg-primary/90 flex items-center space-x-1.5 disabled:opacity-50"
          >
            <Loader2 v-if="importing" class="w-3.5 h-3.5 animate-spin" />
            <span>{{ importing ? '拉取解析中...' : '开始导入' }}</span>
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { FolderOpen, Loader2 } from 'lucide-vue-next'
import { useEscapeCancel } from '@/composables/useEscapeCancel'
import { collectionImporterRegistry } from '@/core/registries/extensionRegistry'
import * as workspaceService from '@/services/workspaceService'
import { useAppStore } from '@/stores/appStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'imported', dirName: string): void
}>()

const workspaceStore = useWorkspaceStore()
const appStore = useAppStore()

const sourceUrl = ref('')
const selectedImporterId = ref<string>('auto')
const targetSubDir = ref('__NEW__')
const newSubName = ref('Imported API')
const newSubDir = ref('api_collection')
const importing = ref(false)

const importers = computed(() => collectionImporterRegistry.list())

const selectedImporter = computed(() => {
  if (selectedImporterId.value !== 'auto') {
    return importers.value.find(i => i.id === selectedImporterId.value) ?? importers.value[0] ?? null
  }
  return importers.value[0] ?? null
})

const activePlaceholder = computed(() => {
  return (
    selectedImporter.value?.sourcePlaceholder ||
    'http://localhost:8080/v3/api-docs 或本地 JSON / YAML 文件路径'
  )
})

watch(
  () => props.modelValue,
  open => {
    if (open) {
      if (importers.value.length === 1) {
        selectedImporterId.value = importers.value[0].id
      } else {
        selectedImporterId.value = 'auto'
      }

      if (selectedImporter.value?.shortLabel === 'Swagger') {
        if (newSubName.value === 'Imported API') newSubName.value = 'Swagger API'
        if (newSubDir.value === 'api_collection') newSubDir.value = 'swagger_api'
      }

      if (workspaceStore.subProjects.length > 0) {
        targetSubDir.value =
          workspaceStore.currentSubProjectDir || workspaceStore.subProjects[0].dirName
      } else {
        targetSubDir.value = '__NEW__'
      }
    }
  }
)

function close() {
  if (importing.value) return
  emit('update:modelValue', false)
}

useEscapeCancel(() => props.modelValue, close)

function openPluginsManager() {
  emit('update:modelValue', false)
  appStore.showPluginsModal = true
}

async function browseLocalFile() {
  try {
    const file = await workspaceService.pickImportFile()
    if (file) {
      sourceUrl.value = file
    }
  } catch (err: any) {
    appStore.showToast(`选择文件失败: ${err?.message || err}`, true)
  }
}

async function confirmImport() {
  if (!sourceUrl.value.trim()) return
  importing.value = true

  try {
    const isNew = targetSubDir.value === '__NEW__'
    const targetDir = isNew
      ? newSubDir.value.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'api_collection'
      : targetSubDir.value

    const res = await workspaceStore.importCollection(
      targetDir,
      sourceUrl.value.trim(),
      selectedImporterId.value,
      isNew ? { name: newSubName.value.trim() || 'API 模块' } : undefined
    )

    if (res) {
      const label = res.importer.shortLabel || res.importer.label
      emit('imported', targetDir)
      emit('update:modelValue', false)
      appStore.showToast(
        `${label} 导入成功：新增 ${res.stats.added} 个，更新 ${res.stats.updated} 个，共 ${res.stats.total} 个接口`
      )
    }
  } catch (err: any) {
    appStore.showToast(`导入失败: ${err?.message || err}`, true)
  } finally {
    importing.value = false
  }
}
</script>

