<template>
  <div class="flex-1 min-h-0 overflow-hidden">
    <CodeEditor v-model="sessionStore.activeRequest.bodyContent" language="raw" />
  </div>
</template>

<script setup lang="ts">
import CodeEditor from '@/components/common/CodeEditor.vue'
import { useSessionStore } from '@/stores/sessionStore'

const sessionStore = useSessionStore()
</script>

