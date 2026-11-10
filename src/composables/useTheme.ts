import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'

export type ThemeMode = 'dark' | 'light' | 'system'

const STORAGE_KEY = 'justapi_theme'

// 单例：跨组件共享
const mode = ref<ThemeMode>(
  (() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
    return saved === 'dark' || saved === 'light' || saved === 'system' ? saved : 'dark'
  })()
)

/** 判断系统是否偏好深色 */
function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** 将 ThemeMode 解析为实际 dark/light */
function resolveEffective(m: ThemeMode): 'dark' | 'light' {
  return m === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : m
}

/** 把主题真正应用到 DOM 和 Tauri 窗口 */
function applyTheme(m: ThemeMode) {
  const effective = resolveEffective(m)
  const root = document.documentElement
  if (effective === 'dark') {
    root.classList.add('dark')
    root.style.colorScheme = 'dark'
  } else {
    root.classList.remove('dark')
    root.style.colorScheme = 'light'
  }
  getCurrentWindow().setTheme(effective).catch(() => {})
}

let mediaQuery: MediaQueryList | null = null

function onSystemChange() {
  if (mode.value === 'system') {
    applyTheme('system')
  }
}

/** 初始化：绑定 media query 监听（只做一次） */
function initSystemListener() {
  if (typeof window === 'undefined') return
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', onSystemChange)
}

/** 在根组件卸载时调用，避免内存泄漏 */
function destroySystemListener() {
  mediaQuery?.removeEventListener('change', onSystemChange)
}

export function useTheme() {
  // 侦听 mode 变化，立即应用
  watch(mode, (m) => {
    applyTheme(m)
    localStorage.setItem(STORAGE_KEY, m)
  })

  onMounted(() => {
    initSystemListener()
    applyTheme(mode.value)
  })

  onBeforeUnmount(() => {
    destroySystemListener()
  })

  function setTheme(m: ThemeMode) {
    mode.value = m
  }

  function cycleTheme() {
    const order: ThemeMode[] = ['dark', 'light', 'system']
    const idx = order.indexOf(mode.value)
    mode.value = order[(idx + 1) % order.length]
  }

  return {
    themeMode: mode,
    setTheme,
    cycleTheme,
  }
}

