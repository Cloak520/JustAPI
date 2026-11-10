<template>
  <div class="relative w-full flex items-center">
    <input
      :id="id"
      ref="inputRef"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :class="inputClass"
      autocomplete="off"
      spellcheck="false"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeyDown"
    />

    <!-- Teleport 浮层下拉列表，彻底解决 overflow 裁剪与 WebKit 原生 datalist 无法关闭的缺陷 -->
    <Teleport to="body">
      <div
        v-if="isOpen && filteredSuggestions.length > 0"
        ref="dropdownRef"
        :style="dropdownStyle"
        class="fixed z-[9999] overflow-y-auto max-h-56 rounded-md border border-border bg-popover/95 p-1 text-popover-foreground shadow-2xl backdrop-blur-md text-xs select-none animate-in fade-in zoom-in-95 duration-100"
      >
        <div
          v-for="(item, idx) in filteredSuggestions"
          :key="item.value"
          @mousedown.prevent="selectItem(item)"
          class="flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition"
          :class="idx === activeIndex ? 'bg-primary/20 text-primary font-medium' : 'hover:bg-muted/60 text-foreground'"
        >
          <span class="font-mono truncate">{{ item.value }}</span>
          <span v-if="item.desc" class="text-[10px] text-muted-foreground ml-3 shrink-0 truncate max-w-[170px]">
            {{ item.desc }}
          </span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useVariableInput } from '@/composables/useVariableAutocomplete'
import type { HeaderSuggestion } from '@/utils/headers'

const props = withDefaults(defineProps<{
  modelValue: string
  suggestions?: Array<string | HeaderSuggestion>
  placeholder?: string
  inputClass?: string
  disabled?: boolean
  type?: string
  id?: string
  autoFocusNextId?: string
  enableVariables?: boolean
  subProjectDir?: string | null
}>(), {
  suggestions: () => [],
  placeholder: '',
  inputClass: 'w-full bg-transparent px-1.5 py-1 font-mono text-foreground focus:outline-none placeholder:text-muted-foreground/40',
  disabled: false,
  type: 'text',
  enableVariables: true,
  subProjectDir: undefined
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'input', event: Event): void
  (e: 'change', value: string): void
  (e: 'select', value: string): void
  (e: 'focus', event: FocusEvent): void
  (e: 'blur', event: FocusEvent): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const dropdownRef = ref<HTMLDivElement | null>(null)
const isOpen = ref(false)
const activeIndex = ref(0)

const variableCtrl = useVariableInput(inputRef, {
  enabled: () => props.enableVariables,
  subProjectDir: () => props.subProjectDir,
  onApplied: nextVal => {
    emit('update:modelValue', nextVal)
    emit('change', nextVal)
  }
})

const dropdownStyle = ref<Record<string, string>>({
  top: '0px',
  left: '0px',
  minWidth: '220px'
})

const normalizedSuggestions = computed<HeaderSuggestion[]>(() => {
  if (!props.suggestions || props.suggestions.length === 0) return []
  return props.suggestions.map(s => {
    if (typeof s === 'string') {
      return { value: s }
    }
    return s
  })
})

const filteredSuggestions = computed<HeaderSuggestion[]>(() => {
  const list = normalizedSuggestions.value
  if (list.length === 0) return []

  const query = (props.modelValue || '').trim().toLowerCase()
  if (!query) {
    return list.slice(0, 12)
  }

  // 优先前缀匹配，其次子串包含匹配
  const prefixMatches: HeaderSuggestion[] = []
  const otherMatches: HeaderSuggestion[] = []

  for (const item of list) {
    const valLower = item.value.toLowerCase()
    const descLower = item.desc ? item.desc.toLowerCase() : ''
    if (valLower.startsWith(query)) {
      prefixMatches.push(item)
    } else if (valLower.includes(query) || descLower.includes(query)) {
      otherMatches.push(item)
    }
  }

  return [...prefixMatches, ...otherMatches].slice(0, 12)
})

function updatePosition() {
  if (!inputRef.value) return
  const rect = inputRef.value.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    isOpen.value = false
    return
  }

  const dropdownHeight = 220
  const spaceBelow = window.innerHeight - rect.bottom
  let top = rect.bottom + 4
  if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
    top = rect.top - dropdownHeight - 4
  }

  dropdownStyle.value = {
    top: `${Math.round(top)}px`,
    left: `${Math.round(rect.left)}px`,
    minWidth: `${Math.max(rect.width, 240)}px`,
    maxWidth: '400px'
  }
}

function openDropdown() {
  if (variableCtrl.isActive.value) {
    closeDropdown()
    return
  }
  if (!props.suggestions || props.suggestions.length === 0) return
  updatePosition()
  isOpen.value = true
}

function closeDropdown() {
  isOpen.value = false
}

function scrollToActiveItem() {
  nextTick(() => {
    if (!dropdownRef.value) return
    const items = dropdownRef.value.children
    if (items[activeIndex.value]) {
      (items[activeIndex.value] as HTMLElement).scrollIntoView({ block: 'nearest' })
    }
  })
}

function onInput(e: Event) {
  const target = e.target as HTMLInputElement
  emit('update:modelValue', target.value)
  emit('input', e)
  activeIndex.value = 0
  if (variableCtrl.sync()) {
    closeDropdown()
    return
  }
  openDropdown()
}

function onFocus(e: FocusEvent) {
  if (!variableCtrl.sync()) {
    openDropdown()
  } else {
    closeDropdown()
  }
  emit('focus', e)
}

function onBlur(e: FocusEvent) {
  closeDropdown()
  variableCtrl.close()
  emit('blur', e)
}

function selectItem(item: HeaderSuggestion) {
  emit('update:modelValue', item.value)
  emit('select', item.value)
  emit('change', item.value)
  // 选定后立即关闭下拉框，彻底消除持续悬浮
  closeDropdown()

  if (props.autoFocusNextId) {
    nextTick(() => {
      const nextEl = document.getElementById(props.autoFocusNextId!)
      if (nextEl) {
        nextEl.focus()
      }
    })
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (variableCtrl.isActive.value) {
    return
  }
  if (isOpen.value && filteredSuggestions.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeIndex.value = (activeIndex.value + 1) % filteredSuggestions.value.length
      scrollToActiveItem()
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeIndex.value = (activeIndex.value - 1 + filteredSuggestions.value.length) % filteredSuggestions.value.length
      scrollToActiveItem()
      return
    }
    if (e.key === 'Enter') {
      if (filteredSuggestions.value[activeIndex.value]) {
        e.preventDefault()
        selectItem(filteredSuggestions.value[activeIndex.value])
      }
      return
    }
    if (e.key === 'Tab') {
      if (filteredSuggestions.value[activeIndex.value]) {
        selectItem(filteredSuggestions.value[activeIndex.value])
      } else {
        closeDropdown()
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeDropdown()
      return
    }
  } else if (e.key === 'ArrowDown' && props.suggestions && props.suggestions.length > 0) {
    e.preventDefault()
    openDropdown()
  }
}

function onWindowScroll() {
  if (isOpen.value) {
    updatePosition()
  }
}

watch(
  () => props.suggestions,
  () => {
    activeIndex.value = 0
  }
)

onMounted(() => {
  window.addEventListener('scroll', onWindowScroll, true)
  window.addEventListener('resize', onWindowScroll)
})

onUnmounted(() => {
  window.removeEventListener('scroll', onWindowScroll, true)
  window.removeEventListener('resize', onWindowScroll)
})

defineExpose({
  focus: () => inputRef.value?.focus(),
  inputRef
})
</script>

