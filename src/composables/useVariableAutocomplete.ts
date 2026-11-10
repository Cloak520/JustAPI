import { computed, nextTick, onBeforeUnmount, reactive, ref, watch, type Ref } from 'vue'
import { defaultVariableEngine } from '@/core/interpolation/engine'
import {
  applyVariableSuggestion,
  buildVariableSuggestions,
  filterVariableSuggestions,
  findActiveVariableTrigger,
  type ActiveVariableTrigger,
  type VariableSuggestion
} from '@/core/interpolation/suggestions'
import { useSessionStore } from '@/stores/sessionStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'

export interface VariableAutocompleteRect {
  left: number
  top: number
  bottom: number
}

interface VariableAutocompleteState {
  ownerId: symbol | null
  targetElement: HTMLElement | null
  query: string
  suggestions: VariableSuggestion[]
  activeIndex: number
  anchorRect: VariableAutocompleteRect
  onSelect: ((item: VariableSuggestion) => void) | null
}

const state = reactive<VariableAutocompleteState>({
  ownerId: null,
  targetElement: null,
  query: '',
  suggestions: [],
  activeIndex: 0,
  anchorRect: { left: 0, top: 0, bottom: 0 },
  onSelect: null
})

const handledEnterEvents = new WeakSet<KeyboardEvent>()

export const isVariableAutocompleteOpen = computed(
  () => state.ownerId !== null && state.suggestions.length > 0
)

export function getVariableAutocompleteState() {
  return state
}

export function isVariableAutocompleteActiveForOwner(ownerId: symbol): boolean {
  return state.ownerId === ownerId && state.suggestions.length > 0
}

export function isVariableAutocompleteActiveForElement(el: EventTarget | null): boolean {
  return Boolean(el && state.ownerId !== null && state.suggestions.length > 0 && state.targetElement === el)
}

export function wasVariableAutocompleteEnterHandled(e: KeyboardEvent): boolean {
  return handledEnterEvents.has(e)
}

export function openVariableAutocomplete(params: {
  ownerId: symbol
  targetElement: HTMLElement | null
  query: string
  allSuggestions: VariableSuggestion[]
  anchorRect: VariableAutocompleteRect
  onSelect: (item: VariableSuggestion) => void
}): boolean {
  const filtered = filterVariableSuggestions(params.allSuggestions, params.query)
  if (filtered.length === 0) {
    if (state.ownerId === params.ownerId) {
      closeVariableAutocomplete(params.ownerId)
    }
    return false
  }

  const keepIndex =
    state.ownerId === params.ownerId && state.activeIndex < filtered.length
      ? state.activeIndex
      : 0

  state.ownerId = params.ownerId
  state.targetElement = params.targetElement
  state.query = params.query
  state.suggestions = filtered
  state.activeIndex = keepIndex
  state.anchorRect = params.anchorRect
  state.onSelect = params.onSelect
  return true
}

export function closeVariableAutocomplete(ownerId?: symbol) {
  if (ownerId && state.ownerId !== ownerId) return
  state.ownerId = null
  state.targetElement = null
  state.query = ''
  state.suggestions = []
  state.activeIndex = 0
  state.onSelect = null
}

export function selectVariableAutocompleteItem(item?: VariableSuggestion) {
  const chosen = item || state.suggestions[state.activeIndex]
  const callback = state.onSelect
  closeVariableAutocomplete()
  if (chosen && callback) {
    callback(chosen)
  }
}

export function handleVariableAutocompleteKeyDown(e: KeyboardEvent): boolean {
  if (!isVariableAutocompleteOpen.value || e.isComposing) return false

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()
    state.activeIndex = (state.activeIndex + 1) % state.suggestions.length
    return true
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()
    state.activeIndex =
      (state.activeIndex - 1 + state.suggestions.length) % state.suggestions.length
    return true
  }

  if (e.key === 'Enter' || e.key === 'Tab') {
    if (e.key === 'Enter') {
      handledEnterEvents.add(e)
    }
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()
    selectVariableAutocompleteItem()
    return true
  }

  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()
    closeVariableAutocomplete()
    return true
  }

  return false
}

export function getScopedVariableSuggestions(subProjectDir?: string | null): VariableSuggestion[] {
  const workspaceStore = useWorkspaceStore()
  const sessionStore = useSessionStore()
  const resolvedSubDir =
    subProjectDir === undefined ? sessionStore.activeTab?.subProjectDir : subProjectDir
  const varMap = workspaceStore.getEffectiveVariableMap(resolvedSubDir || undefined)
  return buildVariableSuggestions(varMap, defaultVariableEngine.listProviders())
}

const MIRROR_STYLE_PROPS = [
  'boxSizing',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'tabSize',
  'textTransform',
  'wordSpacing'
] as const

export function measureTextControlCaretRect(
  el: HTMLInputElement | HTMLTextAreaElement,
  pos: number
): VariableAutocompleteRect {
  const rect = el.getBoundingClientRect()
  if (typeof document === 'undefined' || !window.getComputedStyle) {
    return { left: rect.left, top: rect.top, bottom: rect.bottom }
  }

  const computedStyle = window.getComputedStyle(el)
  const mirror = document.createElement('div')
  const isTextarea = el.tagName.toLowerCase() === 'textarea'

  mirror.style.position = 'fixed'
  mirror.style.visibility = 'hidden'
  mirror.style.pointerEvents = 'none'
  mirror.style.top = '-9999px'
  mirror.style.left = '-9999px'
  mirror.style.overflow = 'hidden'

  for (const prop of MIRROR_STYLE_PROPS) {
    mirror.style[prop] = computedStyle[prop]
  }

  if (isTextarea) {
    mirror.style.whiteSpace = 'pre-wrap'
    mirror.style.wordWrap = 'break-word'
    mirror.style.width = `${rect.width}px`
  } else {
    mirror.style.whiteSpace = 'pre'
    mirror.style.width = 'auto'
  }

  const before = el.value.slice(0, pos)
  mirror.appendChild(document.createTextNode(before))
  const marker = document.createElement('span')
  marker.textContent = '\u200b'
  mirror.appendChild(marker)

  document.body.appendChild(mirror)
  try {
    const lineH = parseFloat(computedStyle.lineHeight) || rect.height || 20
    const rawLeft = rect.left + marker.offsetLeft - el.scrollLeft
    const rawTop = rect.top + marker.offsetTop - el.scrollTop

    const clampedLeft = Math.max(rect.left, Math.min(rawLeft, Math.max(rect.left, rect.right - 24)))
    const clampedTop = Math.max(rect.top, Math.min(rawTop, Math.max(rect.top, rect.bottom - 16)))
    const clampedBottom = Math.min(rect.bottom, clampedTop + Math.min(lineH, rect.height || lineH))

    return {
      left: clampedLeft,
      top: clampedTop,
      bottom: Math.max(clampedTop + 14, clampedBottom)
    }
  } finally {
    mirror.remove()
  }
}

export interface UseVariableInputOptions {
  enabled?: boolean | (() => boolean)
  subProjectDir?: () => string | null | undefined
  onApplied?: (nextValue: string) => void
}

/**
 * 为任意 `<input>` 或 `<textarea>` 挂载 `{{变量}}` 联想能力
 */
export function useVariableInput(
  elRef: Ref<HTMLInputElement | HTMLTextAreaElement | null | undefined>,
  options: UseVariableInputOptions = {}
) {
  const ownerId = Symbol('variable-input')

  function isEnabled(): boolean {
    if (typeof options.enabled === 'function') return options.enabled()
    return options.enabled ?? true
  }

  function applySuggestionToElement(
    el: HTMLInputElement | HTMLTextAreaElement,
    trigger: ActiveVariableTrigger,
    item: VariableSuggestion
  ) {
    const { nextText, nextCursor } = applyVariableSuggestion(el.value, trigger, item.key)
    el.value = nextText
    try {
      el.setSelectionRange(nextCursor, nextCursor)
    } catch {
      // ignore selection failures on unsupported input types
    }
    el.dispatchEvent(new Event('input', { bubbles: true }))
    options.onApplied?.(nextText)

    void nextTick(() => {
      try {
        el.focus()
        el.setSelectionRange(nextCursor, nextCursor)
      } catch {
        // ignore selection failures on unmounted / unsupported input types
      }
    })
  }

  function syncFromElement(el: HTMLInputElement | HTMLTextAreaElement) {
    if (!isEnabled()) {
      closeVariableAutocomplete(ownerId)
      return false
    }

    const cursorPos = el.selectionStart ?? el.value.length
    const trigger = findActiveVariableTrigger(el.value, cursorPos)
    if (!trigger) {
      closeVariableAutocomplete(ownerId)
      return false
    }

    const allSuggestions = getScopedVariableSuggestions(options.subProjectDir?.())
    const anchorRect = measureTextControlCaretRect(el, trigger.start)
    return openVariableAutocomplete({
      ownerId,
      targetElement: el,
      query: trigger.query,
      allSuggestions,
      anchorRect,
      onSelect: item => applySuggestionToElement(el, trigger, item)
    })
  }

  function handleInput(e: Event) {
    syncFromElement(e.currentTarget as HTMLInputElement | HTMLTextAreaElement)
  }

  function handleClick(e: Event) {
    syncFromElement(e.currentTarget as HTMLInputElement | HTMLTextAreaElement)
  }

  function handleKeyUp(e: Event) {
    const ke = e as KeyboardEvent
    if (
      ke.key === 'ArrowLeft' ||
      ke.key === 'ArrowRight' ||
      ke.key === 'Home' ||
      ke.key === 'End'
    ) {
      syncFromElement(e.currentTarget as HTMLInputElement | HTMLTextAreaElement)
    }
  }

  function handleBlur() {
    closeVariableAutocomplete(ownerId)
  }

  watch(
    elRef,
    (el, prevEl) => {
      if (prevEl) {
        prevEl.removeEventListener('input', handleInput)
        prevEl.removeEventListener('click', handleClick)
        prevEl.removeEventListener('keyup', handleKeyUp)
        prevEl.removeEventListener('blur', handleBlur)
        closeVariableAutocomplete(ownerId)
      }
      if (el) {
        el.addEventListener('input', handleInput)
        el.addEventListener('click', handleClick)
        el.addEventListener('keyup', handleKeyUp)
        el.addEventListener('blur', handleBlur)
      }
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    const el = elRef.value
    if (el) {
      el.removeEventListener('input', handleInput)
      el.removeEventListener('click', handleClick)
      el.removeEventListener('keyup', handleKeyUp)
      el.removeEventListener('blur', handleBlur)
    }
    closeVariableAutocomplete(ownerId)
  })

  return {
    ownerId,
    isActive: computed(() => isVariableAutocompleteActiveForOwner(ownerId)),
    sync: () => {
      if (elRef.value) return syncFromElement(elRef.value)
      return false
    },
    close: () => closeVariableAutocomplete(ownerId)
  }
}
