import { describe, expect, it, vi } from 'vitest'
import { createEmptyRequest } from '@/core/models/requestFactory'
import { ExternalPluginHost } from '@/core/plugins/pluginHost'
import type { ExternalPluginModule } from '@/core/plugins/types'
import {
  requestExporterRegistry,
  requestImporterRegistry
} from '@/core/registries/extensionRegistry'
import * as curlPluginModule from '../../.justapi/plugins/curl/index.mjs'
import curlManifest from '../../.justapi/plugins/curl/manifest.json'

const {
  isCurlCommand,
  parseCurlCommand,
  quotePosixArg,
  serializeToCurl,
  tokenizeShellCommand
} = curlPluginModule

describe('.justapi/plugins/curl (external plugin)', () => {
  it('tokenizes multiline POSIX commands with single, double, and backslash escapes', () => {
    const cmd = `curl -X POST "https://api.example.com/v1/items?page=1&tag=a" \\
      -H 'Content-Type: application/json' \\
      -H "X-Quote: a\\"b" \\
      --data-raw '{"hello": "world"}'`

    const tokens = tokenizeShellCommand(cmd)
    expect(tokens).toEqual([
      'curl',
      '-X',
      'POST',
      'https://api.example.com/v1/items?page=1&tag=a',
      '-H',
      'Content-Type: application/json',
      '-H',
      'X-Quote: a"b',
      '--data-raw',
      '{"hello": "world"}'
    ])
  })

  it('parses JSON POST cURL with headers, query params, and basic auth', () => {
    const raw = `curl 'https://api.example.com/v1/orders?status=open&limit=20' \\
      -u admin:s3cr3t \\
      -H 'Content-Type: application/json' \\
      -H 'X-Env: {{env}}' \\
      -d '{"amount": 100}'`

    expect(isCurlCommand(raw)).toBe(true)

    const req = parseCurlCommand(raw, createEmptyRequest)
    expect(req.method).toBe('POST')
    expect(req.path).toBe('https://api.example.com/v1/orders')
    expect(req.queryParams.map(q => [q.key, q.value])).toEqual([
      ['status', 'open'],
      ['limit', '20']
    ])
    expect(req.headers.map(h => [h.key, h.value])).toEqual([
      ['Content-Type', 'application/json'],
      ['X-Env', '{{env}}'],
      ['Authorization', `Basic ${btoa('admin:s3cr3t')}`]
    ])
    expect(req.bodyType).toBe('json')
    expect(JSON.parse(req.bodyContent)).toEqual({ amount: 100 })
  })

  it('parses multipart form-data (-F) including @file fields and urlencoded forms', () => {
    const formReq = parseCurlCommand(
      `curl -X POST https://upload.example.com/files -F 'title=report' -F 'file=@/tmp/a.pdf'`,
      createEmptyRequest
    )
    expect(formReq.bodyType).toBe('form-data')
    expect(formReq.formFields?.map(f => [f.key, f.value, f.is_file])).toEqual([
      ['title', 'report', false],
      ['file', '/tmp/a.pdf', true]
    ])

    const urlEncReq = parseCurlCommand(
      `curl -X POST https://auth.example.com/token --data-urlencode 'grant_type=client_credentials' -d 'scope=read'`,
      createEmptyRequest
    )
    expect(urlEncReq.bodyType).toBe('x-www-form-urlencoded')
    expect(urlEncReq.formFields?.map(f => [f.key, f.value])).toEqual([
      ['scope', 'read'],
      ['grant_type', 'client_credentials']
    ])
  })

  it('serializes request to POSIX-quoted curl command and round-trips cleanly', () => {
    const parsed = parseCurlCommand(
      `curl -X PUT "https://api.example.com/users/7?active=true" -H "Authorization: Bearer tok" -d '{"name":"O'\\''Reilly"}'`,
      createEmptyRequest
    )

    const exported = serializeToCurl({
      request: parsed,
      resolvedUrl: 'https://api.example.com/users/7?active=true',
      headers: parsed.headers.map(h => [h.key, h.value]),
      body: parsed.bodyContent
    })

    expect(exported).toContain('curl -X PUT')
    expect(exported).toContain(quotePosixArg('Authorization: Bearer tok'))

    const reparsed = parseCurlCommand(exported, createEmptyRequest)
    expect(reparsed.method).toBe('PUT')
    expect(reparsed.path).toBe('https://api.example.com/users/7')
    expect(reparsed.queryParams.map(q => [q.key, q.value])).toEqual([['active', 'true']])
    expect(JSON.parse(reparsed.bodyContent)).toEqual({ name: "O'Reilly" })
  })

  it('loads and unloads curl importer/exporter cleanly via ExternalPluginHost', async () => {
    let disabled: string[] = []
    const host = new ExternalPluginHost({
      backend: {
        discover: async () => ({
          globalDir: null,
          projectDir: null,
          plugins: [
            {
              scope: 'bundled',
              dirName: 'curl',
              pluginDir: '.justapi/plugins/curl',
              manifest: curlManifest,
              error: null
            }
          ]
        }),
        readAssets: async () => ({
          id: curlManifest.id,
          dirName: 'curl',
          scope: 'bundled',
          manifest: curlManifest,
          scriptCode: '',
          styleCode: null
        })
      },
      moduleLoader: async () => curlPluginModule as ExternalPluginModule,
      storage: {
        getDisabledKeys: () => disabled,
        setDisabledKeys: keys => {
          disabled = keys
        }
      },
      runtimeBridge: {
        getActiveRequest: () => createEmptyRequest(),
        getLastResponse: () => null,
        getLastExecutionContext: () => null,
        showToast: vi.fn(),
        importParsedRequest: vi.fn()
      }
    })

    await host.sync(null)
    expect(requestImporterRegistry.get('justapi.curl')).toBeDefined()
    expect(requestExporterRegistry.get('justapi.curl')).toBeDefined()

    await host.setPluginEnabled('bundled:curl', false)
    expect(requestImporterRegistry.get('justapi.curl')).toBeUndefined()
    expect(requestExporterRegistry.get('justapi.curl')).toBeUndefined()

    await host.unloadAll()
  })
})
