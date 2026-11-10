<template>
  <div
    v-if="target"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
  >
    <div class="bg-card border border-border rounded-xl p-5 w-full max-w-sm space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
      <div class="flex items-center space-x-3">
        <div class="w-8 h-8 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
          <AlertTriangle class="w-4 h-4" />
        </div>
        <div>
          <h3 class="font-semibold text-sm text-foreground">
            {{ target.type === 'subproject' ? '删除子项目模块' : '删除接口文件' }}
          </h3>
          <p class="text-[11px] text-muted-foreground mt-0.5">
            此操作不可撤销，将从本地磁盘永久删除对应文件
          </p>
        </div>
      </div>

      <div class="p-2.5 rounded-lg bg-muted/40 border border-border/60 text-xs font-mono break-all text-muted-foreground">
        {{ target.name }}
      </div>

      <div class="flex justify-end space-x-2 pt-1 text-xs">
        <button
          @click="emit('close')"
          class="px-3 py-1.5 rounded hover:bg-muted text-muted-foreground transition"
        >
          取消
        </button>
        <button
          @click="confirmDelete"
          class="px-4 py-1.5 rounded bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90 transition shadow-sm"
        >
          确认删除
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { AlertTriangle } from 'lucide-vue-next'
import { useEscapeCancel } from '@/composables/useEscapeCancel'
import { useAppStore } from '@/stores/appStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'

export interface PendingDeleteTarget {
  type: 'request' | 'subproject'
  subDir: string
  fileName?: string
  requestId?: string
  name: string
}

const props = defineProps<{
  target: PendingDeleteTarget | null
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

async function confirmDelete() {
  if (!props.target) return
  const item = props.target
  emit('close')

  try {
    if (item.type === 'request' && item.fileName) {
      await workspaceStore.deleteRequest(item.subDir, item.fileName)
      sessionStore.closeTabsForRequest(item.subDir, item.fileName, item.requestId)
      appStore.showToast(`接口 [${item.name}] 已成功删除`)
    } else if (item.type === 'subproject') {
      await workspaceStore.deleteSubProject(item.subDir)
      sessionStore.closeTabsForSubProject(item.subDir)
      appStore.showToast(`子项目 [${item.name}] 已成功删除`)
    }
  } catch (err: any) {
    appStore.showToast(`删除失败: ${err?.message || err}`, true)
  }
}
</script>

