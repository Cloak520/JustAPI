import { describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { useEscapeCancel } from '@/composables/useEscapeCancel'
import { ESCAPE_PRIORITY, EscapeStack } from '@/core/shortcuts/escapeStack'

function createEscEvent(overrides: Partial<KeyboardEvent> = {}) {
  return {
    key: 'Escape',
    defaultPrevented: false,
    isComposing: false,
    keyCode: 27,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    ...overrides
  }
}

describe('EscapeStack & useEscapeCancel', () => {
  it('ignores inactive layers and invokes active layer on Escape', () => {
    const stack = new EscapeStack()
    const closedCancel = vi.fn()
    const openCancel = vi.fn()
    let open = false

    stack.register({
      isActive: () => false,
      onCancel: closedCancel,
      priority: ESCAPE_PRIORITY.MODAL
    })
    stack.register({
      isActive: () => open,
      onCancel: openCancel,
      priority: ESCAPE_PRIORITY.MODAL
    })

    expect(stack.handleKeyDown(createEscEvent())).toBe(false)
    expect(closedCancel).not.toHaveBeenCalled()
    expect(openCancel).not.toHaveBeenCalled()

    open = true
    const ev = createEscEvent()
    expect(stack.handleKeyDown(ev)).toBe(true)
    expect(ev.preventDefault).toHaveBeenCalledOnce()
    expect(closedCancel).not.toHaveBeenCalled()
    expect(openCancel).toHaveBeenCalledOnce()
  })

  it('respects priority order (OVERLAY > MODAL > DROPDOWN)', () => {
    const stack = new EscapeStack()
    let dropdownOpen = true
    let modalOpen = true
    let overlayOpen = true

    const closeDropdown = vi.fn(() => {
      dropdownOpen = false
    })
    const closeModal = vi.fn(() => {
      modalOpen = false
    })
    const closeOverlay = vi.fn(() => {
      overlayOpen = false
    })

    // Intentionally register in reverse order
    stack.register({
      isActive: () => modalOpen,
      onCancel: closeModal,
      priority: ESCAPE_PRIORITY.MODAL
    })
    stack.register({
      isActive: () => overlayOpen,
      onCancel: closeOverlay,
      priority: ESCAPE_PRIORITY.OVERLAY
    })
    stack.register({
      isActive: () => dropdownOpen,
      onCancel: closeDropdown,
      priority: ESCAPE_PRIORITY.DROPDOWN
    })

    expect(stack.hasActive(ESCAPE_PRIORITY.MODAL)).toBe(true)

    expect(stack.handleKeyDown(createEscEvent())).toBe(true)
    expect(closeOverlay).toHaveBeenCalledOnce()
    expect(closeModal).not.toHaveBeenCalled()
    expect(closeDropdown).not.toHaveBeenCalled()

    expect(stack.handleKeyDown(createEscEvent())).toBe(true)
    expect(closeModal).toHaveBeenCalledOnce()
    expect(closeDropdown).not.toHaveBeenCalled()
    expect(stack.hasActive(ESCAPE_PRIORITY.MODAL)).toBe(false)

    expect(stack.handleKeyDown(createEscEvent())).toBe(true)
    expect(closeDropdown).toHaveBeenCalledOnce()
    expect(stack.hasActive()).toBe(false)
  })

  it('orders equal-priority layers LIFO by most recent activation', () => {
    const stack = new EscapeStack()
    const aOpen = ref(false)
    const bOpen = ref(false)
    const closeA = vi.fn(() => {
      aOpen.value = false
    })
    const closeB = vi.fn(() => {
      bOpen.value = false
    })

    const scope = effectScope()
    scope.run(() => {
      useEscapeCancel(aOpen, closeA, { stack })
      useEscapeCancel(bOpen, closeB, { stack })
    })

    aOpen.value = true
    bOpen.value = true
    expect(stack.handleKeyDown(createEscEvent())).toBe(true)
    expect(closeB).toHaveBeenCalledTimes(1)
    expect(closeA).not.toHaveBeenCalled()

    // Re-open B then re-activate A so A is now above B
    aOpen.value = false
    bOpen.value = true
    aOpen.value = true

    expect(stack.handleKeyDown(createEscEvent())).toBe(true)
    expect(closeA).toHaveBeenCalledTimes(1)
    expect(closeB).toHaveBeenCalledTimes(1)

    expect(stack.handleKeyDown(createEscEvent())).toBe(true)
    expect(closeB).toHaveBeenCalledTimes(2)

    scope.stop()
    expect(stack.size).toBe(0)
  })

  it('ignores non-Escape, defaultPrevented, modified keys, and IME composing events', () => {
    const stack = new EscapeStack()
    const onCancel = vi.fn()
    stack.register({
      isActive: () => true,
      onCancel,
      priority: ESCAPE_PRIORITY.MODAL
    })

    expect(stack.handleKeyDown(createEscEvent({ key: 'Enter' }))).toBe(false)
    expect(stack.handleKeyDown(createEscEvent({ defaultPrevented: true }))).toBe(false)
    expect(stack.handleKeyDown(createEscEvent({ isComposing: true }))).toBe(false)
    expect(stack.handleKeyDown(createEscEvent({ keyCode: 229 }))).toBe(false)
    expect(stack.handleKeyDown(createEscEvent({ metaKey: true }))).toBe(false)
    expect(stack.handleKeyDown(createEscEvent({ ctrlKey: true }))).toBe(false)
    expect(stack.handleKeyDown(createEscEvent({ altKey: true }))).toBe(false)
    expect(stack.handleKeyDown(createEscEvent({ shiftKey: true }))).toBe(false)

    expect(onCancel).not.toHaveBeenCalled()
  })

  it('prevents lower modal layer from closing while busy top overlay consumes Escape', () => {
    const stack = new EscapeStack()
    const modalOpen = ref(true)
    const confirmOpen = ref(true)
    const removing = ref(true)

    const closeModal = vi.fn(() => {
      modalOpen.value = false
    })
    const cancelRemove = vi.fn(() => {
      if (removing.value) return
      confirmOpen.value = false
    })

    const scope = effectScope()
    scope.run(() => {
      useEscapeCancel(modalOpen, closeModal, { stack })
      useEscapeCancel(() => modalOpen.value && confirmOpen.value, cancelRemove, {
        stack,
        priority: ESCAPE_PRIORITY.OVERLAY
      })
    })

    // While deleting, Esc hits top overlay, no-ops safely, and does not leak to modal
    expect(stack.handleKeyDown(createEscEvent())).toBe(true)
    expect(cancelRemove).toHaveBeenCalledOnce()
    expect(confirmOpen.value).toBe(true)
    expect(modalOpen.value).toBe(true)
    expect(closeModal).not.toHaveBeenCalled()

    // Once deletion stops, first Esc closes confirm overlay, second Esc closes modal
    removing.value = false
    expect(stack.handleKeyDown(createEscEvent())).toBe(true)
    expect(confirmOpen.value).toBe(false)
    expect(modalOpen.value).toBe(true)

    expect(stack.handleKeyDown(createEscEvent())).toBe(true)
    expect(modalOpen.value).toBe(false)

    scope.stop()
  })

  it('attaches and ref-count cleans up window keydown listener cleanly', () => {
    const stack = new EscapeStack()
    const listeners = new Set<(e: KeyboardEvent) => void>()
    const addSpy = vi.fn((type: string, fn: EventListenerOrEventListenerObject) => {
      if (type === 'keydown' && typeof fn === 'function') {
        listeners.add(fn as (e: KeyboardEvent) => void)
      }
    })
    const removeSpy = vi.fn((type: string, fn: EventListenerOrEventListenerObject) => {
      if (type === 'keydown' && typeof fn === 'function') {
        listeners.delete(fn as (e: KeyboardEvent) => void)
      }
    })

    vi.stubGlobal('window', {
      addEventListener: addSpy,
      removeEventListener: removeSpy
    })

    try {
      const aOpen = ref(true)
      const bOpen = ref(true)
      const onA = vi.fn()
      const onB = vi.fn()

      const scope1 = effectScope()
      const scope2 = effectScope()
      scope1.run(() => useEscapeCancel(aOpen, onA, { stack }))
      scope2.run(() => useEscapeCancel(bOpen, onB, { stack }))

      // Single shared window listener for multiple registrations
      expect(addSpy).toHaveBeenCalledTimes(1)
      expect(listeners.size).toBe(1)

      const listener = Array.from(listeners)[0]
      listener(createEscEvent() as unknown as KeyboardEvent)
      expect(onB).toHaveBeenCalledOnce()
      expect(onA).not.toHaveBeenCalled()

      // Disposing one scope keeps the shared listener active for the remaining scope
      scope2.stop()
      expect(removeSpy).not.toHaveBeenCalled()
      listener(createEscEvent() as unknown as KeyboardEvent)
      expect(onA).toHaveBeenCalledOnce()

      // Disposing the last scope detaches the window listener completely
      scope1.stop()
      expect(removeSpy).toHaveBeenCalledTimes(1)
      expect(listeners.size).toBe(0)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

