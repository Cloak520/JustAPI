<template>
  <div
    v-if="target"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
  >
    <div class="bg-card border border-border rounded-xl p-5 w-full max-w-sm space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <Edit3 class="w-4 h-4 text-primary" />
          <h3 class="font-semibold text-sm">编辑接口信息</h3>
        </div>
        <span class="text-[10px] text-muted-foreground font-mono truncate max-w-[150px]">
          {{ target.fileName }}
        </span>
      </div>

      <div class="space-y-3 text-xs">
        <div class="space-y-1">
          <label class="text-muted-foreground font-medium">接口名称</label>
          <input
            v-model="newTitle"
            type="text"
            ref="titleInputRef"
            @keydown.enter="confirmRename"
            placeholder="输入接口名称"
            class="w-full text-xs px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
          />
        </div>
        <div class="space-y-1">
          <label class="text-muted-foreground font-medium">请求路径 / 完整 URL</label>
          <input
            v-model="newPath"
            type="text"
            @keydown.enter="confirmRename"
            placeholder="/api/v1/... 或 https://..."
            class="w-full text-xs px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary font-mono text-foreground"
          />
        </div>
      </div>

      <div class="flex justify-end space-x-2 pt-1 text-xs">
        <button
          @click="emit('close')"
          class="px-3 py-1.5 rounded hover:bg-muted text-muted-foreground transition"
        >
          取消
        </button>
        <button
          @click="confirmRename"
          :disabled="!newTitle.trim()"
          class="px-4 py-1.5 rounded bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition shadow-sm disabled:opacity-50"
        >
          确定
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { Edit3 } from 'lucide-vue-next'
import { useEscapeCancel } from '@/composables/useEscapeCancel'
import { structuredCloneSafe } from '@/core/models/requestFactory'
import { useAppStore } from '@/stores/appStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { ApiRequest } from '@/types'

export interface RenameTarget {
  subDir: string
  fileName: string
  req: ApiRequest
}

const props = defineProps<{
  target: RenameTarget | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const workspaceStore = useWorkspaceStore()
const sessionStore = useSessionStore()
const appStore = useAppStore()

useEscapeCancel(
  () => Boolean(props.target),
  () => emit('close')
)

const newTitle = ref('')
const newPath = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)

watch(
  () => props.target,
  t => {
    if (t) {
      newTitle.value = t.req.name || ''
      newPath.value = t.req.path || ''
      nextTick(() => {
        titleInputRef.value?.focus()
        titleInputRef.value?.select()
      })
    }
  }
)

async function confirmRename() {
  if (!props.target || !newTitle.value.trim()) return
  const { subDir, fileName, req } = props.target
  const titleVal = newTitle.value.trim()
  const pathVal = newPath.value.trim() || req.path || '/'
  emit('close')

  try {
    const updated: ApiRequest = {
      ...structuredCloneSafe(req),
      name: titleVal,
      path: pathVal
    }
    await workspaceStore.saveRequest(subDir, fileName, updated)
    sessionStore.syncRenamedRequest(subDir, fileName, updated.id, titleVal, pathVal)
    appStore.showToast(`接口信息已更新: ${titleVal}`)
  } catch (err: any) {
    appStore.showToast(`更新接口失败: ${err?.message || err}`, true)
  }
}
</script>

