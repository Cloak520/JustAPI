<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
    <div class="flex flex-col w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
      <!-- 模态框顶部 -->
      <div class="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/40 shrink-0 select-none">
        <div class="flex items-center space-x-2">
          <div class="w-6 h-6 rounded-md bg-primary/20 text-primary flex items-center justify-center">
            <FolderPlus class="w-3.5 h-3.5" />
          </div>
          <h3 class="font-semibold text-sm">
            {{ activeTab?.subProjectDir ? '更改请求归属与分组' : '保存请求至子项目' }}
          </h3>
        </div>
        <button
          @click="close"
          class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- 模态框主体内容 -->
      <div class="p-5 space-y-4 text-xs">
        <!-- 提示：无子项目时引导创建 -->
        <div v-if="projectStore.subProjects.length === 0" class="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 space-y-1.5">
          <div class="font-medium">当前项目暂无子项目模块</div>
          <p class="text-[11px] text-muted-foreground">
            请先在左侧边栏新建子项目模块或从 Swagger 导入接口后再执行保存。
          </p>
        </div>

        <template v-else>
          <!-- 1. 请求名称 -->
          <div class="space-y-1.5">
            <label class="text-foreground font-medium flex items-center justify-between">
              <span>请求名称</span>
              <span class="text-[10px] text-muted-foreground font-normal">支持直接重命名</span>
            </label>
            <div class="flex items-center space-x-2">
              <span
                class="font-mono font-bold text-[10px] px-2 py-1.5 rounded bg-muted border border-border shrink-0 select-none"
                :class="getMethodColor(store.method)"
              >
                {{ store.method }}
              </span>
              <input
                v-model="requestName"
                type="text"
                placeholder="例如: 获取用户详情"
                class="flex-1 text-xs px-3 py-1.5 rounded-lg bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                @keydown.enter="confirmSave"
              />
            </div>
          </div>

          <!-- 2. 目标子项目选择器 -->
          <div class="space-y-1.5">
            <label class="text-foreground font-medium flex items-center justify-between">
              <span>目标子项目模块</span>
              <span class="text-[10px] text-muted-foreground font-normal">指定持久化目录</span>
            </label>
            <select
              v-model="targetSubDir"
              class="w-full text-xs px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground cursor-pointer"
            >
              <option
                v-for="sub in projectStore.subProjects"
                :key="sub.dir_name"
                :value="sub.dir_name"
              >
                {{ sub.config.name }} ({{ sub.dir_name }})
              </option>
            </select>

            <!-- 目标子项目 BaseURL 与继承信息 -->
            <div v-if="targetSubDir" class="flex items-center space-x-1.5 text-[11px] text-muted-foreground pt-0.5">
              <Globe class="w-3 h-3 text-primary/80 shrink-0" />
              <span class="truncate">BaseURL: <span class="font-mono text-foreground/90">{{ previewBaseUrl || '继承主项目根地址' }}</span></span>
            </div>
          </div>

          <!-- 3. 所属分组 (Swagger Tag / 目录分类) -->
          <div class="space-y-1.5">
            <label class="text-foreground font-medium flex items-center justify-between">
              <span>所属接口分组 (可选)</span>
              <span class="text-[10px] text-muted-foreground font-normal">用于树形目录收纳</span>
            </label>

            <div class="flex items-center space-x-2">
              <select
                v-model="groupChoice"
                class="flex-1 text-xs px-3 py-1.5 rounded-lg bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground cursor-pointer"
              >
                <option value="">(无分组 / 子项目根目录)</option>
                <option v-for="g in availableGroups" :key="g" :value="g">
                  📁 {{ g }}
                </option>
                <option value="__NEW_GROUP__">+ 新建分组...</option>
              </select>

              <!-- 自定义新分组输入框 -->
              <input
                v-if="groupChoice === '__NEW_GROUP__'"
                v-model="customGroupName"
                type="text"
                placeholder="输入新分组名称"
                class="flex-1 text-xs px-3 py-1.5 rounded-lg bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground animate-in fade-in"
                @keydown.enter="confirmSave"
              />
            </div>
          </div>

          <!-- 4. 路径预览 -->
          <div class="p-2.5 rounded-lg bg-muted/40 border border-border/60 text-[11px] space-y-1">
            <div class="text-muted-foreground flex items-center justify-between">
              <span>文件存储位置:</span>
              <span class="font-mono text-[10px] text-muted-foreground/70">{{ targetSubDir }}/</span>
            </div>
            <div class="font-mono text-foreground/90 truncate flex items-center space-x-1">
              <Folder class="w-3 h-3 text-amber-400 shrink-0" />
              <span class="truncate">{{ targetSubDir }} / {{ effectiveGroupName ? `${effectiveGroupName} / ` : '' }}{{ previewFileName }}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- 模态框底部按钮 -->
      <div class="flex items-center justify-end space-x-2 px-5 py-3 border-t border-border bg-muted/40 shrink-0">
        <button
          @click="close"
          class="px-3.5 py-1.5 rounded-lg border border-border hover:bg-muted text-xs transition"
        >
          取消
        </button>
        <button
          @click="confirmSave"
          :disabled="projectStore.subProjects.length === 0 || isSaving"
          class="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-xs transition shadow-sm disabled:opacity-50"
        >
          <Loader2 v-if="isSaving" class="w-3.5 h-3.5 animate-spin" />
          <Save v-else class="w-3.5 h-3.5" />
          <span>{{ isSaving ? '保存中...' : '确认保存' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { FolderPlus, X, Save, Globe, Folder, Loader2 } from 'lucide-vue-next'
import { useRequestStore } from '@/stores/requestStore'
import { useProjectStore } from '@/stores/projectStore'
import { useTabStore } from '@/stores/tabStore'
import type { ApiRequest } from '@/types'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'saved', req: ApiRequest): void
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const store = useRequestStore()
const projectStore = useProjectStore()
const tabStore = useTabStore()

const activeTab = computed(() => tabStore.tabs.find(t => t.id === tabStore.activeTabId))

const requestName = ref('')
const targetSubDir = ref('')
const groupChoice = ref('')
const customGroupName = ref('')
const isSaving = ref(false)

// 当弹窗打开时，初始化字段
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      requestName.value = activeTab.value?.title || store.path || '未命名请求'

      // 默认选中当前 Tab 的子项目，或最近子项目，或第一个子项目
      if (activeTab.value?.subProjectDir) {
        targetSubDir.value = activeTab.value.subProjectDir
      } else if (projectStore.currentSubProjectDir) {
        targetSubDir.value = projectStore.currentSubProjectDir
      } else if (projectStore.subProjects.length > 0) {
        targetSubDir.value = projectStore.subProjects[0].dir_name
      }

      // 默认分组
      const currentGroup = activeTab.value?.group || store.group || ''
      if (currentGroup) {
        groupChoice.value = currentGroup
      } else {
        groupChoice.value = ''
      }
      customGroupName.value = ''
    }
  }
)

// 当前选中子项目所拥有的分组列表
const availableGroups = computed(() => {
  if (!targetSubDir.value) return []
  const sub = projectStore.subProjects.find(s => s.dir_name === targetSubDir.value)
  if (!sub) return []

  const set = new Set<string>()
  for (const req of sub.requests) {
    if (req.group && req.group.trim()) {
      set.add(req.group.trim())
    }
  }
  return Array.from(set).sort()
})

// 目标子项目的 BaseURL
const previewBaseUrl = computed(() => {
  if (!targetSubDir.value) return ''
  return projectStore.resolveEffectiveBaseUrl(targetSubDir.value)
})

// 实际生效的分组名称
const effectiveGroupName = computed(() => {
  if (groupChoice.value === '__NEW_GROUP__') {
    return customGroupName.value.trim()
  }
  return groupChoice.value.trim()
})

// 预览生成的文件名
const previewFileName = computed(() => {
  const name = requestName.value.trim() || 'req'
  const clean = name.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_')
  if (activeTab.value?.fileName) {
    const raw = activeTab.value.fileName.includes('/')
      ? activeTab.value.fileName.split('/').pop()!
      : activeTab.value.fileName
    return raw
  }
  return `${clean}.json`
})

function getMethodColor(method: string) {
  switch (method?.toUpperCase()) {
    case 'GET': return 'text-emerald-400'
    case 'POST': return 'text-amber-400'
    case 'PUT': return 'text-blue-400'
    case 'DELETE': return 'text-rose-400'
    case 'PATCH': return 'text-purple-400'
    default: return 'text-foreground'
  }
}

function close() {
  isOpen.value = false
}

async function confirmSave() {
  if (!targetSubDir.value) return
  isSaving.value = true

  try {
    const subDir = targetSubDir.value
    const groupName = effectiveGroupName.value || undefined
    const reqName = requestName.value.trim() || '未命名请求'
    const currTab = activeTab.value

    const baseFname = currTab?.fileName
      ? (currTab.fileName.includes('/') ? currTab.fileName.split('/').pop()! : currTab.fileName)
      : `${reqName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_')}_${Date.now().toString().slice(-4)}.json`

    const newFileName = groupName ? `${groupName}/${baseFname}` : baseFname

    // 如果原来在另外的子项目或旧文件名，先清理旧文件 (迁移逻辑)
    if (currTab?.subProjectDir && currTab?.fileName && projectStore.projectPath) {
      const isMovedSub = currTab.subProjectDir !== subDir
      const isMovedFile = currTab.fileName !== newFileName
      if (isMovedSub || isMovedFile) {
        try {
          await projectStore.deleteRequest(currTab.subProjectDir, currTab.fileName)
        } catch (e) {
          console.warn('清理旧位置请求文件失败 (可忽略):', e)
        }
      }
    }

    const reqId = currTab?.requestId || crypto.randomUUID()
    const reqToSave: ApiRequest = {
      id: reqId,
      name: reqName,
      method: store.method,
      path: store.path,
      pathParams: store.pathParams,
      queryParams: store.queryParams,
      headers: store.headers,
      bodyType: store.bodyType,
      bodyContent: store.bodyContent,
      subProjectId: subDir,
      fileName: newFileName,
      group: groupName
    }

    // 保存至磁盘并更新 store
    await projectStore.saveRequest(subDir, newFileName, reqToSave)

    // 更新当前 Tab 状态
    if (currTab) {
      currTab.title = reqName
      currTab.subProjectDir = subDir
      currTab.fileName = newFileName
      currTab.requestId = reqId
      currTab.group = groupName
      currTab.isDirty = false
    }

    // 同步更新请求构建器当前环境与分组
    store.group = groupName || ''
    projectStore.currentSubProjectDir = subDir
    store.baseUrl = projectStore.resolveEffectiveBaseUrl(subDir)

    emit('saved', reqToSave)
    close()
  } catch (err: any) {
    alert(`保存请求失败: ${err?.message || err}`)
  } finally {
    isSaving.value = false
  }
}
</script>

