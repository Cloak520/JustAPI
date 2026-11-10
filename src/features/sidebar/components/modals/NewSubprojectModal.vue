<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
  >
    <div class="bg-card border border-border rounded-xl p-5 w-full max-w-sm space-y-4 shadow-xl">
      <h3 class="font-semibold text-sm">新建子项目模块</h3>
      <div class="space-y-3 text-xs">
        <div>
          <label class="text-muted-foreground block mb-1">模块名称 (如 用户中心 / Auth)</label>
          <input
            v-model="subName"
            type="text"
            placeholder="Auth Service"
            class="w-full p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label class="text-muted-foreground block mb-1">文件夹名 (英文小写)</label>
          <input
            v-model="subDir"
            type="text"
            placeholder="auth_service"
            class="w-full p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary font-mono"
          />
        </div>
        <div>
          <label class="text-muted-foreground block mb-1">模块 BaseURL / 路径前缀 (可选)</label>
          <input
            v-model="subBase"
            type="text"
            placeholder="/auth 或 https://auth.api.com"
            class="w-full p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary font-mono"
          />
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
          :disabled="!subDir.trim()"
          class="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          创建
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useEscapeCancel } from '@/composables/useEscapeCancel'
import { useAppStore } from '@/stores/appStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'created', dirName: string): void
}>()

const workspaceStore = useWorkspaceStore()
const appStore = useAppStore()

useEscapeCancel(
  () => props.modelValue,
  () => emit('update:modelValue', false)
)

const subName = ref('')
const subDir = ref('')
const subBase = ref('')

async function confirmCreate() {
  if (!subDir.value.trim()) return
  try {
    const createdDir = await workspaceStore.createSubProject(
      subName.value,
      subDir.value,
      subBase.value
    )
    if (createdDir) {
      emit('created', createdDir)
    }
    emit('update:modelValue', false)
    subName.value = ''
    subDir.value = ''
    subBase.value = ''
  } catch (err: any) {
    appStore.showToast(`创建子项目失败: ${err?.message || err}`, true)
  }
}
</script>

