import { describe, expect, it } from 'vitest'
import { createEmptyRequest } from '@/core/models/requestFactory'
import {
  buildQuickSearchItems,
  filterQuickSearchItems,
  formatKeyBinding,
  fuzzyScore,
  parseQuickSearchQuery
} from '@/core/search/quickSearch'

describe('quickSearch palette engine', () => {
  const userGetReq = createEmptyRequest({
    id: 'req_user_get',
    name: '获取用户详情',
    method: 'GET',
    path: '/api/v1/users/{id}',
    subProjectId: 'users_svc',
    fileName: 'Users/GET_users_id.json',
    group: 'Users'
  })

  const orderCreateReq = createEmptyRequest({
    id: 'req_order_create',
    name: '创建支付订单',
    method: 'POST',
    path: '/api/v1/orders/create',
    subProjectId: 'orders_svc',
    fileName: 'Orders/POST_orders_create.json',
    group: 'Orders'
  })

  const baseSources = {
    tabs: [
      {
        id: 'tab-1',
        title: '获取用户详情',
        method: 'GET' as const,
        isDirty: false,
        subProjectDir: 'users_svc',
        fileName: 'Users/GET_users_id.json',
        requestId: 'req_user_get',
        group: 'Users',
        draftRequest: userGetReq
      }
    ],
    activeTabId: 'tab-1',
    subProjects: [
      {
        dirName: 'users_svc',
        config: {
          id: 'users_svc',
          name: '用户服务',
          baseUrl: 'https://users.example.com',
          inheritBaseUrl: true,
          headers: [],
          inheritHeaders: true,
          variables: {},
          inheritVariables: true
        },
        requests: [userGetReq]
      },
      {
        dirName: 'orders_svc',
        config: {
          id: 'orders_svc',
          name: '订单服务',
          baseUrl: 'https://orders.example.com',
          inheritBaseUrl: true,
          headers: [],
          inheritHeaders: true,
          variables: {},
          inheritVariables: true
        },
        requests: [orderCreateReq]
      }
    ],
    environments: [
      { id: 'env_dev', name: 'Development', variables: { host: 'localhost' } },
      { id: 'env_prod', name: 'Production', variables: { host: 'api.prod.com' } }
    ],
    activeEnvironmentId: 'env_dev',
    commands: [
      {
        id: 'palette.open',
        title: 'Hidden Palette',
        hiddenInPalette: true,
        shortcut: { key: 'k', mod: true },
        run: () => {}
      },
      {
        id: 'request.save',
        title: '保存当前请求',
        category: '请求',
        shortcut: { key: 's', mod: true },
        run: () => {}
      },
      {
        id: 'body.formatJson',
        title: '美化 JSON 请求体',
        category: '编辑器',
        shortcut: { key: 'f', shift: true, alt: true },
        run: () => {}
      }
    ],
    history: [
      {
        id: 'hist-1',
        name: '最近健康检查',
        method: 'GET',
        url: 'https://orders.example.com/healthz',
        status: 200,
        durationMs: 24,
        timestamp: 1700000000000
      }
    ],
    isMac: true
  }

  it('formats key bindings and parses >, @, # mode prefixes correctly', () => {
    expect(formatKeyBinding({ key: 'k', mod: true }, true)).toBe('⌘K')
    expect(formatKeyBinding({ key: 'k', mod: true }, false)).toBe('Ctrl+K')
    expect(formatKeyBinding({ key: 'f', shift: true, alt: true }, true)).toBe('⌥⇧F')

    expect(parseQuickSearchQuery('> save', 'all')).toEqual({ category: 'command', query: 'save' })
    expect(parseQuickSearchQuery('@ prod', 'request')).toEqual({
      category: 'environment',
      query: 'prod'
    })
    expect(parseQuickSearchQuery('# health', 'all')).toEqual({
      category: 'history',
      query: 'health'
    })
  })

  it('deduplicates opened tabs against collection requests and hides hiddenInPalette commands', () => {
    const items = buildQuickSearchItems(baseSources)

    // userGetReq 已在 tab-1 中打开，不应重复出现两次
    const matchingUserItems = items.filter(i => i.title === '获取用户详情')
    expect(matchingUserItems).toHaveLength(1)
    expect(matchingUserItems[0].kind).toBe('tab')
    expect(matchingUserItems[0].badge).toBe('当前')

    // 未打开的集合请求照常收录
    const orderItem = items.find(i => i.title === '创建支付订单')
    expect(orderItem?.kind).toBe('request')

    // hiddenInPalette 的命令不出现在列表中
    expect(items.some(i => i.id === 'cmd:palette.open')).toBe(false)
    expect(items.find(i => i.id === 'cmd:request.save')?.shortcutText).toBe('⌘S')
  })

  it('filters and scores multi-token queries across requests, commands, environments, and history', () => {
    const items = buildQuickSearchItems(baseSources)

    expect(fuzzyScore('/api/v1/orders/create', 'orders create')).toBeGreaterThan(0)

    const orderMatches = filterQuickSearchItems(items, 'post create', 'all')
    expect(orderMatches[0].id).toContain('POST_orders_create.json')

    const cmdMatches = filterQuickSearchItems(items, '> 美化', 'all')
    expect(cmdMatches).toHaveLength(1)
    expect(cmdMatches[0].id).toBe('cmd:body.formatJson')

    const envMatches = filterQuickSearchItems(items, '@ prod', 'all')
    expect(envMatches).toHaveLength(1)
    expect(envMatches[0].payload).toEqual({ type: 'environment', envId: 'env_prod' })

    const histMatches = filterQuickSearchItems(items, '# healthz', 'all')
    expect(histMatches).toHaveLength(1)
    expect(histMatches[0].kind).toBe('history')
  })
})

