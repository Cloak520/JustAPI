import { describe, expect, it, vi } from 'vitest'
import { VariableEngine } from '@/core/interpolation/engine'
import { createEmptyRequest, normalizeRequest } from '@/core/models/requestFactory'
import { createDefaultMiddlewares } from '@/core/pipeline/defaultMiddlewares'
import { RequestPipeline, type RequestExecutionContext } from '@/core/pipeline/requestPipeline'
import { ExternalPluginHost } from '@/core/plugins/pluginHost'
import type { ExternalPluginModule } from '@/core/plugins/types'
import {
  requestTabRegistry,
  responseTabRegistry
} from '@/core/registries/extensionRegistry'
import type { ApiResponse } from '@/types'
import * as assertionsPluginModule from '../../.justapi/plugins/assertions/index.mjs'
import assertionsManifest from '../../.justapi/plugins/assertions/manifest.json'

const {
  ASSERTIONS_EXTENSION_KEY,
  evaluateAssertions,
  getRequestAssertions,
  resolveJsonPath,
  setRequestAssertions
} = assertionsPluginModule

describe('.justapi/plugins/assertions (external plugin)', () => {
  const sampleResponse: ApiResponse = {
    status: 200,
    statusText: 'OK',
    durationMs: 145,
    sizeBytes: 128,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Trace-Id': 'trace-998'
    },
    cookies: [],
    body: JSON.stringify({
      code: 0,
      data: {
        user: { id: 42, role: 'admin' },
        items: [{ name: 'first' }, { name: 'second' }]
      }
    }),
    timestamp: Date.now()
  }

  it('resolves nested dot and array bracket jsonPaths accurately', () => {
    const data = JSON.parse(sampleResponse.body)
    expect(resolveJsonPath(data, '$.code')).toEqual({ found: true, value: 0 })
    expect(resolveJsonPath(data, 'data.user.role')).toEqual({ found: true, value: 'admin' })
    expect(resolveJsonPath(data, '$.data.items[1].name')).toEqual({
      found: true,
      value: 'second'
    })
    expect(resolveJsonPath(data, 'data.items[5].name')).toEqual({
      found: false,
      value: undefined
    })
  })

  it('evaluates status, duration, case-insensitive headers, jsonPath, and body rules', () => {
    const rules = [
      { id: '1', enabled: true, target: 'status', operator: 'eq', expected: '200' },
      { id: '2', enabled: true, target: 'durationMs', operator: 'lt', expected: '300' },
      {
        id: '3',
        enabled: true,
        target: 'header',
        property: 'x-trace-id',
        operator: 'eq',
        expected: 'trace-998'
      },
      {
        id: '4',
        enabled: true,
        target: 'jsonPath',
        property: '$.data.user.id',
        operator: 'eq',
        expected: '{{expectedUserId}}'
      },
      {
        id: '5',
        enabled: true,
        target: 'body',
        operator: 'contains',
        expected: '"role":"admin"'
      },
      {
        id: '6',
        enabled: false,
        target: 'status',
        operator: 'eq',
        expected: '500'
      }
    ]

    const report = evaluateAssertions(rules, sampleResponse, text =>
      text.replace('{{expectedUserId}}', '42')
    )

    expect(report.total).toBe(5)
    expect(report.passed).toBe(5)
    expect(report.failed).toBe(0)
  })

  it('loads via ExternalPluginHost, executes pipeline assertions, and cleans up on disable', async () => {
    const req = createEmptyRequest({ path: 'https://api.example.com/health' })
    setRequestAssertions(req, [
      { id: 'a1', enabled: true, target: 'status', operator: 'eq', expected: '200' },
      {
        id: 'a2',
        enabled: true,
        target: 'jsonPath',
        property: 'data.user.role',
        operator: 'eq',
        expected: 'guest'
      }
    ])

    const cloned = normalizeRequest(req)
    expect(getRequestAssertions(cloned)).toHaveLength(2)

    const pipeline = new RequestPipeline()
    for (const mw of createDefaultMiddlewares()) {
      pipeline.use(mw)
    }
    const variableEngine = new VariableEngine()
    let disabled: string[] = []
    let lastExecCtx: RequestExecutionContext | null = null

    const host = new ExternalPluginHost({
      backend: {
        discover: async () => ({
          globalDir: null,
          projectDir: null,
          plugins: [
            {
              scope: 'bundled',
              dirName: 'assertions',
              pluginDir: '.justapi/plugins/assertions',
              manifest: assertionsManifest,
              error: null
            }
          ]
        }),
        readAssets: async () => ({
          id: assertionsManifest.id,
          dirName: 'assertions',
          scope: 'bundled',
          manifest: assertionsManifest,
          scriptCode: '',
          styleCode: null
        })
      },
      moduleLoader: async () => assertionsPluginModule as ExternalPluginModule,
      storage: {
        getDisabledKeys: () => disabled,
        setDisabledKeys: keys => {
          disabled = keys
        }
      },
      runtimeBridge: {
        getActiveRequest: () => cloned,
        getLastResponse: () => sampleResponse,
        getLastExecutionContext: () => lastExecCtx,
        showToast: vi.fn(),
        importParsedRequest: vi.fn()
      },
      requestPipeline: pipeline,
      variableEngine
    })

    await host.sync(null)

    expect(requestTabRegistry.get('assertions')).toBeDefined()
    expect(responseTabRegistry.get('assertions')).toBeDefined()

    const ctx: RequestExecutionContext = {
      requestId: 'assert-test-1',
      request: cloned,
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
      transport: vi.fn(async () => sampleResponse),
      varMap: new Map(),
      resolvedUrl: '',
      finalUrl: '',
      finalHeaders: [],
      finalBody: null,
      finalFormFields: null,
      metadata: {}
    }

    const resultCtx = await pipeline.execute(ctx)
    lastExecCtx = resultCtx
    const report = resultCtx.metadata[ASSERTIONS_EXTENSION_KEY] as {
      total: number
      passed: number
      failed: number
    }

    expect(report).toBeDefined()
    expect(report.total).toBe(2)
    expect(report.passed).toBe(1)
    expect(report.failed).toBe(1)

    const reqTab = requestTabRegistry.get('assertions')
    const respTab = responseTabRegistry.get('assertions')
    expect(respTab?.badgeText?.(sampleResponse, resultCtx)).toBe('1/2')
    expect(respTab?.badgeClass?.(sampleResponse, resultCtx)).toBe('assertions-badge-fail')

    const reqRender = (reqTab?.component as { setup?: () => () => unknown })?.setup?.()
    const respRender = (respTab?.component as { setup?: () => () => unknown })?.setup?.()
    expect(reqRender?.()).toBeTruthy()
    expect(respRender?.()).toBeTruthy()

    await host.setPluginEnabled('bundled:assertions', false)
    expect(requestTabRegistry.get('assertions')).toBeUndefined()
    expect(responseTabRegistry.get('assertions')).toBeUndefined()
    expect(pipeline.list().some(m => m.id === 'justapi.assertions')).toBe(false)

    await host.unloadAll()
  })
})
