import { describe, expect, it } from 'vitest'
import {
  VariableEngine,
  defaultVariableEngine,
  resolveEffectiveVariableMap
} from '@/core/interpolation/engine'
import type { Environment, ProjectConfig, SubProjectConfig } from '@/types'

describe('interpolation/engine', () => {
  it('supports registering custom dynamic variable providers without core edits', () => {
    const engine = new VariableEngine()
    engine.registerProvider({
      name: '$upperTest',
      evaluate: () => 'CUSTOM_DYNAMIC_VAL'
    })

    const vars = new Map([
      ['host', { value: 'api.test.local', source: 'project' as const }]
    ])

    expect(engine.interpolate('https://{{host}}/{{ $upperTest }}/{{unknown}}', vars)).toBe(
      'https://api.test.local/CUSTOM_DYNAMIC_VAL/{{unknown}}'
    )

    const tokens = engine.inspectTokens('{{host}} {{$upperTest}} {{missing}}', vars)
    expect(tokens.map(t => t.source)).toEqual(['project', 'system', 'unresolved'])
  })

  it('merges environment variables across project -> subproject layers with inheritVariables flag', () => {
    const projectConfig: ProjectConfig = {
      name: 'P',
      baseUrl: '',
      headers: [],
      environments: [
        { id: 'dev', name: 'Dev', variables: { host: 'dev.local', token: 'proj' } }
      ],
      activeEnvironmentId: 'dev'
    }
    const subConfig: SubProjectConfig = {
      id: 'sub',
      name: 'Sub',
      baseUrl: '',
      inheritBaseUrl: true,
      headers: [],
      inheritHeaders: true,
      variables: { token: 'sub_override', extra: '1' },
      inheritVariables: true
    }

    const merged = resolveEffectiveVariableMap(projectConfig, subConfig)
    expect(merged.get('host')?.value).toBe('dev.local')
    expect(merged.get('token')?.value).toBe('sub_override')
    expect(merged.get('token')?.source).toBe('subproject')

    const isolated = resolveEffectiveVariableMap(projectConfig, {
      ...subConfig,
      inheritVariables: false
    })
    expect(isolated.has('host')).toBe(false)
    expect(isolated.get('token')?.value).toBe('sub_override')

    const fallbackEnv: Environment = { id: 'f', name: 'Fallback', variables: { foo: 'bar' } }
    const standalone = resolveEffectiveVariableMap(null, null, fallbackEnv)
    expect(defaultVariableEngine.interpolate('{{foo}}-{{$randomInt}}', standalone)).toMatch(
      /^bar-\d+$/
    )
  })
})

