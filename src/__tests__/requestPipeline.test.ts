import { describe, expect, it, vi } from 'vitest'
import { createEmptyRequest } from '@/core/models/requestFactory'
import { defaultVariableEngine } from '@/core/interpolation/engine'
import { createDefaultMiddlewares } from '@/core/pipeline/defaultMiddlewares'
import {
  RequestPipeline,
  type RequestExecutionContext,
  type TransportRequestPayload
} from '@/core/pipeline/requestPipeline'
import type { ApiResponse } from '@/types'

describe('pipeline/RequestPipeline', () => {
  it('executes onion middlewares in order and supports pre/post extensions', async () => {
    const events: string[] = []
    const captured: { payload: TransportRequestPayload | null } = { payload: null }

    const pipeline = new RequestPipeline()
    for (const mw of createDefaultMiddlewares()) {
      pipeline.use(mw)
    }

    pipeline.use({
      id: 'ext.trace',
      order: 50,
      async execute(ctx, next) {
        events.push('before')
        await next()
        events.push('after')
        ctx.metadata.tracedStatus = ctx.response?.status
      }
    })

    const req = createEmptyRequest({
      method: 'POST',
      path: '/users/{id}',
      pathParams: [{ id: 'p1', key: 'id', value: '42', enabled: true }],
      queryParams: [{ id: 'q1', key: 'env', value: '{{envName}}', enabled: true }],
      headers: [{ id: 'h1', key: 'X-Custom', value: '{{token}}', enabled: true }],
      bodyType: 'json',
      bodyContent: '{"token":"{{token}}"}'
    })

    const fakeResponse: ApiResponse = {
      status: 200,
      statusText: 'OK',
      durationMs: 12,
      sizeBytes: 15,
      headers: { 'content-type': 'application/json' },
      cookies: [],
      body: '{"ok":true}',
      timestamp: Date.now()
    }

    const ctx: RequestExecutionContext = {
      requestId: 'req-1',
      request: req,
      baseUrl: 'https://api.example.com',
      projectConfig: {
        name: 'Test',
        baseUrl: 'https://api.example.com',
        headers: [{ id: 'gh1', key: 'X-Global', value: 'global-val', enabled: true }],
        environments: [
          {
            id: 'e1',
            name: 'Dev',
            variables: { envName: 'staging', token: 'secret-123' }
          }
        ],
        activeEnvironmentId: 'e1'
      },
      subProjectConfig: null,
      fallbackEnvironment: null,
      networkSettings: {
        dangerouslyDisableSsl: false,
        enableProxy: false,
        proxyUrl: '',
        enableCookieJar: true
      },
      cookies: [{ name: 'sid', value: 'abc', domain: 'api.example.com', raw: 'sid=abc' }],
      variableEngine: defaultVariableEngine,
      transport: vi.fn(async (_id, payload) => {
        captured.payload = payload
        events.push('transport')
        return fakeResponse
      }),
      varMap: new Map(),
      resolvedUrl: '',
      finalUrl: '',
      finalHeaders: [],
      finalBody: null,
      finalFormFields: null,
      metadata: {}
    }

    const resCtx = await pipeline.execute(ctx)

    expect(events).toEqual(['before', 'transport', 'after'])
    expect(resCtx.finalUrl).toBe('https://api.example.com/users/42?env=staging')
    expect(captured.payload?.bodyContent).toBe('{"token":"secret-123"}')
    expect(captured.payload?.headers).toEqual([
      ['X-Global', 'global-val'],
      ['X-Custom', 'secret-123'],
      ['Cookie', 'sid=abc']
    ])
    expect(resCtx.metadata.tracedStatus).toBe(200)
  })
})
