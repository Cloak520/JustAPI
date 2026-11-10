const METHODS_SET = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])

const VALUE_IGNORED_FLAGS = new Set([
  '-o',
  '--output',
  '-x',
  '--proxy',
  '--connect-timeout',
  '-m',
  '--max-time',
  '--cacert',
  '--cert',
  '--key',
  '--resolve',
  '--interface',
  '-w',
  '--write-out'
])

function defaultCreateEmptyRequest(overrides = {}) {
  return {
    schemaVersion: 1,
    id: overrides.id || crypto.randomUUID(),
    name: overrides.name ?? '新建请求',
    method: overrides.method ?? 'GET',
    path: overrides.path ?? '/',
    pathParams: overrides.pathParams ?? [],
    queryParams: overrides.queryParams ?? [],
    headers: overrides.headers ?? [],
    bodyType: overrides.bodyType ?? 'none',
    bodyContent: overrides.bodyContent ?? '',
    formFields: overrides.formFields && overrides.formFields.length > 0
      ? overrides.formFields
      : [{ id: crypto.randomUUID(), key: '', value: '', is_file: false, enabled: true }],
    subProjectId: overrides.subProjectId,
    fileName: overrides.fileName,
    group: overrides.group,
    extensions: overrides.extensions
  }
}

function parseQueryString(queryStr) {
  if (!queryStr || !queryStr.trim()) return []
  const clean = queryStr.replace(/^\?+/, '').trim()
  if (!clean) return []

  const result = []
  for (const pair of clean.split('&')) {
    if (!pair) continue
    const eqIdx = pair.indexOf('=')
    const rawK = eqIdx !== -1 ? pair.slice(0, eqIdx) : pair
    const rawV = eqIdx !== -1 ? pair.slice(eqIdx + 1) : ''
    let k = rawK
    let v = rawV
    try {
      k = decodeURIComponent(rawK)
    } catch {}
    try {
      v = decodeURIComponent(rawV)
    } catch {}
    result.push({ key: k, value: v })
  }
  return result
}

/**
 * POSIX/Bash 风格命令行分词器（支持行延续 `\`、单引号 `'...'`、双引号 `"..."` 及反斜杠转义）
 */
export function tokenizeShellCommand(input) {
  const normalized = input.replace(/\\\r?\n/g, ' ')
  const tokens = []
  let current = ''
  let inToken = false
  let i = 0

  while (i < normalized.length) {
    const ch = normalized[i]

    if (/\s/.test(ch)) {
      if (inToken) {
        tokens.push(current)
        current = ''
        inToken = false
      }
      i++
      continue
    }

    inToken = true

    if (ch === "'") {
      i++
      while (i < normalized.length && normalized[i] !== "'") {
        current += normalized[i]
        i++
      }
      i++
      continue
    }

    if (ch === '"' || (ch === '$' && normalized[i + 1] === "'")) {
      const isAnsiQuote = ch === '$'
      const quoteChar = isAnsiQuote ? "'" : '"'
      i += isAnsiQuote ? 2 : 1

      while (i < normalized.length && normalized[i] !== quoteChar) {
        if (normalized[i] === '\\' && i + 1 < normalized.length) {
          const next = normalized[i + 1]
          if (isAnsiQuote) {
            if (next === 'n') current += '\n'
            else if (next === 'r') current += '\r'
            else if (next === 't') current += '\t'
            else current += next
            i += 2
            continue
          }
          if (next === '"' || next === '\\' || next === '$' || next === '`') {
            current += next
            i += 2
            continue
          }
        }
        current += normalized[i]
        i++
      }
      i++
      continue
    }

    if (ch === '\\' && i + 1 < normalized.length) {
      current += normalized[i + 1]
      i += 2
      continue
    }

    current += ch
    i++
  }

  if (inToken) {
    tokens.push(current)
  }

  return tokens
}

function encodeBasicAuth(credentials) {
  const bytes = new TextEncoder().encode(credentials)
  let binary = ''
  for (const b of bytes) {
    binary += String.fromCharCode(b)
  }
  return btoa(binary)
}

function splitUrlAndQuery(rawUrl) {
  const qIdx = rawUrl.indexOf('?')
  if (qIdx === -1) {
    return { basePath: rawUrl, queryStr: '' }
  }
  const hashIdx = rawUrl.indexOf('#', qIdx)
  const basePath = rawUrl.slice(0, qIdx)
  const queryStr = hashIdx === -1 ? rawUrl.slice(qIdx + 1) : rawUrl.slice(qIdx + 1, hashIdx)
  return { basePath, queryStr }
}

function deriveRequestName(method, cleanUrl) {
  try {
    const withoutQuery = cleanUrl.split('?')[0]
    if (/^https?:\/\//i.test(withoutQuery)) {
      const u = new URL(withoutQuery)
      const pathname = u.pathname && u.pathname !== '/' ? u.pathname : '/'
      return `${method} ${pathname}`
    }
    return `${method} ${withoutQuery || '/'}`
  } catch {
    return `${method} cURL`
  }
}

export function isCurlCommand(rawInput) {
  const trimmed = rawInput.trim().replace(/^\$\s+/, '')
  return /^curl(?:\s|$)/i.test(trimmed)
}

export function parseCurlCommand(rawInput, createRequest = defaultCreateEmptyRequest) {
  const cleanedInput = rawInput.trim().replace(/^\$\s+/, '')
  const tokens = tokenizeShellCommand(cleanedInput)

  if (tokens.length === 0 || tokens[0].toLowerCase() !== 'curl') {
    throw new Error('请输入有效的 cURL 命令（应以 curl 开头）')
  }

  let explicitMethod = null
  let forceGet = false
  let targetUrl = ''
  const headers = []
  const dataParts = []
  const urlEncodedParts = []
  const formFields = []
  let basicAuth = null
  let hasDataFlag = false

  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i]

    if (tok === '-X' || tok === '--request') {
      const val = (tokens[++i] || '').toUpperCase()
      if (METHODS_SET.has(val)) explicitMethod = val
      continue
    }
    if (tok.startsWith('-X') && tok.length > 2) {
      const val = tok.slice(2).toUpperCase()
      if (METHODS_SET.has(val)) explicitMethod = val
      continue
    }

    if (tok === '-G' || tok === '--get') {
      forceGet = true
      continue
    }

    if (tok === '-I' || tok === '--head') {
      explicitMethod = 'HEAD'
      continue
    }

    if (tok === '-H' || tok === '--header') {
      const headerStr = tokens[++i] || ''
      const colonIdx = headerStr.indexOf(':')
      if (colonIdx !== -1) {
        const key = headerStr.slice(0, colonIdx).trim()
        const value = headerStr.slice(colonIdx + 1).trim()
        if (key) {
          headers.push({
            id: crypto.randomUUID(),
            key,
            value,
            enabled: true
          })
        }
      }
      continue
    }

    if (tok === '-A' || tok === '--user-agent') {
      const ua = tokens[++i] || ''
      if (ua) {
        headers.push({ id: crypto.randomUUID(), key: 'User-Agent', value: ua, enabled: true })
      }
      continue
    }

    if (tok === '-b' || tok === '--cookie') {
      const ck = tokens[++i] || ''
      if (ck) {
        headers.push({ id: crypto.randomUUID(), key: 'Cookie', value: ck, enabled: true })
      }
      continue
    }

    if (tok === '-u' || tok === '--user') {
      basicAuth = tokens[++i] || ''
      continue
    }

    if (
      tok === '-d' ||
      tok === '--data' ||
      tok === '--data-raw' ||
      tok === '--data-binary' ||
      tok === '--data-ascii'
    ) {
      const data = tokens[++i] ?? ''
      dataParts.push(data)
      hasDataFlag = true
      continue
    }

    if (tok === '--data-urlencode') {
      const raw = tokens[++i] ?? ''
      urlEncodedParts.push(raw)
      hasDataFlag = true
      continue
    }

    if (tok === '-F' || tok === '--form') {
      const fieldStr = tokens[++i] ?? ''
      const eqIdx = fieldStr.indexOf('=')
      if (eqIdx !== -1) {
        const key = fieldStr.slice(0, eqIdx).trim()
        let val = fieldStr.slice(eqIdx + 1)
        let isFile = false
        if (val.startsWith('@')) {
          isFile = true
          val = val.slice(1)
        }
        if (key) {
          formFields.push({
            id: crypto.randomUUID(),
            key,
            value: val,
            is_file: isFile,
            enabled: true
          })
        }
      }
      hasDataFlag = true
      continue
    }

    if (tok === '--url') {
      targetUrl = tokens[++i] || ''
      continue
    }

    if (VALUE_IGNORED_FLAGS.has(tok)) {
      i++
      continue
    }

    if (tok.startsWith('-')) {
      continue
    }

    if (!targetUrl) {
      targetUrl = tok
    }
  }

  if (!targetUrl) {
    throw new Error('未在 cURL 命令中找到请求 URL')
  }

  if (!/^https?:\/\//i.test(targetUrl) && !targetUrl.startsWith('{{')) {
    targetUrl = `https://${targetUrl}`
  }

  if (basicAuth && !headers.some(h => h.key.toLowerCase() === 'authorization')) {
    headers.push({
      id: crypto.randomUUID(),
      key: 'Authorization',
      value: `Basic ${encodeBasicAuth(basicAuth)}`,
      enabled: true
    })
  }

  let method = explicitMethod || (hasDataFlag && !forceGet ? 'POST' : 'GET')
  if (forceGet && !explicitMethod) {
    method = 'GET'
  }

  const { basePath, queryStr } = splitUrlAndQuery(targetUrl)
  const queryParams = parseQueryString(queryStr).map(q => ({
    id: crypto.randomUUID(),
    key: q.key,
    value: q.value,
    enabled: true
  }))

  let bodyType = 'none'
  let bodyContent = ''
  let finalFormFields

  const contentTypeHeader =
    headers.find(h => h.key.toLowerCase() === 'content-type')?.value.toLowerCase() || ''

  if (forceGet) {
    const extraPairs = [...dataParts, ...urlEncodedParts].join('&')
    for (const q of parseQueryString(extraPairs)) {
      queryParams.push({
        id: crypto.randomUUID(),
        key: q.key,
        value: q.value,
        enabled: true
      })
    }
  } else if (formFields.length > 0) {
    bodyType = 'form-data'
    finalFormFields = formFields
  } else if (urlEncodedParts.length > 0 || contentTypeHeader.includes('x-www-form-urlencoded')) {
    const combined = [...dataParts, ...urlEncodedParts].join('&')
    const parsed = parseQueryString(combined)
    if (parsed.length > 0) {
      bodyType = 'x-www-form-urlencoded'
      finalFormFields = parsed.map(p => ({
        id: crypto.randomUUID(),
        key: p.key,
        value: p.value,
        is_file: false,
        enabled: true
      }))
    } else if (combined) {
      bodyType = 'raw'
      bodyContent = combined
    }
  } else if (dataParts.length > 0) {
    const rawBody = dataParts.join('&')
    const trimmedBody = rawBody.trim()
    const looksLikeJson = trimmedBody.startsWith('{') || trimmedBody.startsWith('[')

    if (contentTypeHeader.includes('json') || looksLikeJson) {
      bodyType = 'json'
      try {
        bodyContent = JSON.stringify(JSON.parse(rawBody), null, 2)
      } catch {
        bodyContent = rawBody
      }
    } else {
      bodyType = 'raw'
      bodyContent = rawBody
    }
  }

  return createRequest({
    name: deriveRequestName(method, basePath),
    method,
    path: basePath || '/',
    queryParams,
    headers,
    bodyType,
    bodyContent,
    formFields: finalFormFields
  })
}

export function quotePosixArg(value) {
  if (/^[a-zA-Z0-9._:/@+-]+$/.test(value)) {
    return value
  }
  return `'${value.replace(/'/g, "'\\''")}'`
}

export function serializeToCurl(ctx) {
  const method = (ctx.request.method || 'GET').toUpperCase()
  const parts = [`curl -X ${method} ${quotePosixArg(ctx.resolvedUrl || '/')}`]

  for (const [k, v] of ctx.headers) {
    if (!k.trim()) continue
    parts.push(`-H ${quotePosixArg(`${k}: ${v}`)}`)
  }

  const bodyType = ctx.request.bodyType
  const formFields = ctx.request.formFields || []

  if (bodyType === 'form-data') {
    for (const f of formFields) {
      if (!f.enabled || !f.key.trim()) continue
      const expr = f.is_file ? `${f.key.trim()}=@${f.value}` : `${f.key.trim()}=${f.value}`
      parts.push(`-F ${quotePosixArg(expr)}`)
    }
  } else if (bodyType === 'x-www-form-urlencoded') {
    for (const f of formFields) {
      if (!f.enabled || !f.key.trim()) continue
      parts.push(`--data-urlencode ${quotePosixArg(`${f.key.trim()}=${f.value}`)}`)
    }
  } else if (ctx.body && ctx.body.length > 0) {
    parts.push(`--data-raw ${quotePosixArg(ctx.body)}`)
  }

  return parts.join(' \\\n  ')
}

export function activate(ctx) {
  ctx.registerRequestImporter({
    id: 'justapi.curl',
    order: 10,
    label: 'cURL',
    description: '粘贴浏览器 DevTools 或终端复制的 cURL 命令',
    placeholder:
      'curl -X POST https://api.example.com/v1/users \\\n  -H "Content-Type: application/json" \\\n  -d \'{"name": "JustAPI"}\'',
    supports: isCurlCommand,
    parse: rawInput => parseCurlCommand(rawInput, ctx.createEmptyRequest)
  })

  ctx.registerRequestExporter({
    id: 'justapi.curl',
    order: 10,
    label: '复制 cURL',
    description: '将当前请求（含合并头与变量替换后参数）导出为 cURL 命令',
    exportRequest: serializeToCurl
  })
}

