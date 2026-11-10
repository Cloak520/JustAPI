import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  closeVariableAutocomplete,
  getVariableAutocompleteState,
  handleVariableAutocompleteKeyDown,
  isVariableAutocompleteOpen,
  openVariableAutocomplete,
  wasVariableAutocompleteEnterHandled
} from '@/composables/useVariableAutocomplete'
import { defaultVariableEngine, type VariableSourceInfo } from '@/core/interpolation/engine'
import {
  applyVariableSuggestion,
  buildVariableSuggestions,
  filterVariableSuggestions,
  findActiveVariableTrigger
} from '@/core/interpolation/suggestions'

describe('{{variable}} input autocomplete suggestions', () => {
  beforeEach(() => {
    closeVariableAutocomplete()
  })

  it('detects active {{... triggers across URLs, JSON strings, and existing closing braces', () => {
    // 1. URL 中未闭合触发
    const urlText = 'https://api.example.com/{{ver'
    const t1 = findActiveVariableTrigger(urlText, urlText.length)
    expect(t1).toEqual({
      start: 24,
      end: 29,
      replaceEnd: 29,
      query: 'ver',
      hasClosingBraces: false
    })

    // 2. 刚输入 {{ 空前缀
    const emptyBrace = 'Bearer {{'
    const t2 = findActiveVariableTrigger(emptyBrace, emptyBrace.length)
    expect(t2).toEqual({
      start: 7,
      end: 9,
      replaceEnd: 9,
      query: '',
      hasClosingBraces: false
    })

    // 3. 已闭合的 {{host}} 后方继续输入普通路径不应触发
    const afterClosed = 'https://{{host}}/api/users'
    expect(findActiveVariableTrigger(afterClosed, afterClosed.length)).toBeNull()

    // 4. 光标位于已有 {{tok}} 内部时自动吞并右侧 }} 避免重复括号
    const insideClosed = '{"auth": "{{tok}}"}'
    const t4 = findActiveVariableTrigger(insideClosed, 15) // 光标在 tok 后、}} 前
    expect(t4).toEqual({
      start: 10,
      end: 15,
      replaceEnd: 17,
      query: 'tok',
      hasClosingBraces: true
    })
    expect(applyVariableSuggestion(insideClosed, t4!, 'accessToken')).toEqual({
      nextText: '{"auth": "{{accessToken}}"}',
      nextCursor: 25
    })

    // 5. 跨行或含非法字符时不触发
    expect(findActiveVariableTrigger('{\n  "a": 1', 10)).toBeNull()
    expect(findActiveVariableTrigger('{{foo bar', 9)).toBeNull()
  })

  it('merges subproject, project environment, and dynamic variable providers with ranking', () => {
    const varMap = new Map<string, VariableSourceInfo>([
      ['baseUrl', { value: 'https://dev.example.com', source: 'project', environmentName: 'Dev' }],
      ['token', { value: 'sub-override-token', source: 'subproject' }]
    ])

    const all = buildVariableSuggestions(varMap, defaultVariableEngine.listProviders())
    expect(all[0]).toMatchObject({ key: 'token', source: 'subproject', value: 'sub-override-token' })
    expect(all[1]).toMatchObject({
      key: 'baseUrl',
      source: 'project',
      environmentName: 'Dev'
    })
    expect(all.some(s => s.key === '$guid' && s.source === 'system')).toBe(true)

    // 支持带 $ 与不带 $ 前缀检索动态变量
    expect(filterVariableSuggestions(all, '$gu')[0].key).toBe('$guid')
    expect(filterVariableSuggestions(all, 'gu')[0].key).toBe('$guid')
    expect(filterVariableSuggestions(all, 'tok')[0].key).toBe('token')
  })

  it('handles keyboard navigation, Enter confirmation, and Escape dismissal on overlay state', () => {
    function makeKeyEvent(key: string): KeyboardEvent {
      const evt = {
        key,
        isComposing: false,
        defaultPrevented: false,
        preventDefault() {
          evt.defaultPrevented = true
        },
        stopPropagation: vi.fn(),
        stopImmediatePropagation: vi.fn()
      }
      return evt as unknown as KeyboardEvent
    }

    const owner = Symbol('test-input')
    const onSelect = vi.fn()
    const varMap = new Map<string, VariableSourceInfo>([
      ['alpha', { value: '1', source: 'project', environmentName: 'Dev' }],
      ['beta', { value: '2', source: 'project', environmentName: 'Dev' }]
    ])
    const all = buildVariableSuggestions(varMap, [])

    const opened = openVariableAutocomplete({
      ownerId: owner,
      targetElement: null,
      query: '',
      allSuggestions: all,
      anchorRect: { left: 100, top: 200, bottom: 224 },
      onSelect
    })
    expect(opened).toBe(true)
    expect(isVariableAutocompleteOpen.value).toBe(true)
    expect(getVariableAutocompleteState().activeIndex).toBe(0)

    // ArrowDown 切换至第二项
    const downEvt = makeKeyEvent('ArrowDown')
    expect(handleVariableAutocompleteKeyDown(downEvt)).toBe(true)
    expect(downEvt.defaultPrevented).toBe(true)
    expect(getVariableAutocompleteState().activeIndex).toBe(1)

    // Enter 确认插入并标记事件已消费
    const enterEvt = makeKeyEvent('Enter')
    expect(handleVariableAutocompleteKeyDown(enterEvt)).toBe(true)
    expect(wasVariableAutocompleteEnterHandled(enterEvt)).toBe(true)
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ key: 'beta' }))
    expect(isVariableAutocompleteOpen.value).toBe(false)

    // 再次打开后 Escape 关闭且不触发 onSelect
    openVariableAutocomplete({
      ownerId: owner,
      targetElement: null,
      query: '',
      allSuggestions: all,
      anchorRect: { left: 100, top: 200, bottom: 224 },
      onSelect
    })
    const escEvt = makeKeyEvent('Escape')
    expect(handleVariableAutocompleteKeyDown(escEvt)).toBe(true)
    expect(isVariableAutocompleteOpen.value).toBe(false)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
