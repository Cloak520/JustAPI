<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
  >
    <div class="flex flex-col w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
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

      <div class="p-5 space-y-4 text-xs">
        <div
          v-if="workspaceStore.subProjects.length === 0"
          class="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 space-y-1.5"
        >
          <div class="font-medium">当前项目暂无子项目模块</div>
          <p class="text-[11px] text-muted-foreground">
            请先在左侧边栏新建子项目模块或导入接口文档后再执行保存。
          </p>
        </div>

        <template v-else>
          <div class="space-y-1.5">
            <label class="text-foreground font-medium flex items-center justify-between">
              <span>请求名称</span>
              <span class="text-[10px] text-muted-foreground font-normal">支持直接重命名</span>
            </label>
            <div class="flex items-center space-x-2">
              <span
                class="font-mono font-bold text-[10px] px-2 py-1.5 rounded bg-muted border border-border shrink-0 select-none"
                :class="getMethodTextColor(sessionStore.activeRequest.method)"
              >
                {{ sessionStore.activeRequest.method }}
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
                v-for="sub in workspaceStore.subProjects"
                :key="sub.dirName"
                :value="sub.dirName"
              >
                {{ sub.config.name }} ({{ sub.dirName }})
              </option>
            </select>

            <div v-if="targetSubDir" class="flex items-center space-x-1.5 text-[11px] text-muted-foreground pt-0.5">
              <Globe class="w-3 h-3 text-primary/80 shrink-0" />
              <span class="truncate">
                BaseURL:
                <span class="font-mono text-foreground/90">{{ previewBaseUrl || '继承主项目根地址' }}</span>
              </span>
            </div>
          </div>

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
                <option v-for="g in availableGroups" :key="g" :value="g">📁 {{ g }}</option>
                <option value="__NEW_GROUP__">+ 新建分组...</option>
              </select>

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

          <div class="p-2.5 rounded-lg bg-muted/40 border border-border/60 text-[11px] space-y-1">
            <div class="text-muted-foreground flex items-center justify-between">
              <span>文件存储位置:</span>
              <span class="font-mono text-[10px] text-muted-foreground/70">{{ targetSubDir }}/</span>
            </div>
            <div class="font-mono text-foreground/90 truncate flex items-center space-x-1">
              <Folder class="w-3 h-3 text-amber-400 shrink-0" />
              <span class="truncate">
                {{ targetSubDir }} / {{ effectiveGroupName ? `${effectiveGroupName} / ` : '' }}{{ previewFileName }}
              </span>
            </div>
          </div>
        </template>
      </div>

      <div class="flex items-center justify-end space-x-2 px-5 py-3 border-t border-border bg-muted/40 shrink-0">
        <button
          @click="close"
          class="px-3.5 py-1.5 rounded-lg border border-border hover:bg-muted text-xs transition"
        >
          取消
        </button>
        <button
          @click="confirmSave"
          :disabled="workspaceStore.subProjects.length === 0 || isSaving"
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
import { computed, ref, watch } from 'vue'
import { Folder, FolderPlus, Globe, Loader2, Save, X } from 'lucide-vue-next'
import { useEscapeCancel } from '@/composables/useEscapeCancel'
import { sanitizeFileBaseName } from '@/core/models/requestFactory'
import { useAppStore } from '@/stores/appStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { ApiRequest } from '@/types'
import { getMethodTextColor } from '@/utils/methodStyle'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'saved', req: ApiRequest): void
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v)
})

const workspaceStore = useWorkspaceStore()
const sessionStore = useSessionStore()
const appStore = useAppStore()

const activeTab = computed(() => sessionStore.activeTab)

const requestName = ref('')
const targetSubDir = ref('')
const groupChoice = ref('')
const customGroupName = ref('')
const isSaving = ref(false)

watch(
  () => props.modelValue,
  open => {
    if (open) {
      requestName.value =
        activeTab.value?.title || sessionStore.activeRequest.path || '未命名请求'

      if (activeTab.value?.subProjectDir) {
        targetSubDir.value = activeTab.value.subProjectDir
      } else if (workspaceStore.currentSubProjectDir) {
        targetSubDir.value = workspaceStore.currentSubProjectDir
      } else if (workspaceStore.subProjects.length > 0) {
        targetSubDir.value = workspaceStore.subProjects[0].dirName
      } else {
        targetSubDir.value = ''
      }

      const currentGroup =
        activeTab.value?.group || sessionStore.activeRequest.group || ''
      groupChoice.value = currentGroup || ''
      customGroupName.value = ''
    }
  }
)

const availableGroups = computed(() => {
  if (!targetSubDir.value) return []
  const sub = workspaceStore.findSubProject(targetSubDir.value)
  if (!sub) return []

  const set = new Set<string>()
  for (const r of sub.requests) {
    if (r.group && r.group.trim()) {
      set.add(r.group.trim())
    }
  }
  return Array.from(set).sort()
})

const previewBaseUrl = computed(() => {
  if (!targetSubDir.value) return ''
  return workspaceStore.resolveEffectiveBaseUrl(targetSubDir.value)
})

const effectiveGroupName = computed(() => {
  if (groupChoice.value === '__NEW_GROUP__') {
    return customGroupName.value.trim()
  }
  return groupChoice.value.trim()
})

const previewFileName = computed(() => {
  const name = requestName.value.trim() || 'req'
  const clean = sanitizeFileBaseName(name, 'req')
  if (activeTab.value?.fileName) {
    return activeTab.value.fileName.includes('/')
      ? activeTab.value.fileName.split('/').pop()!
      : activeTab.value.fileName
  }
  return `${clean}.json`
})

function close() {
  isOpen.value = false
}

useEscapeCancel(isOpen, () => {
  if (isSaving.value) return
  close()
})

async function confirmSave() {
  if (!targetSubDir.value) return
  isSaving.value = true

  try {
    const saved = await sessionStore.saveActiveTab({
      subProjectDir: targetSubDir.value,
      group: effectiveGroupName.value || undefined,
      name: requestName.value.trim() || '未命名请求'
    })

    if (saved) {
      appStore.showToast(`接口已保存: ${saved.name}`)
      emit('saved', saved)
      close()
    }
  } catch (err: any) {
    appStore.showToast(`保存请求失败: ${err?.message || err}`, true)
  } finally {
    isSaving.value = false
  }
}
</script>
