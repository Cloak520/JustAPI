import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandRegistry } from '@/core/commands/commandRegistry'
import { VariableEngine } from '@/core/interpolation/engine'
import { createEmptyRequest } from '@/core/models/requestFactory'
import { createDefaultMiddlewares } from '@/core/pipeline/defaultMiddlewares'
import { RequestPipeline, type RequestExecutionContext } from '@/core/pipeline/requestPipeline'
import {
  ExternalPluginHost,
  createProjectPluginStateStorage
} from '@/core/plugins/pluginHost'
import type {
  ExternalPluginAssets,
  ExternalPluginModule,
  ExternalPluginsDiscoveryResult
} from '@/core/plugins/types'
import { requestTabRegistry } from '@/core/registries/extensionRegistry'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { ApiRequest, ApiResponse, ProjectConfig } from '@/types'

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn()
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke
}))

function makeDummyResponse(): ApiResponse {
  return {
    status: 200,
    statusText: 'OK',
    durationMs: 12,
    sizeBytes: 2,
    headers: {},
    body: '{}',
    timestamp: Date.now()
  }
}

describe('core/plugins ExternalPluginHost (.justapi/plugins/)', () => {
  function setupHost(
    discovery: ExternalPluginsDiscoveryResult,
    modulesByKey: Record<string, ExternalPluginModule>
  ) {
    let disabledKeys: string[] = []
    let activeReq: ApiRequest = createEmptyRequest({ path: 'https://api.example.com/test' })
    const pipeline = new RequestPipeline()
    for (const mw of createDefaultMiddlewares()) {
      pipeline.use(mw)
    }
    const variableEngine = new VariableEngine()
    const commandRegistry = new CommandRegistry()
    const toastSpy = vi.fn()

    const host = new ExternalPluginHost({
      backend: {
        discover: async () => discovery,
        readAssets: async (scope, dirName) => {
          const found = discovery.plugins.find(
            p => p.scope === scope && p.dirName === dirName
          )
          if (!found?.manifest) {
            throw new Error(`Missing plugin ${scope}:${dirName}`)
          }
          return {
            id: found.manifest.id,
            dirName,
            scope,
            manifest: found.manifest,
            scriptCode: '// mocked module',
            styleCode: null
          } satisfies ExternalPluginAssets
        }
      },
      moduleLoader: async assets => {
        const mod = modulesByKey[`${assets.scope}:${assets.dirName}`]
        if (!mod) throw new Error('Module not found')
        return mod
      },
      storage: {
        getDisabledKeys: () => disabledKeys,
        setDisabledKeys: keys => {
          disabledKeys = [...keys]
        }
      },
      runtimeBridge: {
        getActiveRequest: () => activeReq,
        getLastResponse: () => null,
        getLastExecutionContext: () => null,
        showToast: toastSpy,
        importParsedRequest: vi.fn()
      },
      requestPipeline: pipeline,
      variableEngine,
      commandRegistry
    })

    return {
      host,
      pipeline,
      variableEngine,
      commandRegistry,
      getActiveReq: () => activeReq,
      setActiveReq: (req: ApiRequest) => {
        activeReq = req
      },
      getDisabledKeys: () => disabledKeys
    }
  }

  it('activates external plugin contributions, executes middleware & variables, and cleans up on disable', async () => {
    const deactivateSpy = vi.fn()
    const commandSpy = vi.fn()
    const dummyComponent = { name: 'DummyPluginTab', template: '<div />' }

    const discovery: ExternalPluginsDiscoveryResult = {
      globalDir: '/Users/dev/.justapi/plugins',
      projectDir: '/tmp/proj/.justapi/plugins',
      plugins: [
        {
          scope: 'project',
          dirName: 'ext-signer',
          pluginDir: '/tmp/proj/.justapi/plugins/ext-signer',
          error: null,
          manifest: {
            id: 'ext.signer',
            name: 'Request Signer',
            version: '1.0.0',
            entry: 'index.mjs',
            minApiVersion: 1
          }
        }
      ]
    }

    const { host, pipeline, variableEngine, commandRegistry, getActiveReq } = setupHost(
      discovery,
      {
        'project:ext-signer': {
          activate(ctx) {
            expect(ctx.vue).toBeDefined()
            ctx.setRequestExtension('signer', { enabled: true })

            ctx.registerRequestTab({
              id: 'ext.signer.tab',
              order: 80,
              label: 'Signer',
              component: dummyComponent
            })

            ctx.registerVariableProvider({
              name: '$extNonce',
              description: 'test nonce',
              evaluate: () => 'nonce-xyz'
            })

            ctx.useMiddleware({
              id: 'ext.signer.mw',
              order: 250,
              async execute(execCtx, next) {
                const cfg = execCtx.request.extensions?.signer as { enabled?: boolean } | undefined
                if (cfg?.enabled) {
                  const nonce = execCtx.variableEngine.interpolate('{{$extNonce}}', execCtx.varMap)
                  execCtx.finalHeaders.push(['X-Ext-Nonce', nonce])
                  execCtx.metadata.signed = true
                }
                await next()
              }
            })

            ctx.registerCommand({
              id: 'ext.signer.cmd',
              title: 'Run Signer',
              run: commandSpy
            })
          },
          deactivate: deactivateSpy
        }
      }
    )

    await host.sync('/tmp/proj')

    expect(host.activeCount.value).toBe(1)
    expect(host.records.value[0].status).toBe('active')
    expect(requestTabRegistry.get('ext.signer.tab')).toBeDefined()
    expect(variableEngine.evalDynamic('$extNonce')).toBe('nonce-xyz')
    expect(getActiveReq().extensions?.signer).toEqual({ enabled: true })
    expect(await commandRegistry.execute('ext.signer.cmd')).toBe(true)
    expect(commandSpy).toHaveBeenCalledTimes(1)

    // Pipeline executes external middleware
    let capturedHeaders: [string, string][] = []
    const ctx: RequestExecutionContext = {
      requestId: 'ext-1',
      request: getActiveReq(),
      baseUrl: '',
      projectConfig: null,
      subProjectConfig: null,
      fallbackEnvironment: null,
      networkSettings: {
        dangerouslyDisableSsl: false,
        enableProxy: false,
        proxyUrl: '',
        enableCookieJar: false
      },
      cookies: [],
      variableEngine,
      transport: async (_id, payload) => {
        capturedHeaders = payload.headers
        return makeDummyResponse()
      },
      varMap: new Map(),
      resolvedUrl: '',
      finalUrl: '',
      finalHeaders: [],
      finalBody: null,
      finalFormFields: null,
      metadata: {}
    }

    const resCtx = await pipeline.execute(ctx)
    expect(resCtx.metadata.signed).toBe(true)
    expect(capturedHeaders).toContainEqual(['X-Ext-Nonce', 'nonce-xyz'])

    // Disabling plugin cleans up every single contribution cleanly
    await host.setPluginEnabled('project:ext-signer', false)

    expect(deactivateSpy).toHaveBeenCalledTimes(1)
    expect(host.activeCount.value).toBe(0)
    expect(host.records.value[0].status).toBe('disabled')
    expect(requestTabRegistry.get('ext.signer.tab')).toBeUndefined()
    expect(variableEngine.evalDynamic('$extNonce')).toBeNull()
    expect(pipeline.list().some(m => m.id === 'ext.signer.mw')).toBe(false)
    expect(commandRegistry.get('ext.signer.cmd')).toBeUndefined()
  })

  it('prefers project plugin over same-id global plugin and rolls back failed activations cleanly', async () => {
    const dummyComponent = { name: 'Tab', template: '<div />' }

    const discovery: ExternalPluginsDiscoveryResult = {
      globalDir: '/Users/dev/.justapi/plugins',
      projectDir: '/tmp/proj/.justapi/plugins',
      plugins: [
        {
          scope: 'project',
          dirName: 'override-plugin',
          pluginDir: '/tmp/proj/.justapi/plugins/override-plugin',
          error: null,
          manifest: {
            id: 'shared.plugin',
            name: 'Project Shared Plugin',
            version: '2.0.0',
            entry: 'index.mjs',
            minApiVersion: 1
          }
        },
        {
          scope: 'project',
          dirName: 'broken-plugin',
          pluginDir: '/tmp/proj/.justapi/plugins/broken-plugin',
          error: null,
          manifest: {
            id: 'broken.plugin',
            name: 'Broken Plugin',
            version: '1.0.0',
            entry: 'index.mjs',
            minApiVersion: 1
          }
        },
        {
          scope: 'project',
          dirName: 'reserved-tab-plugin',
          pluginDir: '/tmp/proj/.justapi/plugins/reserved-tab-plugin',
          error: null,
          manifest: {
            id: 'reserved.plugin',
            name: 'Reserved Attempt',
            version: '1.0.0',
            entry: 'index.mjs',
            minApiVersion: 1
          }
        },
        {
          scope: 'global',
          dirName: 'global-shared-plugin',
          pluginDir: '/Users/dev/.justapi/plugins/global-shared-plugin',
          error: null,
          manifest: {
            id: 'shared.plugin',
            name: 'Global Shared Plugin',
            version: '1.0.0',
            entry: 'index.mjs',
            minApiVersion: 1
          }
        }
      ]
    }

    const globalActivateSpy = vi.fn()
    const { host, variableEngine } = setupHost(discovery, {
      'project:override-plugin': {
        activate(ctx) {
          ctx.registerVariableProvider({
            name: '$sharedWho',
            evaluate: () => 'project-v2'
          })
        }
      },
      'global:global-shared-plugin': {
        activate: globalActivateSpy
      },
      'project:broken-plugin': {
        activate(ctx) {
          ctx.registerRequestTab({
            id: 'broken.partial.tab',
            label: 'Partial',
            component: dummyComponent
          })
          throw new Error('boom inside activate')
        }
      },
      'project:reserved-tab-plugin': {
        activate(ctx) {
          // Attempting to overwrite built-in "headers" tab must fail
          ctx.registerRequestTab({
            id: 'headers',
            label: 'Hijacked',
            component: dummyComponent
          })
        }
      }
    })

    await host.sync('/tmp/proj')

    expect(globalActivateSpy).not.toHaveBeenCalled()
    expect(variableEngine.evalDynamic('$sharedWho')).toBe('project-v2')

    const recordsByKey = new Map(host.records.value.map(r => [r.key, r]))
    expect(recordsByKey.get('project:override-plugin')?.status).toBe('active')
    expect(recordsByKey.get('global:global-shared-plugin')?.status).toBe('overridden')
    expect(recordsByKey.get('global:global-shared-plugin')?.overriddenByScope).toBe('project')

    // Partial registrations from failed activate() must be rolled back
    expect(recordsByKey.get('project:broken-plugin')?.status).toBe('error')
    expect(recordsByKey.get('project:broken-plugin')?.error).toContain('boom inside activate')
    expect(requestTabRegistry.get('broken.partial.tab')).toBeUndefined()

    // Reserved core IDs cannot be overwritten
    expect(recordsByKey.get('project:reserved-tab-plugin')?.status).toBe('error')
    expect(recordsByKey.get('project:reserved-tab-plugin')?.error).toContain('核心保留标识冲突')

    await host.unloadAll()
  })

  describe('project.json persistence via createProjectPluginStateStorage', () => {
    function createStorageMock() {
      const mem = new Map<string, string>()
      return {
        getItem: (key: string) => mem.get(key) ?? null,
        setItem: (key: string, val: string) => {
          mem.set(key, val)
        },
        removeItem: (key: string) => {
          mem.delete(key)
        }
      }
    }

    beforeEach(() => {
      mockInvoke.mockReset()
      setActivePinia(createPinia())
      vi.stubGlobal('localStorage', createStorageMock())
    })

    it('persists disabledPlugins in project.json, isolates per project, and rolls back on save failure', async () => {
      const projectJsonStore = new Map<string, ProjectConfig>([
        [
          '/tmp/proj-a',
          {
            name: 'Project A',
            baseUrl: 'https://a.example.com',
            headers: [],
            environments: []
          }
        ],
        [
          '/tmp/proj-b',
          {
            name: 'Project B',
            baseUrl: 'https://b.example.com',
            headers: [],
            environments: []
          }
        ]
      ])

      let failNextSave = false

      mockInvoke.mockImplementation(async (cmd: string, args: any) => {
        if (cmd === 'load_project_from_dir') {
          const cfg = projectJsonStore.get(args.path)!
          return {
            path: args.path,
            config: JSON.parse(JSON.stringify(cfg)),
            subProjects: [],
            history: []
          }
        }
        if (cmd === 'save_project_config') {
          if (failNextSave) {
            failNextSave = false
            throw new Error('disk full')
          }
          projectJsonStore.set(args.path, JSON.parse(JSON.stringify(args.config)))
          return null
        }
        return null
      })

      const variableEngine = new VariableEngine()
      const host = new ExternalPluginHost({
        backend: {
          discover: async projectPath => ({
            globalDir: '/Users/dev/.justapi/plugins',
            projectDir: projectPath ? `${projectPath}/.justapi/plugins` : null,
            plugins: [
              {
                scope: 'bundled',
                dirName: 'curl',
                pluginDir: 'bundled://curl',
                error: null,
                manifest: {
                  id: 'justapi.curl',
                  name: 'cURL',
                  version: '1.0.0',
                  entry: 'index.mjs',
                  minApiVersion: 1
                }
              }
            ]
          }),
          readAssets: async () => ({
            id: 'justapi.curl',
            dirName: 'curl',
            scope: 'bundled',
            manifest: {
              id: 'justapi.curl',
              name: 'cURL',
              version: '1.0.0',
              entry: 'index.mjs',
              minApiVersion: 1
            },
            scriptCode: '// mock',
            styleCode: null
          })
        },
        moduleLoader: async () => ({
          activate(ctx) {
            ctx.registerVariableProvider({
              name: '$curlReady',
              evaluate: () => 'yes'
            })
          }
        }),
        storage: createProjectPluginStateStorage(),
        runtimeBridge: {
          getActiveRequest: () => createEmptyRequest(),
          getLastResponse: () => null,
          getLastExecutionContext: () => null,
          showToast: vi.fn(),
          importParsedRequest: vi.fn()
        },
        requestPipeline: new RequestPipeline(),
        variableEngine,
        commandRegistry: new CommandRegistry()
      })

      // 1. No project open: toggling uses localStorage fallback without touching any project.json
      await host.sync(null)
      expect(host.activeCount.value).toBe(1)
      await host.setPluginEnabled('bundled:curl', false)
      expect(host.activeCount.value).toBe(0)
      expect(JSON.parse(localStorage.getItem('justapi_disabled_external_plugins')!)).toEqual([
        'bundled:justapi.curl'
      ])

      // 2. Open Project A: does NOT inherit no-project localStorage disable list
      const workspaceStore = useWorkspaceStore()
      await workspaceStore.loadProject('/tmp/proj-a')
      await host.sync(workspaceStore.projectPath)
      expect(host.activeCount.value).toBe(1)
      expect(workspaceStore.projectConfig?.disabledPlugins).toBeUndefined()

      // 3. Disable plugin in Project A -> saved to Project A's project.json
      await host.setPluginEnabled('bundled:curl', false)
      expect(host.activeCount.value).toBe(0)
      expect(workspaceStore.projectConfig?.disabledPlugins).toEqual(['bundled:justapi.curl'])
      expect(projectJsonStore.get('/tmp/proj-a')?.disabledPlugins).toEqual([
        'bundled:justapi.curl'
      ])

      // 4. Switch to Project B -> Project B still has plugin active
      await workspaceStore.loadProject('/tmp/proj-b')
      await host.sync(workspaceStore.projectPath)
      expect(host.activeCount.value).toBe(1)
      expect(variableEngine.evalDynamic('$curlReady')).toBe('yes')

      // 5. Simulate save error in Project B -> disabledPlugins rolls back and plugin remains active
      failNextSave = true
      await expect(host.setPluginEnabled('bundled:curl', false)).rejects.toThrow('disk full')
      expect(workspaceStore.projectConfig?.disabledPlugins).toBeUndefined()
      expect(host.activeCount.value).toBe(1)

      // 6. Switch back to Project A -> reads disabledPlugins from Project A's project.json
      await workspaceStore.loadProject('/tmp/proj-a')
      await host.sync(workspaceStore.projectPath)
      expect(host.activeCount.value).toBe(0)
      expect(host.records.value[0].status).toBe('disabled')

      // 7. Re-enable in Project A -> clears disabledPlugins field cleanly
      await host.setPluginEnabled('bundled:curl', true)
      expect(host.activeCount.value).toBe(1)
      expect(workspaceStore.projectConfig?.disabledPlugins).toBeUndefined()
      expect(projectJsonStore.get('/tmp/proj-a')?.disabledPlugins).toBeUndefined()

      await host.unloadAll()
      vi.unstubAllGlobals()
    })

    it('removes project/global plugins, cleans up project.json disabledPlugins, promotes overridden fallback, and protects bundled', async () => {
      const projectJsonStore = new Map<string, ProjectConfig>([
        [
          '/tmp/proj-rem',
          {
            name: 'Removable Proj',
            baseUrl: 'https://rem.example.com',
            headers: [],
            environments: [],
            disabledPlugins: ['global:ext.tagger']
          }
        ]
      ])

      mockInvoke.mockImplementation(async (cmd: string, args: any) => {
        if (cmd === 'load_project_from_dir') {
          const cfg = projectJsonStore.get(args.path)!
          return {
            path: args.path,
            config: JSON.parse(JSON.stringify(cfg)),
            subProjects: [],
            history: []
          }
        }
        if (cmd === 'save_project_config') {
          projectJsonStore.set(args.path, JSON.parse(JSON.stringify(args.config)))
          return null
        }
        return null
      })

      const pluginsOnDisk = [
        {
          scope: 'project' as const,
          dirName: 'tagger-proj',
          pluginDir: '/tmp/proj-rem/.justapi/plugins/tagger-proj',
          error: null,
          manifest: {
            id: 'shared.tagger',
            name: 'Project Tagger',
            version: '2.0.0',
            entry: 'index.mjs',
            minApiVersion: 1
          }
        },
        {
          scope: 'global' as const,
          dirName: 'tagger-global',
          pluginDir: '/Users/dev/.justapi/plugins/tagger-global',
          error: null,
          manifest: {
            id: 'shared.tagger',
            name: 'Global Tagger',
            version: '1.0.0',
            entry: 'index.mjs',
            minApiVersion: 1
          }
        },
        {
          scope: 'global' as const,
          dirName: 'disabled-global',
          pluginDir: '/Users/dev/.justapi/plugins/disabled-global',
          error: null,
          manifest: {
            id: 'ext.tagger',
            name: 'Disabled Global',
            version: '1.0.0',
            entry: 'index.mjs',
            minApiVersion: 1
          }
        },
        {
          scope: 'bundled' as const,
          dirName: 'curl',
          pluginDir: 'bundled://curl',
          error: null,
          manifest: {
            id: 'justapi.curl',
            name: 'cURL',
            version: '1.0.0',
            entry: 'index.mjs',
            minApiVersion: 1
          }
        }
      ]

      const projDeactivate = vi.fn()
      const removeSpy = vi.fn(async (scope: string, dirName: string) => {
        const idx = pluginsOnDisk.findIndex(p => p.scope === scope && p.dirName === dirName)
        if (idx === -1) throw new Error('not found')
        pluginsOnDisk.splice(idx, 1)
      })

      const variableEngine = new VariableEngine()
      const host = new ExternalPluginHost({
        backend: {
          discover: async projectPath => ({
            globalDir: '/Users/dev/.justapi/plugins',
            projectDir: projectPath ? `${projectPath}/.justapi/plugins` : null,
            plugins: pluginsOnDisk.map(p => ({ ...p }))
          }),
          readAssets: async (scope, dirName) => {
            const found = pluginsOnDisk.find(p => p.scope === scope && p.dirName === dirName)!
            return {
              id: found.manifest.id,
              dirName,
              scope,
              manifest: found.manifest,
              scriptCode: '// mock',
              styleCode: null
            }
          },
          remove: removeSpy
        },
        moduleLoader: async assets => {
          if (assets.scope === 'project' && assets.dirName === 'tagger-proj') {
            return {
              activate(ctx) {
                ctx.registerVariableProvider({
                  name: '$taggerWho',
                  evaluate: () => 'project-v2'
                })
              },
              deactivate: projDeactivate
            }
          }
          if (assets.scope === 'global' && assets.dirName === 'tagger-global') {
            return {
              activate(ctx) {
                ctx.registerVariableProvider({
                  name: '$taggerWho',
                  evaluate: () => 'global-v1'
                })
              }
            }
          }
          return {
            activate() {}
          }
        },
        storage: createProjectPluginStateStorage(),
        runtimeBridge: {
          getActiveRequest: () => createEmptyRequest(),
          getLastResponse: () => null,
          getLastExecutionContext: () => null,
          showToast: vi.fn(),
          importParsedRequest: vi.fn()
        },
        requestPipeline: new RequestPipeline(),
        variableEngine,
        commandRegistry: new CommandRegistry()
      })

      const workspaceStore = useWorkspaceStore()
      await workspaceStore.loadProject('/tmp/proj-rem')
      await host.sync(workspaceStore.projectPath)

      expect(variableEngine.evalDynamic('$taggerWho')).toBe('project-v2')
      expect(host.records.value.find(r => r.key === 'global:tagger-global')?.status).toBe(
        'overridden'
      )

      // 1. 内置官方插件不允许通过 removePlugin 移除
      await expect(host.removePlugin('bundled:curl')).rejects.toThrow('官方插件不可移除')
      expect(removeSpy).not.toHaveBeenCalled()

      // 2. 移除项目插件后：卸载钩子触发、磁盘删除被调用、同 ID 全局插件自动恢复激活
      await host.removePlugin('project:tagger-proj')
      expect(projDeactivate).toHaveBeenCalledTimes(1)
      expect(removeSpy).toHaveBeenCalledWith('project', 'tagger-proj', '/tmp/proj-rem')
      expect(host.records.value.find(r => r.key === 'project:tagger-proj')).toBeUndefined()
      expect(host.records.value.find(r => r.key === 'global:tagger-global')?.status).toBe('active')
      expect(variableEngine.evalDynamic('$taggerWho')).toBe('global-v1')

      // 3. 移除此前处于禁用状态的全局插件：同步清理 project.json 中的 disabledPlugins 残留记录
      expect(workspaceStore.projectConfig?.disabledPlugins).toEqual(['global:ext.tagger'])
      await host.removePlugin('global:disabled-global')
      expect(removeSpy).toHaveBeenCalledWith('global', 'disabled-global', '/tmp/proj-rem')
      expect(workspaceStore.projectConfig?.disabledPlugins).toBeUndefined()
      expect(projectJsonStore.get('/tmp/proj-rem')?.disabledPlugins).toBeUndefined()

      await host.unloadAll()
      vi.unstubAllGlobals()
    })
  })
})
