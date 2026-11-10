import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { CommandRegistry } from '@/core/commands/commandRegistry'
import {
  buildDuplicateTitle,
  normalizeRequest,
  syncPathParamsWithPath
} from '@/core/models/requestFactory'
import { useSessionStore } from '@/stores/sessionStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn()
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke
}))

describe('CommandRegistry & requestFactory', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
      clear: () => {
        store.clear()
      }
    })
    mockInvoke.mockReset()
    setActivePinia(createPinia())
  })

  it('dispatches keyboard shortcuts and commands honoring when() predicates and IME guards', async () => {
    const registry = new CommandRegistry()
    const runSpy = vi.fn()
    let allowed = false

    registry.register({
      id: 'demo.save',
      title: 'Save',
      shortcut: { key: 's', mod: true },
      when: () => allowed,
      run: runSpy
    })

    const fakeEvent = {
      key: 's',
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      isComposing: false,
      defaultPrevented: false,
      preventDefault: vi.fn()
    } as unknown as KeyboardEvent

    expect(await registry.handleKeyDown(fakeEvent)).toBe(false)
    expect(runSpy).not.toHaveBeenCalled()

    allowed = true
    const composingEvent = {
      ...fakeEvent,
      isComposing: true,
      preventDefault: vi.fn()
    } as unknown as KeyboardEvent
    expect(await registry.handleKeyDown(composingEvent)).toBe(false)
    expect(runSpy).not.toHaveBeenCalled()

    expect(await registry.handleKeyDown(fakeEvent)).toBe(true)
    expect(fakeEvent.preventDefault).toHaveBeenCalledOnce()
    expect(runSpy).toHaveBeenCalledOnce()
  })

  it('normalizes legacy requests and syncs path parameters preserving values', () => {
    const req = normalizeRequest({
      path: '/orgs/{orgId}/members/:memberId?role={{role}}',
      pathParams: [{ id: 'orgId', key: 'orgId', value: 'acme', enabled: true }]
    })

    expect(req.schemaVersion).toBe(1)
    expect(req.formFields?.length).toBeGreaterThan(0)
    expect(req.pathParams.map(p => [p.key, p.value])).toEqual([
      ['orgId', 'acme'],
      ['memberId', '']
    ])

    const updated = syncPathParamsWithPath('/orgs/{orgId}', req.pathParams)
    expect(updated.map(p => [p.key, p.value])).toEqual([['orgId', 'acme']])

    expect(buildDuplicateTitle('获取用户')).toBe('获取用户 (副本)')
    expect(buildDuplicateTitle('获取用户 (副本)')).toBe('获取用户 (副本 2)')
    expect(buildDuplicateTitle('获取用户 (副本 2)')).toBe('获取用户 (副本 3)')
  })

  it('commits BaseURL safely for subprojects, preserves empty project environments, and saves before deleting moved files', async () => {
    mockInvoke.mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'load_project_from_dir') {
        return {
          path: args.path,
          config: {
            schemaVersion: 1,
            name: 'AuditProj',
            baseUrl: 'https://api.example.com',
            headers: [],
            environments: [{ id: 'env_1', name: 'Dev', variables: {} }],
            activeEnvironmentId: 'env_1'
          },
          subProjects: [
            {
              dirName: 'auth',
              config: {
                id: 'auth',
                name: 'Auth',
                baseUrl: '/auth',
                inheritBaseUrl: true,
                headers: [],
                inheritHeaders: true,
                variables: {},
                inheritVariables: true
              },
              requests: [
                {
                  schemaVersion: 1,
                  id: 'req_login',
                  name: 'Login',
                  method: 'POST',
                  path: '/login',
                  pathParams: [],
                  queryParams: [],
                  headers: [],
                  bodyType: 'none',
                  bodyContent: '',
                  formFields: [],
                  subProjectId: 'auth',
                  fileName: 'POST_login.json'
                }
              ]
            }
          ],
          history: []
        }
      }
      return null
    })

    const workspaceStore = useWorkspaceStore()
    const sessionStore = useSessionStore()
    await workspaceStore.loadProject('/tmp/audit-proj')

    // 1. 删除项目下全部环境后，不应回退复活全局默认环境
    await workspaceStore.saveEnvironments([], null)
    expect(workspaceStore.environments).toEqual([])
    expect(workspaceStore.activeEnvironment).toBeNull()

    // 2. 子项目继承主项目 BaseURL + /auth 后缀时，修改主机名不重复拼接 /auth/auth
    const subReq = workspaceStore.subProjects[0].requests[0]
    sessionStore.openTab(subReq, 'auth')
    await nextTick()
    expect(sessionStore.baseUrl).toBe('https://api.example.com/auth')

    const savedTarget = await sessionStore.commitBaseUrl('https://staging.example.com/auth')
    await nextTick()
    expect(savedTarget).toBe('project.json')
    expect(workspaceStore.projectConfig?.baseUrl).toBe('https://staging.example.com')
    expect(sessionStore.baseUrl).toBe('https://staging.example.com/auth')

    // 3. 跨分组保存失败时，不得提前删除原文件
    mockInvoke.mockImplementationOnce(async (cmd: string) => {
      if (cmd === 'save_request_file') {
        throw new Error('非法路径片段: ../evil')
      }
      return null
    })

    await expect(
      sessionStore.saveActiveTab({ subProjectDir: 'auth', group: '../evil', name: 'Login' })
    ).rejects.toThrow('非法路径片段')
    expect(mockInvoke).not.toHaveBeenCalledWith('delete_request_file', expect.anything())

    // 4. 删除子项目后同步关闭其打开的标签页
    sessionStore.closeTabsForSubProject('auth')
    expect(sessionStore.tabs.some(t => t.subProjectDir === 'auth')).toBe(false)
  })
})

