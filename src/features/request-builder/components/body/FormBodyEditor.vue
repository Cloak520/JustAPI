<template>
  <div class="flex-1 min-h-0 flex flex-col space-y-2 overflow-hidden">
    <div class="text-[11px] text-muted-foreground shrink-0">键值对表单配置：</div>
    <div class="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
      <div
        v-for="(field, index) in formFields"
        :key="field.id || index"
        class="grid grid-cols-[36px_1fr_1.5fr_60px_36px] items-center gap-2 px-2 py-1 bg-card/40 border border-border rounded"
      >
        <input type="checkbox" v-model="field.enabled" class="rounded border-border text-primary" />
        <AutocompleteInput
          v-model="field.key"
          placeholder="Key"
          input-class="w-full bg-transparent font-mono text-xs focus:outline-none"
        />
        <div class="flex items-center space-x-1 min-w-0">
          <div class="flex-1 min-w-0">
            <AutocompleteInput
              v-model="field.value"
              :enable-variables="!field.is_file"
              :placeholder="field.is_file ? '点击选择文件或手动输入路径' : 'Value (文本，支持 {{变量}})'"
              input-class="w-full min-w-0 bg-transparent font-mono text-xs focus:outline-none truncate"
            />
          </div>
          <button
            v-if="field.is_file"
            type="button"
            @click="chooseFileForField(field)"
            class="px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-[10px] text-primary border border-border font-sans shrink-0 transition"
            title="浏览并选择本地文件"
          >
            浏览...
          </button>
        </div>
        <label
          v-if="sessionStore.activeRequest.bodyType === 'form-data'"
          class="flex items-center space-x-1 text-[10px] text-muted-foreground cursor-pointer"
        >
          <input type="checkbox" v-model="field.is_file" />
          <span>文件</span>
        </label>
        <button @click="removeField(index)" class="text-muted-foreground hover:text-destructive text-xs">×</button>
      </div>
    </div>
    <div class="shrink-0 pt-1">
      <button
        @click="addFormField"
        class="text-xs text-primary font-medium hover:underline"
      >
        + 添加字段
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AutocompleteInput from '@/components/common/AutocompleteInput.vue'
import { createDefaultFormField } from '@/core/models/requestFactory'
import * as transportService from '@/services/transportService'
import { useAppStore } from '@/stores/appStore'
import { useSessionStore } from '@/stores/sessionStore'
import type { FormField } from '@/types'

const sessionStore = useSessionStore()
const appStore = useAppStore()

const formFields = computed<FormField[]>(() => {
  const req = sessionStore.activeRequest
  if (!req.formFields) {
    req.formFields = []
  }
  return req.formFields
})

function addFormField() {
  formFields.value.push(createDefaultFormField())
}

function removeField(index: number) {
  formFields.value.splice(index, 1)
}

async function chooseFileForField(field: FormField) {
  try {
    const selected = await transportService.pickFile()
    if (selected) {
      field.value = selected
      sessionStore.markCurrentDirty(true)
    }
  } catch (err: any) {
    appStore.showToast(`选择文件失败: ${err?.message || err}`, true)
  }
}
</script>

