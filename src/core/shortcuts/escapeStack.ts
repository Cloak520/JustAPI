export const ESCAPE_PRIORITY = {
  DROPDOWN: 0,
  MODAL: 10,
  OVERLAY: 20
} as const

export interface EscapeLayerOptions {
  isActive: () => boolean
  onCancel: () => unknown
  priority?: number
}

export interface EscapeRegistration {
  bringToTop: () => void
  dispose: () => void
}

export interface EscapeKeyLikeEvent {
  key: string
  defaultPrevented?: boolean
  isComposing?: boolean
  keyCode?: number
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  preventDefault?: () => void
}

interface EscapeEntry {
  id: number
  isActive: () => boolean
  onCancel: () => unknown
  priority: number
  order: number
}

/**
 * 分层 Esc 栈管理器：
 * 保证同一时刻仅由优先级最高且最近打开的活动弹出层响应 Esc 取消。
 */
export class EscapeStack {
  private entries = new Map<number, EscapeEntry>()
  private nextId = 0
  private activationSeq = 0

  get size(): number {
    return this.entries.size
  }

  register(options: EscapeLayerOptions): EscapeRegistration {
    const id = ++this.nextId
    const entry: EscapeEntry = {
      id,
      isActive: options.isActive,
      onCancel: options.onCancel,
      priority: options.priority ?? ESCAPE_PRIORITY.MODAL,
      order: ++this.activationSeq
    }
    this.entries.set(id, entry)

    return {
      bringToTop: () => {
        const existing = this.entries.get(id)
        if (existing) {
          existing.order = ++this.activationSeq
        }
      },
      dispose: () => {
        this.entries.delete(id)
      }
    }
  }

  hasActive(minPriority = -Infinity): boolean {
    for (const entry of this.entries.values()) {
      if (entry.priority >= minPriority && entry.isActive()) {
        return true
      }
    }
    return false
  }

  handleKeyDown(e: EscapeKeyLikeEvent): boolean {
    if (e.key !== 'Escape' && e.key !== 'Esc') return false
    if (e.defaultPrevented) return false
    if (e.isComposing || e.keyCode === 229) return false
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false

    let top: EscapeEntry | null = null
    for (const entry of this.entries.values()) {
      if (!entry.isActive()) continue
      if (
        !top ||
        entry.priority > top.priority ||
        (entry.priority === top.priority && entry.order > top.order)
      ) {
        top = entry
      }
    }

    if (!top) return false
    e.preventDefault?.()
    top.onCancel()
    return true
  }
}

export const defaultEscapeStack = new EscapeStack()

