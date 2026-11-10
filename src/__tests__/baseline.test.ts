import { describe, it, expect } from 'vitest'
import {
  parseBulkTextToPairs,
  formatPairsToBulkText,
  parseQueryString,
  extractPathVariables
} from '@/utils/parser'
import {
  evalSystemVariable,
  isSystemVariable,
  resolveEffectiveVariableMap,
  interpolate,
  inspectInterpolationTokens
} from '@/utils/interpolation'
import type { ProjectConfig, SubProjectConfig } from '@/types'

describe('parser utilities (baseline)', () => {
  it('parses bulk text lines into key-value pairs', () => {
    const pairs = parseBulkTextToPairs('Authorization: Bearer abc\nX-Env=dev\nEmptyKey')
    expect(pairs).toHaveLength(3)
    expect(pairs[0]).toMatchObject({ key: 'Authorization', value: 'Bearer abc', enabled: true })
    expect(pairs[1]).toMatchObject({ key: 'X-Env', value: 'dev', enabled: true })
    expect(pairs[2]).toMatchObject({ key: 'EmptyKey', value: '', enabled: true })
  })

  it('formats enabled pairs back to bulk text', () => {
    const text = formatPairsToBulkText([
      { id: '1', key: 'Accept', value: 'application/json', enabled: true },
      { id: '2', key: 'Disabled', value: 'skip', enabled: false }
    ], 'colon')
    expect(text).toBe('Accept: application/json')
  })

  it('parses query strings preserving variable placeholders', () => {
    const parsed = parseQueryString('?page=1&token={{apiToken}}&q=hello%20world')
    expect(parsed).toEqual([
      { key: 'page', value: '1' },
      { key: 'token', value: '{{apiToken}}' },
      { key: 'q', value: 'hello world' }
    ])
  })

  it('extracts path variables without misidentifying ports or {{env}} vars', () => {
    expect(extractPathVariables('http://localhost:8080/users/{userId}/orders/:orderId?tab=1')).toEqual([
      'userId',
      'orderId'
    ])
    expect(extractPathVariables('{{baseUrl}}/items/{id}/:sub_id')).toEqual([
      'id',
      'sub_id'
    ])
  })
})

describe('interpolation utilities (baseline)', () => {
  it('evaluates built-in system variables', () => {
    expect(isSystemVariable('$guid')).toBe(true)
    expect(isSystemVariable('$unknown')).toBe(false)
    expect(evalSystemVariable('$guid')).toMatch(/^[0-9a-f-]{36}$/i)
    expect(evalSystemVariable('$timestamp')).toMatch(/^\d{10,}$/)
    expect(evalSystemVariable('$timestampMs')).toMatch(/^\d{13,}$/)
    const rand = Number(evalSystemVariable('$randomInt'))
    expect(rand).toBeGreaterThanOrEqual(0)
    expect(rand).toBeLessThanOrEqual(1000)
  })

  it('resolves project environment and subproject overrides', () => {
    const projectConfig: ProjectConfig = {
      name: 'Mall',
      baseUrl: 'https://api.example.com',
      headers: [],
      environments: [
        { id: 'dev', name: 'Dev', variables: { token: 'proj_tok', host: 'dev.local' } }
      ],
      activeEnvironmentId: 'dev'
    }
    const subConfig: SubProjectConfig = {
      id: 'user',
      name: 'User',
      baseUrl: '/user',
      inheritBaseUrl: true,
      headers: [],
      inheritHeaders: true,
      variables: { token: 'sub_tok', service: 'users' },
      inheritVariables: true
    }

    const varMap = resolveEffectiveVariableMap(projectConfig, subConfig)
    expect(varMap.get('token')?.value).toBe('sub_tok')
    expect(varMap.get('token')?.source).toBe('subproject')
    expect(varMap.get('host')?.value).toBe('dev.local')
    expect(varMap.get('host')?.source).toBe('project')

    const replaced = interpolate('https://{{host}}/{{service}}?t={{token}}&u={{missing}}', varMap)
    expect(replaced).toBe('https://dev.local/users?t=sub_tok&u={{missing}}')

    const tokens = inspectInterpolationTokens('{{token}}/{{host}}/{{$guid}}/{{missing}}', varMap)
    expect(tokens.map(t => t.source)).toEqual(['subproject', 'project', 'system', 'unresolved'])
  })
})

