<template>
  <div class="relative w-full h-full flex flex-col border border-border rounded-lg overflow-hidden bg-[#282c34]">
    <div ref="editorContainer" class="flex-1 w-full h-full text-xs font-mono overflow-auto"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { EditorView, lineNumbers, highlightActiveLineGutter, highlightActiveLine, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { foldGutter, foldKeymap, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'

const props = withDefaults(defineProps<{
  modelValue: string
  readOnly?: boolean
  language?: 'json' | 'raw'
}>(), {
  modelValue: '',
  readOnly: false,
  language: 'json'
})

const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void
}>()

const editorContainer = ref<HTMLDivElement | null>(null)
let editorView: EditorView | null = null

function initEditor() {
  if (!editorContainer.value) return

  const extensions = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    history(),
    foldGutter(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    oneDark,
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...foldKeymap
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !props.readOnly) {
        emit('update:modelValue', update.state.doc.toString())
      }
    }),
    EditorState.readOnly.of(props.readOnly),
    EditorView.theme({
      '&': { height: '100%', fontSize: '12px' },
      '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
      '.cm-content': { padding: '8px 0' },
      '.cm-line': { padding: '0 8px' }
    })
  ]

  if (props.language === 'json') {
    extensions.push(json())
  }

  const state = EditorState.create({
    doc: props.modelValue,
    extensions
  })

  editorView = new EditorView({
    state,
    parent: editorContainer.value
  })
}

// 监听外部 modelValue 变动同步到编辑器内部
watch(() => props.modelValue, (newVal) => {
  if (editorView && editorView.state.doc.toString() !== newVal) {
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: newVal
      }
    })
  }
})

onMounted(() => {
  initEditor()
})

onBeforeUnmount(() => {
  if (editorView) {
    editorView.destroy()
    editorView = null
  }
})
</script>

<style>
/* 确保 CodeMirror 容器填满高度 */
.cm-editor {
  height: 100% !important;
}
</style>
