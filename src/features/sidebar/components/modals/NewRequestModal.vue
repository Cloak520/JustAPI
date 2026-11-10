<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
  >
    <div class="bg-card border border-border rounded-xl p-5 w-full max-w-sm space-y-4 shadow-xl">
      <h3 class="font-semibold text-sm">新建请求到子项目</h3>
      <div class="space-y-3 text-xs">
        <div>
          <label class="text-muted-foreground block mb-1 font-medium">所属子项目模块</label>
          <select
            v-model="targetSubDir"
            class="w-full p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer text-foreground"
          >
            <option
              v-for="sub in workspaceStore.subProjects"
              :key="sub.dirName"
              :value="sub.dirName"
            >
              {{ sub.config.name }} ({{ sub.dirName }})
            </option>
          </select>
        </div>

        <div>
          <label class="text-muted-foreground block mb-1 font-medium">所属分组 (可选)</label>
          <div class="flex items-center space-x-1.5">
            <select
              v-model="groupChoice"
              class="flex-1 p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer text-foreground"
            >
              <option value="">(无分组 / 根目录)</option>
              <option v-for="g in availableGroups" :key="g" :value="g">📁 {{ g }}</option>
              <option value="__NEW__">+ 新建分组...</option>
            </select>
            <input
              v-if="groupChoice === '__NEW__'"
              v-model="customGroup"
              type="text"
              placeholder="新分组名称"
              class="flex-1 p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary animate-in fade-in text-foreground"
            />
          </div>
        </div>

        <div>
          <label class="text-muted-foreground block mb-1 font-medium">请求名称</label>
          <input
            v-model="reqName"
            type="text"
            placeholder="获取用户资料"
            class="w-full p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
          />
        </div>
        <div>
          <label class="text-muted-foreground block mb-1 font-medium">相对路径</label>
          <input
            v-model="reqPath"
            type="text"
            placeholder="/users/{id}"
            class="w-full p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary font-mono text-foreground"
          />
        </div>
        <div>
          <label class="text-muted-foreground block mb-1 font-medium">请求方法</label>
          <select
            v-model="reqMethod"
            class="w-full p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary font-mono cursor-pointer text-foreground"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
            <option value="PATCH">PATCH</option>
            <option value="HEAD">HEAD</option>
            <option value="OPTIONS">OPTIONS</option>
          </select>
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
          @click="confirmCreate"
          class="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground font-medium hover:bg-primary/90"
        >
          确定
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useEscapeCancel } from '@/composables/useEscapeCancel'
import { createEmptyRequest, sanitizeFileBaseName } from '@/core/models/requestFactory'
import { useAppStore } from '@/stores/appStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { HttpMethod } from '@/types'

const props = defineProps<{
  modelValue: boolean
  initialSubDir?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
}>()

const workspaceStore = useWorkspaceStore()
const sessionStore = useSessionStore()
const appStore = useAppStore()

useEscapeCancel(
  () => props.modelValue,
  () => emit('update:modelValue', false)
)

const targetSubDir = ref('')
const reqName = ref('新请求')
const reqPath = ref('/')
const reqMethod = ref<HttpMethod>('GET')
const groupChoice = ref('')
const customGroup = ref('')

watch(
  () => props.modelValue,
  open => {
    if (open) {
      targetSubDir.value =
        props.initialSubDir || workspaceStore.subProjects[0]?.dirName || ''
      reqName.value = '新请求'
      reqPath.value = '/'
      reqMethod.value = 'GET'
      groupChoice.value = ''
      customGroup.value = ''
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

async function confirmCreate() {
  if (!targetSubDir.value) return
  try {
    const cleanName = reqName.value.trim() || '未命名请求'
    const groupName =
      groupChoice.value === '__NEW__'
        ? customGroup.value.trim()
        : groupChoice.value.trim()
    const baseFname = `${sanitizeFileBaseName(cleanName, 'req')}_${Date.now().toString().slice(-4)}.json`
    const fileName = groupName ? `${groupName}/${baseFname}` : baseFname

    const newReq = createEmptyRequest({
      id: crypto.randomUUID(),
      name: cleanName,
      method: reqMethod.value,
      path: reqPath.value.trim() || '/',
      subProjectId: targetSubDir.value,
      fileName,
      group: groupName || undefined
    })

    const saved = await workspaceStore.saveRequest(targetSubDir.value, fileName, newReq)
    emit('update:modelValue', false)
    sessionStore.openTab(saved, targetSubDir.value)
  } catch (err: any) {
    appStore.showToast(`新建请求失败: ${err?.message || err}`, true)
  }
}
</script>

