export const ASSERTIONS_EXTENSION_KEY = 'assertions'

export function getRequestAssertions(request) {
  if (!request?.extensions) return []
  const raw = request.extensions[ASSERTIONS_EXTENSION_KEY]
  return Array.isArray(raw) ? raw : []
}

export function setRequestAssertions(request, rules) {
  request.extensions = {
    ...(request.extensions || {}),
    [ASSERTIONS_EXTENSION_KEY]: rules
  }
}

/**
 * 轻量路径取值器：支持 `$.data.user.name`、`data.items[0].id` 等常见点号与数组下标路径
 */
export function resolveJsonPath(root, rawPath) {
  if (!rawPath || !rawPath.trim()) {
    return { found: true, value: root }
  }

  let cleanPath = rawPath.trim()
  if (cleanPath === '$') {
    return { found: true, value: root }
  }
  if (cleanPath.startsWith('$.')) {
    cleanPath = cleanPath.slice(2)
  } else if (cleanPath.startsWith('$')) {
    cleanPath = cleanPath.slice(1)
  }

  const segments = []
  const tokenRegex = /[^.[\]]+|\[(\d+)\]/g
  for (const match of cleanPath.matchAll(tokenRegex)) {
    segments.push(match[1] ?? match[0])
  }

  let current = root
  for (const seg of segments) {
    if (current === null || current === undefined) {
      return { found: false, value: undefined }
    }
    if (Array.isArray(current)) {
      const idx = Number(seg)
      if (!Number.isInteger(idx) || idx < 0 || idx >= current.length) {
        return { found: false, value: undefined }
      }
      current = current[idx]
    } else if (typeof current === 'object') {
      if (!Object.prototype.hasOwnProperty.call(current, seg)) {
        return { found: false, value: undefined }
      }
      current = current[seg]
    } else {
      return { found: false, value: undefined }
    }
  }

  return { found: true, value: current }
}

function formatActualValue(val) {
  if (val === undefined) return '(undefined)'
  if (val === null) return 'null'
  if (typeof val === 'string') return val
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val)
    } catch {
      return String(val)
    }
  }
  return String(val)
}

function findHeaderCaseInsensitive(headers, headerName) {
  const target = headerName.trim().toLowerCase()
  if (!target) return { found: false, value: '' }
  for (const [k, v] of Object.entries(headers || {})) {
    if (k.toLowerCase() === target) {
      return { found: true, value: v }
    }
  }
  return { found: false, value: '' }
}

function compareValues(found, actualRaw, operator, expectedStr) {
  if (operator === 'exists') {
    return found && actualRaw !== undefined && actualRaw !== null
  }
  if (!found) {
    return operator === 'neq' || operator === 'notContains'
  }

  const actualStr = formatActualValue(actualRaw)
  switch (operator) {
    case 'eq':
      return actualStr === expectedStr
    case 'neq':
      return actualStr !== expectedStr
    case 'contains':
      return actualStr.includes(expectedStr)
    case 'notContains':
      return !actualStr.includes(expectedStr)
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte': {
      const numActual = typeof actualRaw === 'number' ? actualRaw : Number(actualStr)
      const numExpected = Number(expectedStr)
      if (Number.isNaN(numActual) || Number.isNaN(numExpected)) return false
      if (operator === 'lt') return numActual < numExpected
      if (operator === 'lte') return numActual <= numExpected
      if (operator === 'gt') return numActual > numExpected
      return numActual >= numExpected
    }
    default:
      return false
  }
}

export function buildAssertionLabel(rule) {
  const prop = rule.property?.trim()
  const targetText =
    rule.target === 'status'
      ? 'Status Code'
      : rule.target === 'durationMs'
        ? 'Duration (ms)'
        : rule.target === 'header'
          ? `Header[${prop || '?'}]`
          : rule.target === 'jsonPath'
            ? `JSONPath(${prop || '$'})`
            : 'Response Body'

  const opLabels = {
    eq: '==',
    neq: '!=',
    lt: '<',
    lte: '<=',
    gt: '>',
    gte: '>=',
    contains: 'contains',
    notContains: 'not contains',
    exists: 'exists'
  }

  return rule.operator === 'exists'
    ? `${targetText} ${opLabels[rule.operator]}`
    : `${targetText} ${opLabels[rule.operator]} ${rule.expected}`
}

export function evaluateAssertions(rules, response, interpolate) {
  const enabledRules = rules.filter(r => r.enabled)
  let parsedJsonCache = null

  function getParsedJson() {
    if (!parsedJsonCache) {
      try {
        parsedJsonCache = { parsed: true, data: JSON.parse(response.body) }
      } catch (e) {
        parsedJsonCache = { parsed: false, error: e?.message || '响应体不是有效 JSON' }
      }
    }
    return parsedJsonCache
  }

  const results = enabledRules.map(rule => {
    const expected = interpolate ? interpolate(rule.expected || '') : rule.expected || ''
    const label = buildAssertionLabel({ ...rule, expected })

    let found = false
    let actualRaw = undefined

    if (rule.target === 'status') {
      found = true
      actualRaw = response.status
    } else if (rule.target === 'durationMs') {
      found = true
      actualRaw = response.durationMs
    } else if (rule.target === 'header') {
      const h = findHeaderCaseInsensitive(response.headers, rule.property || '')
      found = h.found
      actualRaw = h.found ? h.value : undefined
    } else if (rule.target === 'body') {
      found = true
      actualRaw = response.body
    } else if (rule.target === 'jsonPath') {
      const jsonState = getParsedJson()
      if (!jsonState.parsed) {
        return {
          ruleId: rule.id,
          label,
          passed: false,
          actual: '(非 JSON 响应)',
          expected: rule.operator === 'exists' ? 'exists' : expected,
          message: `JSON 解析失败: ${jsonState.error}`
        }
      }
      const res = resolveJsonPath(jsonState.data, rule.property)
      found = res.found
      actualRaw = res.value
    }

    const passed = compareValues(found, actualRaw, rule.operator, expected)
    const actualDisplay = formatActualValue(actualRaw)
    const expectedDisplay = rule.operator === 'exists' ? 'exists' : expected

    return {
      ruleId: rule.id,
      label,
      passed,
      actual: actualDisplay,
      expected: expectedDisplay,
      message: passed
        ? `断言通过 (${actualDisplay})`
        : `断言失败: 实际值 [${actualDisplay.slice(0, 120)}]，期望 [${rule.operator} ${expectedDisplay}]`
    }
  })

  const passed = results.filter(r => r.passed).length
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results
  }
}

function createIcons(h) {
  const PlusIcon = () =>
    h(
      'svg',
      {
        width: 12,
        height: 12,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      },
      [h('path', { d: 'M5 12h14' }), h('path', { d: 'M12 5v14' })]
    )

  const TrashIcon = () =>
    h(
      'svg',
      {
        width: 14,
        height: 14,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      },
      [
        h('path', { d: 'M3 6h18' }),
        h('path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }),
        h('path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' })
      ]
    )

  const ShieldIcon = size =>
    h(
      'svg',
      {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 1.8,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        style: 'opacity:0.35'
      },
      [
        h('path', {
          d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'
        }),
        h('path', { d: 'm9 12 2 2 4-4' })
      ]
    )

  const CheckCircleIcon = size =>
    h(
      'svg',
      {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        style: 'color:#34d399;flex-shrink:0'
      },
      [
        h('circle', { cx: 12, cy: 12, r: 10 }),
        h('path', { d: 'm9 12 2 2 4-4' })
      ]
    )

  const XCircleIcon = size =>
    h(
      'svg',
      {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        style: 'color:#fb7185;flex-shrink:0'
      },
      [
        h('circle', { cx: 12, cy: 12, r: 10 }),
        h('path', { d: 'm15 9-6 6' }),
        h('path', { d: 'm9 9 6 6' })
      ]
    )

  return { PlusIcon, TrashIcon, ShieldIcon, CheckCircleIcon, XCircleIcon }
}

const TARGET_OPTIONS = [
  { value: 'status', label: '状态码 (Status)' },
  { value: 'durationMs', label: '耗时 (ms)' },
  { value: 'jsonPath', label: 'JSONPath 字段' },
  { value: 'header', label: '响应 Header' },
  { value: 'body', label: '响应体文本' }
]

const OPERATOR_OPTIONS = [
  { value: 'eq', label: '等于 (==)' },
  { value: 'neq', label: '不等于 (!=)' },
  { value: 'contains', label: '包含' },
  { value: 'notContains', label: '不包含' },
  { value: 'lt', label: '小于 (<)' },
  { value: 'lte', label: '小于等于 (<=)' },
  { value: 'gt', label: '大于 (>)' },
  { value: 'gte', label: '大于等于 (>=)' },
  { value: 'exists', label: '字段存在' }
]

export function activate(ctx) {
  const { computed, defineComponent, h } = ctx.vue
  const { PlusIcon, TrashIcon, ShieldIcon, CheckCircleIcon, XCircleIcon } = createIcons(h)

  // 1. 注册断言执行中间件
  ctx.useMiddleware({
    id: 'justapi.assertions',
    order: 950,
    description: '执行响应断言校验并将报告写入执行上下文 metadata.assertions',
    async execute(execCtx, next) {
      await next()
      if (!execCtx.response) return

      const rules = getRequestAssertions(execCtx.request)
      if (rules.length === 0) return

      const report = evaluateAssertions(rules, execCtx.response, val =>
        execCtx.variableEngine.interpolate(val, execCtx.varMap)
      )
      execCtx.metadata[ASSERTIONS_EXTENSION_KEY] = report
    }
  })

  // 2. 构建请求配置 Tab 组件
  const RequestAssertionsTab = defineComponent({
    name: 'ExternalRequestAssertionsTab',
    setup() {
      const rules = computed(() => getRequestAssertions(ctx.getActiveRequest()))

      function saveRules(next) {
        ctx.setRequestExtension(ASSERTIONS_EXTENSION_KEY, next)
      }

      function addRule(partial = {}) {
        saveRules([
          ...rules.value,
          {
            id: crypto.randomUUID(),
            enabled: true,
            target: partial.target ?? 'status',
            property: partial.property ?? '',
            operator: partial.operator ?? 'eq',
            expected: partial.expected ?? '200'
          }
        ])
      }

      function updateRule(idx, patch) {
        saveRules(rules.value.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
      }

      function onTargetChange(idx, target) {
        const defaultOp =
          target === 'durationMs'
            ? 'lt'
            : target === 'body'
              ? 'contains'
              : target === 'header' || target === 'jsonPath'
                ? 'exists'
                : 'eq'
        const defaultExpected =
          target === 'status' ? '200' : target === 'durationMs' ? '1000' : ''
        updateRule(idx, { target, operator: defaultOp, expected: defaultExpected })
      }

      function removeRule(idx) {
        saveRules(rules.value.filter((_, i) => i !== idx))
      }

      return () =>
        h('div', { class: 'ja-assert-root' }, [
          h('div', { class: 'ja-assert-toolbar' }, [
            h('div', { class: 'ja-assert-title-wrap' }, [
              h('span', { class: 'ja-assert-title' }, '响应断言规则'),
              h('span', { class: 'ja-assert-hint' }, [
                '(随接口 JSON 持久化在 ',
                h('code', { style: 'font-family:monospace' }, 'extensions.assertions'),
                ' 中)'
              ])
            ]),
            h('div', { class: 'ja-assert-actions' }, [
              h(
                'button',
                {
                  class: 'ja-assert-btn',
                  title: '快速添加 Status == 200 断言',
                  onClick: () => addRule({ target: 'status', operator: 'eq', expected: '200' })
                },
                '+ Status 200'
              ),
              h(
                'button',
                {
                  class: 'ja-assert-btn',
                  title: '快速添加耗时 < 1000ms 断言',
                  onClick: () =>
                    addRule({ target: 'durationMs', operator: 'lt', expected: '1000' })
                },
                '+ 耗时<1s'
              ),
              h(
                'button',
                {
                  class: 'ja-assert-btn ja-assert-btn-primary',
                  onClick: () => addRule()
                },
                [PlusIcon(), h('span', null, '添加断言')]
              )
            ])
          ]),

          h(
            'div',
            { class: 'ja-assert-list' },
            rules.value.length === 0
              ? [
                  h('div', { class: 'ja-assert-empty' }, [
                    ShieldIcon(28),
                    h('div', null, '尚未配置任何断言规则，可在 Send 发送请求后自动验证响应结果')
                  ])
                ]
              : rules.value.map((rule, idx) =>
                  h('div', { key: rule.id, class: 'ja-assert-row' }, [
                    h('input', {
                      type: 'checkbox',
                      class: 'ja-assert-checkbox',
                      checked: Boolean(rule.enabled),
                      title: '启用/禁用此断言',
                      onChange: e => updateRule(idx, { enabled: e.target.checked })
                    }),

                    h(
                      'select',
                      {
                        class: 'ja-assert-control ja-assert-select-target',
                        value: rule.target,
                        onChange: e => onTargetChange(idx, e.target.value)
                      },
                      TARGET_OPTIONS.map(opt =>
                        h(
                          'option',
                          { value: opt.value, selected: rule.target === opt.value },
                          opt.label
                        )
                      )
                    ),

                    rule.target === 'jsonPath' || rule.target === 'header'
                      ? h('input', {
                          type: 'text',
                          class: 'ja-assert-control ja-assert-input-prop',
                          value: rule.property || '',
                          placeholder:
                            rule.target === 'jsonPath'
                              ? '$.data.code 或 items[0].id'
                              : 'Content-Type',
                          onInput: e => updateRule(idx, { property: e.target.value })
                        })
                      : null,

                    h(
                      'select',
                      {
                        class: 'ja-assert-control ja-assert-select-op',
                        value: rule.operator,
                        onChange: e => updateRule(idx, { operator: e.target.value })
                      },
                      OPERATOR_OPTIONS.map(opt =>
                        h(
                          'option',
                          { value: opt.value, selected: rule.operator === opt.value },
                          opt.label
                        )
                      )
                    ),

                    rule.operator !== 'exists'
                      ? h('input', {
                          type: 'text',
                          class: 'ja-assert-control ja-assert-input-expected',
                          value: rule.expected || '',
                          placeholder: '期望值 (支持 {{var}})',
                          onInput: e => updateRule(idx, { expected: e.target.value })
                        })
                      : h('span', { class: 'ja-assert-exists-note' }, '仅校验存在且非 null'),

                    h(
                      'button',
                      {
                        class: 'ja-assert-del-btn',
                        title: '删除规则',
                        onClick: () => removeRule(idx)
                      },
                      [TrashIcon()]
                    )
                  ])
                )
          )
        ])
    }
  })

  // 3. 构建响应报告 Tab 组件
  const ResponseAssertionsTab = defineComponent({
    name: 'ExternalResponseAssertionsTab',
    setup() {
      const report = computed(() => {
        const execCtx = ctx.getLastExecutionContext()
        return execCtx?.metadata?.[ASSERTIONS_EXTENSION_KEY] ?? null
      })

      return () => {
        const rpt = report.value
        if (!rpt || rpt.total === 0) {
          return h('div', { class: 'ja-assert-root' }, [
            h('div', { class: 'ja-assert-resp-empty' }, [
              ShieldIcon(32),
              h('span', null, '当前请求未启用任何断言规则'),
              h(
                'span',
                { style: 'font-size:11px;opacity:0.75' },
                '可在上方「Assertions」标签页中添加规则后重新 Send'
              )
            ])
          ])
        }

        const allPassed = rpt.failed === 0
        return h('div', { class: 'ja-assert-root' }, [
          h(
            'div',
            {
              class: `ja-assert-banner ${allPassed ? 'ja-assert-banner-pass' : 'ja-assert-banner-fail'}`
            },
            [
              h('div', { class: 'ja-assert-banner-left' }, [
                allPassed ? CheckCircleIcon(16) : XCircleIcon(16),
                h(
                  'span',
                  null,
                  allPassed
                    ? `全部 ${rpt.total} 条断言均通过`
                    : `${rpt.failed} 条断言失败（共 ${rpt.total} 条）`
                )
              ]),
              h(
                'span',
                { class: 'ja-assert-banner-count' },
                `PASS ${rpt.passed} / ${rpt.total}`
              )
            ]
          ),

          h(
            'div',
            { class: 'ja-assert-list' },
            rpt.results.map(item =>
              h(
                'div',
                {
                  key: item.ruleId,
                  class: `ja-assert-result-card ${item.passed ? 'ja-assert-result-pass' : 'ja-assert-result-fail'}`
                },
                [
                  h('div', { class: 'ja-assert-result-top' }, [
                    h('div', { class: 'ja-assert-result-label-wrap' }, [
                      item.passed ? CheckCircleIcon(14) : XCircleIcon(14),
                      h('span', { class: 'ja-assert-result-label' }, item.label)
                    ]),
                    h(
                      'span',
                      {
                        class: `ja-assert-pill ${item.passed ? 'ja-assert-pill-pass' : 'ja-assert-pill-fail'}`
                      },
                      item.passed ? 'PASS' : 'FAIL'
                    )
                  ]),
                  h('div', { class: 'ja-assert-result-msg' }, item.message)
                ]
              )
            )
          )
        ])
      }
    }
  })

  // 4. 注册请求 & 响应 Tab
  ctx.registerRequestTab({
    id: 'assertions',
    order: 40,
    label: 'Assertions',
    component: RequestAssertionsTab,
    badgeCount: ({ request }) => getRequestAssertions(request).filter(r => r.enabled).length
  })

  ctx.registerResponseTab({
    id: 'assertions',
    order: 40,
    label: 'Assertions',
    component: ResponseAssertionsTab,
    badgeText: (_res, execCtx) => {
      const report = execCtx?.metadata?.[ASSERTIONS_EXTENSION_KEY]
      if (!report || report.total === 0) return undefined
      return `${report.passed}/${report.total}`
    },
    badgeClass: (_res, execCtx) => {
      const report = execCtx?.metadata?.[ASSERTIONS_EXTENSION_KEY]
      if (!report || report.total === 0) return undefined
      return report.failed === 0 ? 'assertions-badge-pass' : 'assertions-badge-fail'
    }
  })
}
