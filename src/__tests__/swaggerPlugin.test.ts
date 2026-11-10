import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandRegistry } from '@/core/commands/commandRegistry'
import { VariableEngine } from '@/core/interpolation/engine'
import { createEmptyRequest } from '@/core/models/requestFactory'
import { RequestPipeline } from '@/core/pipeline/requestPipeline'
import { ExternalPluginHost } from '@/core/plugins/pluginHost'
import type { ExternalPluginModule } from '@/core/plugins/types'
import { collectionImporterRegistry } from '@/core/registries/extensionRegistry'
import { resolveSubProjectSyncSource, useWorkspaceStore } from '@/stores/workspaceStore'
import * as swaggerPluginModule from '../../.justapi/plugins/swagger/index.mjs'
import swaggerManifest from '../../.justapi/plugins/swagger/manifest.json'

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn()
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke
}))

const {
  extractBaseUrl,
  generateExampleFromSchema,
  parseOpenApiContent,
  parseOpenApiDocument,
  resolveJsonPointer,
  supportsOpenApiDocument
} = swaggerPluginModule

describe('.justapi/plugins/swagger (external collection importer plugin)', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    setActivePinia(createPinia())
  })

  it('parses OpenAPI 3.0 and Swagger 2.0 documents accurately including path-level params & tags', async () => {
    const openapi3Json = JSON.stringify({
      openapi: '3.0.1',
      info: { title: 'Petstore API' },
      servers: [{ url: 'https://petstore.example.com/v1' }],
      paths: {
        '/pets/{petId}': {
          parameters: [
            { name: 'petId', in: 'path', description: '宠物ID', schema: { default: '101' } },
            { name: 'X-Tenant', in: 'header', example: 'acme' }
          ],
          get: {
            tags: ['Pets'],
            summary: '获取宠物详情',
            parameters: [
              { name: 'verbose', in: 'query', description: '详细信息', schema: { default: true } }
            ]
          },
          post: {
            tags: ['Pets'],
            operationId: 'updatePet',
            requestBody: {
              content: {
                'application/json': {
                  example: { name: 'Milo', age: 2 }
                }
              }
            }
          }
        }
      }
    })

    expect(supportsOpenApiDocument(openapi3Json)).toBe(true)
    const parsed3 = await parseOpenApiContent(openapi3Json)
    expect(parsed3.title).toBe('Petstore API')
    expect(parsed3.baseUrl).toBe('https://petstore.example.com/v1')
    expect(parsed3.sourceFormat).toBe('openapi')
    expect(parsed3.requests).toHaveLength(2)

    const getReq = parsed3.requests.find(r => r.method === 'GET')!
    expect(getReq.name).toBe('获取宠物详情')
    expect(getReq.group).toBe('Pets')
    expect(getReq.fileName).toBe('Pets/GET_pets_petId.json')
    expect(getReq.pathParams[0]).toMatchObject({ key: 'petId', value: '101' })
    expect(getReq.queryParams[0]).toMatchObject({ key: 'verbose', value: 'true' })
    expect(getReq.headers[0]).toMatchObject({ key: 'X-Tenant', value: 'acme' })

    const postReq = parsed3.requests.find(r => r.method === 'POST')!
    expect(postReq.name).toBe('updatePet')
    expect(postReq.bodyType).toBe('json')
    expect(JSON.parse(postReq.bodyContent)).toEqual({ name: 'Milo', age: 2 })

    const swagger2 = {
      swagger: '2.0',
      host: 'legacy.example.com',
      schemes: ['http'],
      basePath: '/api/v2/',
      paths: {
        '/orders': {
          post: {
            summary: 'Create Order',
            parameters: [{ name: 'payload', in: 'body' }]
          }
        }
      }
    }
    expect(extractBaseUrl(swagger2)).toBe('http://legacy.example.com/api/v2')
    const parsed2 = parseOpenApiDocument(swagger2)
    expect(parsed2.baseUrl).toBe('http://legacy.example.com/api/v2')
    expect(parsed2.requests[0].bodyType).toBe('json')

    expect(() => parseOpenApiDocument({ foo: 'bar' })).toThrow('无效的 Swagger / OpenAPI')
  })

  it('registers via ExternalPluginHost, drives workspaceStore importCollection/refresh, and cleans up on disable', async () => {
    let disabledKeys: string[] = []
    let currentSubProjects: any[] = []

    const host = new ExternalPluginHost({
      backend: {
        discover: async () => ({
          globalDir: null,
          projectDir: null,
          plugins: [
            {
              scope: 'bundled',
              dirName: 'swagger',
              pluginDir: '.justapi/plugins/swagger',
              error: null,
              manifest: swaggerManifest
            }
          ]
        }),
        readAssets: async () => ({
          id: swaggerManifest.id,
          dirName: 'swagger',
          scope: 'bundled',
          manifest: swaggerManifest,
          scriptCode: '// swagger external plugin',
          styleCode: null
        })
      },
      moduleLoader: async () => swaggerPluginModule as unknown as ExternalPluginModule,
      storage: {
        getDisabledKeys: () => disabledKeys,
        setDisabledKeys: keys => {
          disabledKeys = [...keys]
        }
      },
      runtimeBridge: {
        getActiveRequest: () => createEmptyRequest(),
        getLastResponse: () => null,
        getLastExecutionContext: () => null,
        showToast: vi.fn(),
        importParsedRequest: vi.fn()
      },
      requestPipeline: new RequestPipeline(),
      variableEngine: new VariableEngine(),
      commandRegistry: new CommandRegistry()
    })

    await host.sync(null)
    const registered = collectionImporterRegistry.get('justapi.swagger')
    expect(registered).toBeDefined()
    expect(registered?.shortLabel).toBe('Swagger')

    mockInvoke.mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'read_import_source') {
        if (String(args.source).includes('broken')) {
          return '{"invalid": true}'
        }
        return JSON.stringify({
          openapi: '3.0.0',
          info: { title: 'Demo Service' },
          servers: [{ url: 'https://demo.example.com' }],
          paths: {
            '/users': {
              get: { tags: ['Users'], summary: 'List Users' }
            }
          }
        })
      }
      if (cmd === 'create_subproject') {
        currentSubProjects.push({
          config: args.config,
          dirName: args.dirName,
          requests: []
        })
        return null
      }
      if (cmd === 'merge_and_save_collection') {
        const sub = currentSubProjects.find(s => s.dirName === args.dirName)
        if (sub && args.syncSource) {
          sub.config.collectionSource = args.syncSource
          sub.config.swaggerSourceUrl = args.syncSource.source
        }
        if (sub && !sub.config.baseUrl && args.collection.baseUrl) {
          sub.config.baseUrl = args.collection.baseUrl
        }
        return {
          added: args.collection.requests.length,
          updated: 0,
          deprecated: 0,
          total: args.collection.requests.length
        }
      }
      if (cmd === 'load_project_from_dir') {
        return {
          path: args.path,
          config: {
            name: 'Demo Workspace',
            baseUrl: 'https://root.example.com',
            headers: [],
            environments: []
          },
          subProjects: currentSubProjects,
          history: []
        }
      }
      return null
    })

    const workspaceStore = useWorkspaceStore()
    await workspaceStore.loadProject('/tmp/swagger-ws')

    // 若解析失败，提前报错且不会创建空子项目目录
    await expect(
      workspaceStore.importCollection(
        'broken_api',
        'https://demo.example.com/broken.json',
        'auto',
        { name: 'Broken' }
      )
    ).rejects.toThrow('无效的 Swagger / OpenAPI')
    expect(mockInvoke).not.toHaveBeenCalledWith('create_subproject', expect.anything())

    // 正常自动识别导入并绑定 collectionSource
    const importRes = await workspaceStore.importCollection(
      'users_api',
      'https://demo.example.com/openapi.json',
      'auto',
      { name: '用户服务' }
    )
    expect(importRes?.importer.id).toBe('justapi.swagger')
    expect(importRes?.stats).toEqual({ added: 1, updated: 0, deprecated: 0, total: 1 })
    expect(currentSubProjects[0].config.collectionSource).toEqual({
      importerId: 'justapi.swagger',
      source: 'https://demo.example.com/openapi.json'
    })

    // 兼容历史仅包含 swaggerSourceUrl 的子项目刷新
    expect(
      resolveSubProjectSyncSource({
        id: 'legacy',
        name: 'Legacy',
        baseUrl: '',
        inheritBaseUrl: true,
        headers: [],
        inheritHeaders: true,
        variables: {},
        inheritVariables: true,
        swaggerSourceUrl: 'https://legacy.example.com/swagger.json'
      })
    ).toEqual({
      importerId: 'justapi.swagger',
      source: 'https://legacy.example.com/swagger.json'
    })

    const refreshRes = await workspaceStore.refreshCollection('users_api')
    expect(refreshRes?.stats.total).toBe(1)

    // 禁用插件后自动从 collectionImporterRegistry 卸载，刷新给出清晰提示
    await host.setPluginEnabled('bundled:swagger', false)
    expect(collectionImporterRegistry.get('justapi.swagger')).toBeUndefined()
    await expect(workspaceStore.refreshCollection('users_api')).rejects.toThrow(
      '未找到或未启用导入插件 [justapi.swagger]'
    )

    await host.unloadAll()
  })

  it('resolves $ref pointers, allOf/oneOf/enum/format schema samples, servers variables, multipart/urlencoded & Swagger 2 formData', () => {
    const richDoc = {
      openapi: '3.1.0',
      info: { title: 'Deep OpenAPI' },
      servers: [
        {
          url: 'https://{env}.api.example.com/{version}',
          variables: {
            env: { default: 'staging' },
            version: { default: 'v3' }
          }
        }
      ],
      components: {
        parameters: {
          TraceHeader: {
            name: 'X-Trace-Id',
            in: 'header',
            schema: { type: 'string', format: 'uuid', example: 'req-trace-123' }
          },
          StatusQuery: {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['active', 'archived'] }
          }
        },
        schemas: {
          BaseEntity: {
            type: 'object',
            properties: {
              id: { type: 'string', readOnly: true },
              createdAt: { type: 'string', format: 'date-time' }
            }
          },
          CreateUser: {
            allOf: [
              { $ref: '#/components/schemas/BaseEntity' },
              {
                type: 'object',
                properties: {
                  email: { type: 'string', format: 'email' },
                  role: { type: 'string', enum: ['admin', 'member'] },
                  profile: {
                    oneOf: [
                      { type: 'null' },
                      {
                        type: 'object',
                        properties: {
                          nickname: { type: 'string', default: 'guest' },
                          tags: { type: 'array', items: { type: 'string' } }
                        }
                      }
                    ]
                  }
                }
              }
            ]
          },
          TreeNode: {
            type: 'object',
            properties: {
              label: { type: 'string', example: 'root' },
              parent: { $ref: '#/components/schemas/TreeNode' },
              children: {
                type: 'array',
                items: { $ref: '#/components/schemas/TreeNode' }
              }
            }
          }
        },
        requestBodies: {
          UserBody: {
            content: {
              'application/vnd.api+json': {
                schema: { $ref: '#/components/schemas/CreateUser' }
              }
            }
          }
        }
      },
      paths: {
        '/users': {
          parameters: [{ $ref: '#/components/parameters/TraceHeader' }],
          post: {
            tags: ['Users'],
            summary: '创建用户',
            parameters: [{ $ref: '#/components/parameters/StatusQuery' }],
            requestBody: { $ref: '#/components/requestBodies/UserBody' }
          }
        },
        '/users/avatar': {
          post: {
            tags: ['Users'],
            summary: '上传头像',
            requestBody: {
              content: {
                'multipart/form-data': {
                  schema: {
                    type: 'object',
                    properties: {
                      avatar: { type: 'string', format: 'binary' },
                      caption: { type: 'string', example: 'profile photo' }
                    }
                  }
                }
              }
            }
          }
        },
        '/oauth/token': {
          post: {
            tags: ['Auth'],
            summary: '换取令牌',
            requestBody: {
              content: {
                'application/x-www-form-urlencoded': {
                  schema: {
                    type: 'object',
                    properties: {
                      grant_type: { type: 'string', default: 'client_credentials' },
                      client_id: { type: 'string', format: 'uuid' }
                    }
                  }
                }
              }
            }
          }
        },
        '/webhooks/raw': {
          post: {
            tags: ['Hooks'],
            summary: '文本回调',
            requestBody: {
              content: {
                'text/plain': {
                  example: 'ping=ok'
                }
              }
            }
          }
        }
      }
    }

    expect(resolveJsonPointer(richDoc, '#/components/parameters/TraceHeader')).toBeTruthy()
    expect(
      generateExampleFromSchema({ $ref: '#/components/schemas/TreeNode' }, richDoc)
    ).toEqual({
      label: 'root',
      parent: null,
      children: []
    })

    const parsed = parseOpenApiDocument(richDoc)
    expect(parsed.baseUrl).toBe('https://staging.api.example.com/v3')

    const createUserReq = parsed.requests.find(r => r.path === '/users')!
    expect(createUserReq.headers).toEqual([
      expect.objectContaining({ key: 'X-Trace-Id', value: 'req-trace-123' })
    ])
    expect(createUserReq.queryParams).toEqual([
      expect.objectContaining({ key: 'status', value: 'active' })
    ])
    expect(createUserReq.bodyType).toBe('json')
    expect(JSON.parse(createUserReq.bodyContent)).toEqual({
      createdAt: '2026-01-01T00:00:00Z',
      email: 'user@example.com',
      role: 'admin',
      profile: {
        nickname: 'guest',
        tags: ['string']
      }
    })

    const uploadReq = parsed.requests.find(r => r.path === '/users/avatar')!
    expect(uploadReq.bodyType).toBe('form-data')
    expect(uploadReq.formFields).toEqual([
      { id: 'form_avatar', key: 'avatar', value: '', is_file: true, enabled: true },
      { id: 'form_caption', key: 'caption', value: 'profile photo', is_file: false, enabled: true }
    ])

    const tokenReq = parsed.requests.find(r => r.path === '/oauth/token')!
    expect(tokenReq.bodyType).toBe('x-www-form-urlencoded')
    expect(tokenReq.formFields).toEqual([
      {
        id: 'form_grant_type',
        key: 'grant_type',
        value: 'client_credentials',
        is_file: false,
        enabled: true
      },
      {
        id: 'form_client_id',
        key: 'client_id',
        value: '00000000-0000-0000-0000-000000000000',
        is_file: false,
        enabled: true
      }
    ])

    const rawReq = parsed.requests.find(r => r.path === '/webhooks/raw')!
    expect(rawReq.bodyType).toBe('raw')
    expect(rawReq.bodyContent).toBe('ping=ok')

    const swagger2Deep = {
      swagger: '2.0',
      host: 'v2.example.com',
      definitions: {
        OrderInput: {
          type: 'object',
          properties: {
            sku: { type: 'string', example: 'SKU-001' },
            qty: { type: 'integer', default: 2 }
          }
        }
      },
      paths: {
        '/orders': {
          post: {
            summary: 'Legacy Order',
            parameters: [
              {
                name: 'body',
                in: 'body',
                schema: { $ref: '#/definitions/OrderInput' }
              }
            ]
          }
        },
        '/upload': {
          post: {
            summary: 'Legacy Upload',
            parameters: [
              { name: 'file', in: 'formData', type: 'file' },
              { name: 'tag', in: 'formData', type: 'string', default: 'invoice' }
            ]
          }
        },
        '/form-submit': {
          post: {
            summary: 'Legacy UrlEncoded',
            consumes: ['application/x-www-form-urlencoded'],
            parameters: [{ name: 'code', in: 'formData', type: 'string', default: 'abc' }]
          }
        }
      }
    }

    const parsed2 = parseOpenApiDocument(swagger2Deep)
    expect(JSON.parse(parsed2.requests.find(r => r.path === '/orders')!.bodyContent)).toEqual({
      sku: 'SKU-001',
      qty: 2
    })
    const legacyUpload = parsed2.requests.find(r => r.path === '/upload')!
    expect(legacyUpload.bodyType).toBe('form-data')
    expect(legacyUpload.formFields).toEqual([
      { id: 'form_file', key: 'file', value: '', is_file: true, enabled: true },
      { id: 'form_tag', key: 'tag', value: 'invoice', is_file: false, enabled: true }
    ])
    const legacyUrlEnc = parsed2.requests.find(r => r.path === '/form-submit')!
    expect(legacyUrlEnc.bodyType).toBe('x-www-form-urlencoded')
    expect(legacyUrlEnc.formFields).toEqual([
      { id: 'form_code', key: 'code', value: 'abc', is_file: false, enabled: true }
    ])
  })

  it('handles root / path filenames and media types with charset parameters', () => {
    const doc = {
      openapi: '3.0.3',
      info: { title: 'Root & Parameterized MIME' },
      paths: {
        '/': {
          get: {
            summary: 'Health Root'
          },
          post: {
            summary: 'Upload With Charset',
            requestBody: {
              content: {
                'multipart/form-data; charset=utf-8': {
                  schema: {
                    type: 'object',
                    properties: {
                      doc: { type: 'string', format: 'binary' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    const parsed = parseOpenApiDocument(doc)
    const rootGet = parsed.requests.find(r => r.method === 'GET')!
    expect(rootGet.id).toBe('GET_root')
    expect(rootGet.fileName).toBe('GET_root.json')

    const rootPost = parsed.requests.find(r => r.method === 'POST')!
    expect(rootPost.id).toBe('POST_root')
    expect(rootPost.bodyType).toBe('form-data')
    expect(rootPost.formFields).toEqual([
      { id: 'form_doc', key: 'doc', value: '', is_file: true, enabled: true }
    ])
  })
})

