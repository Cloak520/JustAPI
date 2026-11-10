const SUPPORTED_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options']
const MAX_SCHEMA_DEPTH = 6

function isPlainObject(val) {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val)
}

function stringifyScalar(val) {
  if (val === undefined || val === null) return ''
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  try {
    return JSON.stringify(val)
  } catch {
    return String(val)
  }
}

/**
 * 解析本地 JSON Pointer 引用（如 `#/components/schemas/User`、`#/definitions/Order`）
 */
export function resolveJsonPointer(rootDoc, refStr) {
  if (!isPlainObject(rootDoc) || typeof refStr !== 'string') return undefined
  if (!refStr.startsWith('#')) return undefined
  if (refStr === '#' || refStr === '#/') return rootDoc

  const pointer = refStr.slice(1)
  if (!pointer.startsWith('/')) return undefined

  const segments = pointer
    .slice(1)
    .split('/')
    .map(seg => {
      const unescaped = seg.replace(/~1/g, '/').replace(/~0/g, '~')
      try {
        return decodeURIComponent(unescaped)
      } catch {
        return unescaped
      }
    })

  let current = rootDoc
  for (const seg of segments) {
    if (Array.isArray(current)) {
      const idx = Number(seg)
      if (!Number.isInteger(idx) || idx < 0 || idx >= current.length) return undefined
      current = current[idx]
    } else if (isPlainObject(current)) {
      if (!Object.prototype.hasOwnProperty.call(current, seg)) return undefined
      current = current[seg]
    } else {
      return undefined
    }
  }

  return current
}

/**
 * 递归解引用对象中的 `$ref`（含环引用保护与同级覆盖字段合并）
 */
export function resolveRefNode(node, rootDoc, visitedRefs = new Set()) {
  if (!isPlainObject(node)) return node
  if (typeof node.$ref !== 'string' || !node.$ref.startsWith('#')) {
    return node
  }

  const refStr = node.$ref
  if (visitedRefs.has(refStr)) {
    return undefined
  }

  const target = resolveJsonPointer(rootDoc, refStr)
  if (!isPlainObject(target)) {
    return target
  }

  const nextVisited = new Set(visitedRefs)
  nextVisited.add(refStr)
  const resolvedTarget = resolveRefNode(target, rootDoc, nextVisited)
  if (!isPlainObject(resolvedTarget)) {
    return resolvedTarget
  }

  // OpenAPI 3.1 允许 `$ref` 同级附带 description/summary/example 等覆盖属性
  const { $ref: _ignored, ...siblingOverrides } = node
  if (Object.keys(siblingOverrides).length === 0) {
    return resolvedTarget
  }
  return { ...resolvedTarget, ...siblingOverrides }
}

function pickFirstExamplesValue(examplesObj, rootDoc) {
  if (!isPlainObject(examplesObj)) return undefined
  for (const entry of Object.values(examplesObj)) {
    const resolved = resolveRefNode(entry, rootDoc)
    if (isPlainObject(resolved) && resolved.value !== undefined) {
      return resolved.value
    }
    if (resolved !== undefined && !isPlainObject(resolved)) {
      return resolved
    }
  }
  return undefined
}

function resolveSchemaType(schema) {
  if (!isPlainObject(schema)) return undefined
  if (typeof schema.type === 'string') return schema.type
  if (Array.isArray(schema.type)) {
    const nonNull = schema.type.find(t => typeof t === 'string' && t !== 'null')
    return nonNull || schema.type[0]
  }
  if (isPlainObject(schema.properties) || isPlainObject(schema.additionalProperties)) {
    return 'object'
  }
  if (schema.items) return 'array'
  return undefined
}

function generateStringByFormat(format) {
  switch (format) {
    case 'date-time':
      return '2026-01-01T00:00:00Z'
    case 'date':
      return '2026-01-01'
    case 'time':
      return '00:00:00'
    case 'uuid':
      return '00000000-0000-0000-0000-000000000000'
    case 'email':
      return 'user@example.com'
    case 'uri':
    case 'url':
      return 'https://example.com'
    case 'ipv4':
      return '127.0.0.1'
    case 'ipv6':
      return '::1'
    default:
      return 'string'
  }
}

/**
 * 基于 OpenAPI / JSON Schema 递归生成请求体示例数据（支持 $ref / allOf / oneOf / anyOf / enum / format）
 */
export function generateExampleFromSchema(
  rawSchema,
  rootDoc,
  depth = 0,
  visitedRefs = new Set()
) {
  if (!isPlainObject(rawSchema) || depth > MAX_SCHEMA_DEPTH) {
    return undefined
  }

  const nextVisited = new Set(visitedRefs)
  if (typeof rawSchema.$ref === 'string' && rawSchema.$ref.startsWith('#')) {
    if (nextVisited.has(rawSchema.$ref)) {
      return undefined
    }
  }

  const schema = resolveRefNode(rawSchema, rootDoc, visitedRefs)
  if (!isPlainObject(schema)) {
    return undefined
  }
  if (typeof rawSchema.$ref === 'string' && rawSchema.$ref.startsWith('#')) {
    nextVisited.add(rawSchema.$ref)
  }

  if (schema.example !== undefined) {
    return schema.example
  }
  if (Array.isArray(schema.examples) && schema.examples.length > 0) {
    return schema.examples[0]
  }
  if (schema.default !== undefined) {
    return schema.default
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0]
  }

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    const mergedObj = {}
    let hasObjectBranch = false
    let fallbackVal = undefined

    for (const sub of schema.allOf) {
      const sample = generateExampleFromSchema(sub, rootDoc, depth + 1, nextVisited)
      if (isPlainObject(sample)) {
        Object.assign(mergedObj, sample)
        hasObjectBranch = true
      } else if (fallbackVal === undefined && sample !== undefined) {
        fallbackVal = sample
      }
    }

    if (isPlainObject(schema.properties)) {
      hasObjectBranch = true
      for (const [propKey, propSchema] of Object.entries(schema.properties)) {
        const resolvedProp = resolveRefNode(propSchema, rootDoc, nextVisited)
        if (isPlainObject(resolvedProp) && resolvedProp.readOnly === true) {
          continue
        }
        const val = generateExampleFromSchema(propSchema, rootDoc, depth + 1, nextVisited)
        if (val !== undefined) {
          mergedObj[propKey] = val
        }
      }
    }

    if (hasObjectBranch) return mergedObj
    if (fallbackVal !== undefined) return fallbackVal
  }

  const unionList = Array.isArray(schema.oneOf)
    ? schema.oneOf
    : Array.isArray(schema.anyOf)
      ? schema.anyOf
      : null
  if (unionList && unionList.length > 0) {
    for (const variant of unionList) {
      const resolvedVar = resolveRefNode(variant, rootDoc, nextVisited)
      if (isPlainObject(resolvedVar) && resolvedVar.type === 'null') continue
      const sample = generateExampleFromSchema(variant, rootDoc, depth + 1, nextVisited)
      if (sample !== undefined) return sample
    }
  }

  const schemaType = resolveSchemaType(schema)
  if (schemaType === 'object') {
    const obj = {}
    if (isPlainObject(schema.properties)) {
      for (const [propKey, propSchema] of Object.entries(schema.properties)) {
        const resolvedProp = resolveRefNode(propSchema, rootDoc, nextVisited)
        if (isPlainObject(resolvedProp) && resolvedProp.readOnly === true) {
          continue
        }
        const propVal = generateExampleFromSchema(propSchema, rootDoc, depth + 1, nextVisited)
        obj[propKey] = propVal !== undefined ? propVal : null
      }
      return obj
    }
    if (isPlainObject(schema.additionalProperties)) {
      const val = generateExampleFromSchema(
        schema.additionalProperties,
        rootDoc,
        depth + 1,
        nextVisited
      )
      obj.key = val !== undefined ? val : 'value'
      return obj
    }
    return obj
  }

  if (schemaType === 'array') {
    if (!schema.items) return []
    const itemVal = generateExampleFromSchema(schema.items, rootDoc, depth + 1, nextVisited)
    return itemVal !== undefined ? [itemVal] : []
  }

  if (schemaType === 'integer' || schemaType === 'number') {
    return 0
  }

  if (schemaType === 'boolean') {
    return false
  }

  if (schemaType === 'string') {
    return generateStringByFormat(schema.format)
  }

  return undefined
}

export function extractBaseUrl(doc) {
  if (!doc || typeof doc !== 'object') return undefined

  if (Array.isArray(doc.servers) && doc.servers.length > 0) {
    const firstServer = doc.servers[0]
    let firstUrl = typeof firstServer?.url === 'string' ? firstServer.url.trim() : ''
    if (firstUrl) {
      if (isPlainObject(firstServer.variables)) {
        firstUrl = firstUrl.replace(/\{([^{}]+)\}/g, (match, varName) => {
          const defVal = firstServer.variables[varName]?.default
          return defVal !== undefined && defVal !== null ? String(defVal) : match
        })
      }
      return firstUrl
    }
  }

  if (typeof doc.host === 'string' && doc.host.trim()) {
    const scheme =
      Array.isArray(doc.schemes) && typeof doc.schemes[0] === 'string' && doc.schemes[0].trim()
        ? doc.schemes[0].trim()
        : 'https'
    const basePath =
      typeof doc.basePath === 'string' ? doc.basePath.trim().replace(/\/+$/, '') : ''
    return `${scheme}://${doc.host.trim()}${basePath}`
  }

  return undefined
}

export function extractDefaultParamValue(param, rootDoc) {
  if (!param || typeof param !== 'object') return ''
  const resolvedParam = rootDoc ? resolveRefNode(param, rootDoc) || param : param
  const resolvedSchema =
    rootDoc && resolvedParam.schema
      ? resolveRefNode(resolvedParam.schema, rootDoc) || resolvedParam.schema
      : resolvedParam.schema

  const candidate =
    resolvedParam.example ??
    pickFirstExamplesValue(resolvedParam.examples, rootDoc) ??
    resolvedParam.default ??
    resolvedSchema?.example ??
    (Array.isArray(resolvedSchema?.examples) ? resolvedSchema.examples[0] : undefined) ??
    resolvedSchema?.default ??
    (Array.isArray(resolvedSchema?.enum) ? resolvedSchema.enum[0] : undefined)

  return stringifyScalar(candidate)
}

function mergeOperationParameters(pathParamsRaw, opParamsRaw, rootDoc) {
  const merged = new Map()
  const addParam = rawParam => {
    const p = resolveRefNode(rawParam, rootDoc)
    if (!isPlainObject(p)) return
    const pIn = typeof p.in === 'string' ? p.in : ''
    const pName = typeof p.name === 'string' ? p.name : ''
    if (!pName) return
    merged.set(`${pIn}:${pName}`, p)
  }

  if (Array.isArray(pathParamsRaw)) {
    for (const p of pathParamsRaw) addParam(p)
  }
  if (Array.isArray(opParamsRaw)) {
    for (const p of opParamsRaw) addParam(p)
  }

  return Array.from(merged.values())
}

function extractJsonBodyExample(jsonMedia, rootDoc) {
  if (!isPlainObject(jsonMedia)) {
    return '{\n  "example": "value"\n}'
  }

  const explicit =
    jsonMedia.example !== undefined
      ? jsonMedia.example
      : pickFirstExamplesValue(jsonMedia.examples, rootDoc)

  if (explicit !== undefined) {
    if (typeof explicit === 'string') return explicit
    try {
      return JSON.stringify(explicit, null, 2)
    } catch {
      return '{\n  "example": "value"\n}'
    }
  }

  if (jsonMedia.schema) {
    const generated = generateExampleFromSchema(jsonMedia.schema, rootDoc)
    if (generated !== undefined) {
      if (typeof generated === 'string') return generated
      try {
        return JSON.stringify(generated, null, 2)
      } catch {
        return '{\n  "example": "value"\n}'
      }
    }
  }

  return '{\n  "example": "value"\n}'
}

function isBinarySchema(schema) {
  if (!isPlainObject(schema)) return false
  if (schema.format === 'binary' || schema.format === 'byte' || schema.type === 'file') {
    return true
  }
  if (schema.type === 'array' && isPlainObject(schema.items)) {
    return (
      schema.items.format === 'binary' ||
      schema.items.format === 'byte' ||
      schema.items.type === 'file'
    )
  }
  return false
}

function extractFormFieldsFromMedia(media, rootDoc) {
  if (!isPlainObject(media) || !media.schema) return []
  const resolvedSchema = resolveRefNode(media.schema, rootDoc)
  if (!isPlainObject(resolvedSchema)) return []

  const propEntries = []
  if (isPlainObject(resolvedSchema.properties)) {
    propEntries.push(...Object.entries(resolvedSchema.properties))
  } else if (Array.isArray(resolvedSchema.allOf)) {
    for (const sub of resolvedSchema.allOf) {
      const subResolved = resolveRefNode(sub, rootDoc)
      if (isPlainObject(subResolved?.properties)) {
        propEntries.push(...Object.entries(subResolved.properties))
      }
    }
  }

  const fields = []
  for (const [key, rawProp] of propEntries) {
    const prop = resolveRefNode(rawProp, rootDoc) || rawProp
    const isFile = isBinarySchema(prop)
    let val = ''
    if (!isFile) {
      const sample = generateExampleFromSchema(prop, rootDoc)
      if (sample !== undefined && sample !== null) {
        val = typeof sample === 'string' ? sample : stringifyScalar(sample)
      }
    }
    fields.push({
      id: `form_${key}`,
      key,
      value: val,
      is_file: isFile,
      enabled: true
    })
  }
  return fields
}

function pickMediaEntryByMime(rbContent, targetMime) {
  const lowerTarget = targetMime.toLowerCase()
  if (isPlainObject(rbContent[targetMime])) {
    return rbContent[targetMime]
  }
  for (const [mediaType, mediaObj] of Object.entries(rbContent)) {
    const baseMime = mediaType.split(';')[0].trim().toLowerCase()
    if (baseMime === lowerTarget && isPlainObject(mediaObj)) {
      return mediaObj
    }
  }
  return null
}

function pickJsonMediaEntry(rbContent) {
  if (isPlainObject(rbContent['application/json'])) {
    return rbContent['application/json']
  }
  for (const [mediaType, mediaObj] of Object.entries(rbContent)) {
    const lower = mediaType.toLowerCase()
    if (lower.includes('json') && isPlainObject(mediaObj)) {
      return mediaObj
    }
  }
  return null
}

function pickRawMediaEntry(rbContent) {
  for (const candidate of ['text/plain', 'application/xml', 'text/xml', '*/*']) {
    if (isPlainObject(rbContent[candidate])) {
      return rbContent[candidate]
    }
  }
  for (const [mediaType, mediaObj] of Object.entries(rbContent)) {
    const lower = mediaType.toLowerCase()
    if ((lower.startsWith('text/') || lower.includes('xml')) && isPlainObject(mediaObj)) {
      return mediaObj
    }
  }
  return null
}

export function supportsOpenApiDocument(rawText, source = '') {
  const txt = typeof rawText === 'string' ? rawText : ''
  if (/["']?(openapi|swagger)["']?\s*:/i.test(txt)) {
    return true
  }
  const src = typeof source === 'string' ? source.toLowerCase() : ''
  return (
    src.includes('swagger') ||
    src.includes('api-docs') ||
    src.endsWith('.yaml') ||
    src.endsWith('.yml')
  )
}

export function parseOpenApiDocument(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error('无效的 Swagger / OpenAPI 格式（根节点必须为对象）')
  }

  if (!doc.openapi && !doc.swagger && !doc.paths) {
    throw new Error('无效的 Swagger / OpenAPI 文档（缺少 openapi / swagger / paths 字段）')
  }

  const title =
    typeof doc.info?.title === 'string' && doc.info.title.trim()
      ? doc.info.title.trim()
      : 'Swagger API'
  const baseUrl = extractBaseUrl(doc)
  const requests = []

  const paths = doc.paths
  if (paths && typeof paths === 'object' && !Array.isArray(paths)) {
    for (const [pathStr, rawPathItem] of Object.entries(paths)) {
      const pathItem = resolveRefNode(rawPathItem, doc)
      if (!isPlainObject(pathItem)) continue

      for (const method of SUPPORTED_METHODS) {
        const op = pathItem[method]
        if (!isPlainObject(op)) continue

        const methodUpper = method.toUpperCase()
        const rawSummary = typeof op.summary === 'string' ? op.summary.trim() : ''
        const rawOpId = typeof op.operationId === 'string' ? op.operationId.trim() : ''
        const reqName = rawSummary || rawOpId || pathStr

        const firstTag =
          Array.isArray(op.tags) && typeof op.tags[0] === 'string' ? op.tags[0].trim() : ''
        const groupName = firstTag || undefined

        const pathParams = []
        const queryParams = []
        const headers = []
        const formFields = []
        let bodyType = 'none'
        let bodyContent = ''
        let hasSwagger2FormData = false
        let hasSwagger2FileField = false

        const params = mergeOperationParameters(pathItem.parameters, op.parameters, doc)
        for (const param of params) {
          const pIn = typeof param.in === 'string' ? param.in : ''
          const pName = typeof param.name === 'string' ? param.name : ''
          if (!pName) continue

          const item = {
            id: `${pIn}_${pName}`,
            key: pName,
            value: extractDefaultParamValue(param, doc),
            enabled: true,
            description: typeof param.description === 'string' ? param.description : undefined
          }

          if (pIn === 'path') {
            pathParams.push(item)
          } else if (pIn === 'query') {
            queryParams.push(item)
          } else if (pIn === 'header') {
            headers.push(item)
          } else if (pIn === 'body') {
            bodyType = 'json'
            bodyContent = extractJsonBodyExample(
              { example: param.example, schema: param.schema },
              doc
            )
          } else if (pIn === 'formData') {
            hasSwagger2FormData = true
            const isFile = param.type === 'file'
            if (isFile) hasSwagger2FileField = true
            formFields.push({
              id: `form_${pName}`,
              key: pName,
              value: isFile ? '' : item.value,
              is_file: isFile,
              enabled: true
            })
          }
        }

        if (hasSwagger2FormData) {
          const consumes = Array.isArray(op.consumes)
            ? op.consumes
            : Array.isArray(doc.consumes)
              ? doc.consumes
              : []
          const prefersUrlEncoded =
            !hasSwagger2FileField &&
            consumes.some(c => String(c).toLowerCase().includes('x-www-form-urlencoded')) &&
            !consumes.some(c => String(c).toLowerCase().includes('multipart/form-data'))
          bodyType = prefersUrlEncoded ? 'x-www-form-urlencoded' : 'form-data'
        }

        const resolvedRb = resolveRefNode(op.requestBody, doc)
        const rbContent = resolvedRb?.content
        if (isPlainObject(rbContent)) {
          const jsonMedia = pickJsonMediaEntry(rbContent)
          const urlEncodedMedia = !jsonMedia
            ? pickMediaEntryByMime(rbContent, 'application/x-www-form-urlencoded')
            : null
          const multipartMedia =
            !jsonMedia && !urlEncodedMedia
              ? pickMediaEntryByMime(rbContent, 'multipart/form-data')
              : null

          if (jsonMedia) {
            bodyType = 'json'
            bodyContent = extractJsonBodyExample(jsonMedia, doc)
          } else if (urlEncodedMedia) {
            bodyType = 'x-www-form-urlencoded'
            const parsedFields = extractFormFieldsFromMedia(urlEncodedMedia, doc)
            if (parsedFields.length > 0) {
              formFields.splice(0, formFields.length, ...parsedFields)
            }
          } else if (multipartMedia) {
            bodyType = 'form-data'
            const parsedFields = extractFormFieldsFromMedia(multipartMedia, doc)
            if (parsedFields.length > 0) {
              formFields.splice(0, formFields.length, ...parsedFields)
            }
          } else {
            const rawMedia = pickRawMediaEntry(rbContent)
            if (rawMedia) {
              bodyType = 'raw'
              const rawExample =
                rawMedia.example ??
                pickFirstExamplesValue(rawMedia.examples, doc) ??
                (rawMedia.schema ? generateExampleFromSchema(rawMedia.schema, doc) : undefined)
              bodyContent = rawExample !== undefined ? stringifyScalar(rawExample) : ''
            }
          }
        }

        const cleanPathId =
          pathStr
            .replace(/^\/+/, '')
            .replace(/\//g, '_')
            .replace(/[{}]/g, '') || 'root'
        const safeId = `${methodUpper}_${cleanPathId}`
        const fileName = groupName
          ? `${groupName.replace(/[/\\:*?"<>|]/g, '_')}/${safeId}.json`
          : `${safeId}.json`

        requests.push({
          schemaVersion: 1,
          id: safeId,
          name: reqName,
          method: methodUpper,
          path: pathStr,
          pathParams,
          queryParams,
          headers,
          bodyType,
          bodyContent,
          formFields,
          fileName,
          group: groupName
        })
      }
    }
  }

  return {
    title,
    baseUrl,
    requests,
    sourceFormat: 'openapi'
  }
}

export async function parseOpenApiContent(rawText, helpers) {
  if (!helpers || typeof helpers.parseStructuredDocument !== 'function') {
    return parseOpenApiDocument(JSON.parse(rawText))
  }
  const doc = await helpers.parseStructuredDocument(rawText)
  return parseOpenApiDocument(doc)
}

export function activate(ctx) {
  ctx.registerCollectionImporter({
    id: 'justapi.swagger',
    order: 10,
    label: 'Swagger / OpenAPI (v2.0 / v3.0 / v3.1)',
    shortLabel: 'Swagger',
    description: '支持 JSON 与 YAML 格式的 Swagger 2.0 / OpenAPI 3.0 / 3.1 规范导入与一键刷新',
    sourcePlaceholder:
      'http://localhost:8080/v3/api-docs 或 https://petstore.swagger.io/v2/swagger.json',
    supportsRefresh: true,
    supports: (rawText, source) => supportsOpenApiDocument(rawText, source),
    parse: (rawText, helpers) => parseOpenApiContent(rawText, helpers)
  })
}
