import { describe, expect, it } from 'vitest'
import {
  encodeParamPreservingVariables,
  resolveEffectiveBaseUrl,
  resolveHeaderLayers,
  resolveInheritedHeaders,
  resolveRequestUrl
} from '@/core/inheritance/resolver'
import type { KeyValuePair, ProjectConfig, SubProjectConfig } from '@/types'

describe('inheritance/resolver', () => {
  const projectConfig: ProjectConfig = {
    schemaVersion: 1,
    name: 'Demo',
    baseUrl: 'https://api.example.com/',
    headers: [
      { id: 'p1', key: 'X-App-Version', value: '1.0', enabled: true },
      { id: 'p2', key: 'Authorization', value: 'Bearer {{projToken}}', enabled: true },
      { id: 'p3', key: 'X-Disabled', value: 'off', enabled: false }
    ],
    environments: []
  }

  const subConfig: SubProjectConfig = {
    id: 'auth',
    name: 'Auth Service',
    baseUrl: '/auth',
    inheritBaseUrl: true,
    headers: [
      { id: 's1', key: 'Authorization', value: 'Bearer {{subToken}}', enabled: true },
      { id: 's2', key: 'X-Sub-Id', value: 'auth-01', enabled: true }
    ],
    inheritHeaders: true,
    variables: {},
    inheritVariables: true
  }

  it('resolves inherited BaseURL with relative subpath or standalone override', () => {
    expect(resolveEffectiveBaseUrl(projectConfig, subConfig)).toBe(
      'https://api.example.com/auth'
    )
    expect(
      resolveEffectiveBaseUrl(projectConfig, {
        ...subConfig,
        inheritBaseUrl: false,
        baseUrl: 'https://standalone.dev'
      })
    ).toBe('https://standalone.dev')
    expect(resolveEffectiveBaseUrl(projectConfig, null)).toBe('https://api.example.com/')
  })

  it('merges inherited project and subproject headers with case-insensitive override', () => {
    const inherited = resolveInheritedHeaders(projectConfig, subConfig)
    expect(inherited.map(h => [h.key, h.value, h.inheritedFrom])).toEqual([
      ['X-App-Version', '1.0', 'project'],
      ['Authorization', 'Bearer {{subToken}}', 'subproject'],
      ['X-Sub-Id', 'auth-01', 'subproject']
    ])

    const isolated = resolveInheritedHeaders(projectConfig, {
      ...subConfig,
      inheritHeaders: false
    })
    expect(isolated.map(h => h.key)).toEqual(['Authorization', 'X-Sub-Id'])
  })

  it('computes header layers for custom additions, inherited overrides, and disabled inherited rows', () => {
    const inherited = resolveInheritedHeaders(projectConfig, subConfig)
    const requestHeaders: KeyValuePair[] = [
      {
        id: 'r1',
        key: 'Authorization',
        value: 'Bearer override-token',
        enabled: true,
        isInheritedOverride: true
      },
      {
        id: 'r2',
        key: 'X-Sub-Id',
        value: 'auth-01',
        enabled: false,
        isInheritedOverride: true
      },
      {
        id: 'r3',
        key: 'X-Trace-Id',
        value: '{{$guid}}',
        enabled: true,
        isInheritedOverride: false
      }
    ]

    const res = resolveHeaderLayers(inherited, requestHeaders)
    expect(res.overriddenHeadersCount).toBe(2) // Authorization modified value + X-Sub-Id disabled
    expect(res.disabledInheritedCount).toBe(1)
    expect(res.customHeadersCount).toBe(1)
    expect(res.activeHeadersCount).toBe(3) // X-App-Version, Authorization, X-Trace-Id
    expect(res.sendableHeaders).toEqual([
      { key: 'X-App-Version', value: '1.0' },
      { key: 'Authorization', value: 'Bearer override-token' },
      { key: 'X-Trace-Id', value: '{{$guid}}' }
    ])
  })

  it('encodes URL params while preserving {{variable}} placeholders and merges inline vs table query params', () => {
    expect(encodeParamPreservingVariables('hello {{user id}} world')).toBe(
      'hello%20%7B%7Buser%20id%7D%7D%20world'
    )
    expect(encodeParamPreservingVariables('prefix-{{userId}}-suffix')).toBe(
      'prefix-{{userId}}-suffix'
    )

    const url = resolveRequestUrl(
      'https://api.example.com/',
      '/users/{id}/orders/:orderId?limit=10&sort=asc&disabledKey=x',
      [
        { id: '1', key: 'id', value: '{{userId}}', enabled: true },
        { id: '2', key: 'orderId', value: 'A B', enabled: true }
      ],
      [
        { id: 'q1', key: 'limit', value: '50', enabled: true },
        { id: 'q2', key: 'disabledKey', value: 'y', enabled: false },
        { id: 'q3', key: 'token', value: '{{apiToken}}', enabled: true }
      ]
    )

    expect(url).toBe(
      'https://api.example.com/users/{{userId}}/orders/A%20B?sort=asc&limit=50&token={{apiToken}}'
    )
  })

  it('does not corrupt {{variable}} sharing a name with {pathParam} and preserves #fragment', () => {
    const url = resolveRequestUrl(
      'https://api.example.com',
      '{{host}}/nodes/{host}/items/{price}?tab=info#overview',
      [
        { id: '1', key: 'host', value: 'edge-01', enabled: true },
        { id: '2', key: 'price', value: '$100', enabled: true }
      ],
      [{ id: 'q1', key: 'page', value: '2', enabled: true }]
    )

    expect(url).toBe('{{host}}/nodes/edge-01/items/%24100?tab=info&page=2#overview')
  })
})

