<template>
  <div class="relative w-full h-full flex flex-col border border-border rounded-lg overflow-hidden bg-background dark:bg-[#282c34]">
    <div ref="editorContainer" class="flex-1 w-full h-full text-xs font-mono overflow-auto"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { EditorView, lineNumbers, highlightActiveLineGutter, highlightActiveLine, keymap } from '@codemirror/view'
import { EditorState, Compartment, Prec } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { foldGutter, foldKeymap, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import {
  closeVariableAutocomplete,
  getScopedVariableSuggestions,
  isVariableAutocompleteActiveForOwner,
  openVariableAutocomplete,
  selectVariableAutocompleteItem,
  handleVariableAutocompleteKeyDown
} from '@/composables/useVariableAutocomplete'
import {
  findActiveVariableTrigger,
  type ActiveVariableTrigger,
  type VariableSuggestion
} from '@/core/interpolation/suggestions'

const isDark = ref(typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : true)
let classObserver: MutationObserver | null = null

const props = withDefaults(defineProps<{
  modelValue: string
  readOnly?: boolean
  language?: 'json' | 'raw'
  lineWrapping?: boolean
  enableVariables?: boolean
  subProjectDir?: string | null
}>(), {
  modelValue: '',
  readOnly: false,
  language: 'json',
  lineWrapping: false,
  enableVariables: true,
  subProjectDir: undefined
})

const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void
}>()

const editorContainer = ref<HTMLDivElement | null>(null)
let editorView: EditorView | null = null
const variableOwnerId = Symbol('codemirror-variable')

const lineWrappingComp = new Compartment()
const languageComp = new Compartment()
const themeComp = new Compartment()

function applyVariableToEditor(trigger: ActiveVariableTrigger, item: VariableSuggestion) {
  if (!editorView) return
  const token = `{{${item.key}}}`
  editorView.dispatch({
    changes: {
      from: trigger.start,
      to: trigger.replaceEnd,
      insert: token
    },
    selection: {
      anchor: trigger.start + token.length
    }
  })
  editorView.focus()
}

function syncVariablePopoverFromView(view: EditorView) {
  if (props.readOnly || !props.enableVariables || !view.hasFocus) {
    closeVariableAutocomplete(variableOwnerId)
    return
  }

  const head = view.state.selection.main.head
  const docText = view.state.doc.toString()
  const trigger = findActiveVariableTrigger(docText, head)
  if (!trigger) {
    closeVariableAutocomplete(variableOwnerId)
    return
  }

  const coords = view.coordsAtPos(trigger.start) || view.coordsAtPos(head)
  const fallbackRect = view.dom.getBoundingClientRect()
  const anchorRect = coords
    ? { left: coords.left, top: coords.top, bottom: coords.bottom }
    : { left: fallbackRect.left, top: fallbackRect.top, bottom: fallbackRect.top + 20 }

  openVariableAutocomplete({
    ownerId: variableOwnerId,
    targetElement: view.contentDOM,
    query: trigger.query,
    allSuggestions: getScopedVariableSuggestions(props.subProjectDir),
    anchorRect,
    onSelect: item => applyVariableToEditor(trigger, item)
  })
}

function runEditorVarKey(key: 'ArrowDown' | 'ArrowUp' | 'Enter' | 'Tab' | 'Escape'): boolean {
  if (!isVariableAutocompleteActiveForOwner(variableOwnerId)) return false
  if (key === 'Enter' || key === 'Tab') {
    selectVariableAutocompleteItem()
    return true
  }
  const synthetic = new KeyboardEvent('keydown', { key, cancelable: true })
  return handleVariableAutocompleteKeyDown(synthetic)
}

function initEditor() {
  if (!editorContainer.value) return

  const extensions = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    history(),
    foldGutter(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    themeComp.of(isDark.value ? oneDark : []),
    lineWrappingComp.of(props.lineWrapping ? EditorView.lineWrapping : []),
    languageComp.of(props.language === 'json' ? json() : []),
    Prec.highest(
      keymap.of([
        { key: 'ArrowDown', run: () => runEditorVarKey('ArrowDown') },
        { key: 'ArrowUp', run: () => runEditorVarKey('ArrowUp') },
        { key: 'Enter', run: () => runEditorVarKey('Enter') },
        { key: 'Tab', run: () => runEditorVarKey('Tab') },
        { key: 'Escape', run: () => runEditorVarKey('Escape') }
      ])
    ),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      ...foldKeymap
    ]),
    EditorView.domEventHandlers({
      blur: () => {
        closeVariableAutocomplete(variableOwnerId)
      }
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !props.readOnly) {
        emit('update:modelValue', update.state.doc.toString())
      }
      if (!props.readOnly && (update.docChanged || update.selectionSet)) {
        syncVariablePopoverFromView(update.view)
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

// 监听自动换行配置
watch(() => props.lineWrapping, (wrap) => {
  if (editorView) {
    editorView.dispatch({
      effects: lineWrappingComp.reconfigure(wrap ? EditorView.lineWrapping : [])
    })
  }
})

// 监听主题模式切换
watch(isDark, (dark) => {
  if (editorView) {
    editorView.dispatch({
      effects: themeComp.reconfigure(dark ? oneDark : [])
    })
  }
})

// 监听语言模式切换
watch(() => props.language, (lang) => {
  if (editorView) {
    editorView.dispatch({
      effects: languageComp.reconfigure(lang === 'json' ? json() : [])
    })
  }
})

onMounted(() => {
  initEditor()
  if (typeof document !== 'undefined') {
    classObserver = new MutationObserver(() => {
      isDark.value = document.documentElement.classList.contains('dark')
    })
    classObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })
  }
})

onBeforeUnmount(() => {
  closeVariableAutocomplete(variableOwnerId)
  if (classObserver) {
    classObserver.disconnect()
    classObserver = null
  }
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

