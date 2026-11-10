import { getCurrentScope, onScopeDispose, toValue, watch, type MaybeRefOrGetter } from 'vue'
import {
  defaultEscapeStack,
  ESCAPE_PRIORITY,
  type EscapeStack
} from '@/core/shortcuts/escapeStack'

export interface UseEscapeCancelOptions {
  /** 优先级：下拉/右键菜单 = 0，普通模态框 = 10（默认），内嵌确认浮层 = 20 */
  priority?: number
  stack?: EscapeStack
}

interface ListenerState {
  count: number
  listener: (e: KeyboardEvent) => void
}

const windowListeners = new WeakMap<EscapeStack, ListenerState>()

function retainWindowListener(stack: EscapeStack): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  let state = windowListeners.get(stack)
  if (!state) {
    const listener = (e: KeyboardEvent) => {
      stack.handleKeyDown(e)
    }
    state = { count: 0, listener }
    windowListeners.set(stack, state)
    // 在冒泡阶段监听，确保输入框内 AutocompleteInput 等子控件可优先拦截并 stopPropagation()
    window.addEventListener('keydown', listener)
  }
  state.count += 1

  let released = false
  return () => {
    if (released) return
    released = true
    const current = windowListeners.get(stack)
    if (!current) return
    current.count -= 1
    if (current.count <= 0) {
      window.removeEventListener('keydown', current.listener)
      windowListeners.delete(stack)
    }
  }
}

/**
 * 为模态弹窗或浮层绑定 Esc 取消快捷键，支持嵌套浮层与多层弹窗按开启顺序依次取消。
 */
export function useEscapeCancel(
  active: MaybeRefOrGetter<unknown>,
  onCancel: () => unknown,
  options: UseEscapeCancelOptions = {}
): () => void {
  const stack = options.stack ?? defaultEscapeStack
  const priority = options.priority ?? ESCAPE_PRIORITY.MODAL

  const registration = stack.register({
    isActive: () => Boolean(toValue(active)),
    onCancel,
    priority
  })

  const releaseListener = retainWindowListener(stack)

  const stopWatch = watch(
    () => Boolean(toValue(active)),
    (isOpen, wasOpen) => {
      if (isOpen && !wasOpen) {
        registration.bringToTop()
      }
    },
    { immediate: true, flush: 'sync' }
  )

  const cleanup = () => {
    stopWatch()
    registration.dispose()
    releaseListener()
  }

  if (getCurrentScope()) {
    onScopeDispose(cleanup)
  }

  return cleanup
}

