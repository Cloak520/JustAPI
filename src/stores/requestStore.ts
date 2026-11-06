import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useStorage } from '@vueuse/core'
import type { HttpMethod, BodyType, KeyValuePair, ApiResponse, CookieItem, NetworkSettings } from '@/types'
import { extractPathVariables, parseQueryString } from '@/utils/parser'
import { interpolate, inspectInterpolationTokens } from '@/utils/interpolation'
import { useProjectStore } from './projectStore'
import { useTabStore } from './tabStore'

export const useRequestStore = defineStore('request', () => {
  // 极简网络与 Cookie 配置
  const networkSettings = useStorage<NetworkSettings>('justapi_network_settings', {
    dangerouslyDisableSsl: false,
    enableProxy: false,
    proxyUrl: 'http://127.0.0.1:7890',
    enableCookieJar: true
  })

  // 监听网络设置变动，若已打开项目，自动持久化至当前项目的 project.json
  watch(
    networkSettings,
    async (newVal) => {
      const projectStore = useProjectStore()
      if (projectStore.hasProject && projectStore.projectConfig) {
        await projectStore.updateNetworkSettings(newVal)
      }
    },
    { deep: true }
  )

  // 内存/会话 Cookie Jar 列表
  const sessionCookies = useStorage<CookieItem[]>('justapi_session_cookies', [])
  // 当前请求基础状态
  const method = ref<HttpMethod>('GET')
  const baseUrl = ref('https://httpbin.org')
  const path = ref('/')
  const group = ref('')
  const pathParams = ref<KeyValuePair[]>([])
  const queryParams = ref<KeyValuePair[]>([
    { id: '1', key: 'name', value: 'justapi', enabled: true, description: 'Client name' }
  ])
  const headers = ref<KeyValuePair[]>([
    { id: 'h1', key: 'User-Agent', value: 'JustAPI-Client/0.1', enabled: true },
    { id: 'h2', key: 'Accept', value: 'application/json', enabled: true }
  ])
  const bodyType = ref<BodyType>('none')
  const bodyContent = ref('{\n  "message": "Hello from JustAPI",\n  "version": 1\n}')
  const formFields = ref<Array<{ id: string; key: string; value: string; is_file: boolean; enabled: boolean }>>([
    { id: 'f1', key: '', value: '', is_file: false, enabled: true }
  ])

  // 发送中与响应状态
  const loading = ref(false)
  const currentRequestId = ref<string | null>(null)
  const response = ref<ApiResponse | null>(null)
  const errorMessage = ref<string | null>(null)

  // 监听 path 变动，自动提取/同步 Path Variables
  watch(path, (newPath) => {
    const extracted = extractPathVariables(newPath)
    // 保留已有值
    const existingMap = new Map(pathParams.value.map(p => [p.key, p.value]))
    pathParams.value = extracted.map(varName => ({
      id: varName,
      key: varName,
      value: existingMap.get(varName) || '',
      enabled: true
    }))
  }, { immediate: true })

  // 辅助函数：编码参数时保护 {{variable}} 避免被 URLSearchParams 破坏为 %7B%7B...%7D%7D
  function encodeParamPreservingVariables(str: string): string {
    if (!str) return ''
    const tokens: string[] = []
    const placeholderStr = str.replace(/\{\{\s*([a-zA-Z0-9_$-]+)\s*\}\}/g, (match) => {
      const idx = tokens.length
      tokens.push(match)
      return `__VAR_TOK_${idx}__`
    })
    const encoded = encodeURIComponent(placeholderStr)
    return encoded.replace(/__VAR_TOK_(\d+)__/g, (_, idx) => tokens[Number(idx)])
  }

  // 实时计算最终拼接后的完整 URL (含 BaseURL、替换后的 Path 参数和 Query 参数)
  const resolvedUrl = computed(() => {
    let cleanBase = baseUrl.value.trim().replace(/\/+$/, '')
    let cleanPath = path.value.trim()

    // 1. 替换 Path Variables (保护 {{...}})
    for (const p of pathParams.value) {
      if (p.key) {
        const safeVal = encodeParamPreservingVariables(p.value)
        cleanPath = cleanPath.replaceAll(`{${p.key}}`, safeVal)
        const escapedKey = p.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        cleanPath = cleanPath.replace(new RegExp(`(^|\\/):${escapedKey}(?=[\\/?#]|$)`, 'g'), `$1${safeVal}`)
      }
    }

    // 2. 分离基础路径与 URL 自带的 Query String (若用户直接在地址栏手输了 ?key=val)
    const qIndex = cleanPath.indexOf('?')
    let basePath = cleanPath
    let inlineQueryStr = ''
    if (qIndex !== -1) {
      basePath = cleanPath.slice(0, qIndex)
      inlineQueryStr = cleanPath.slice(qIndex + 1)
    }

    // 3. 拼接 BaseURL 与相对基础路径
    let fullUrl = ''
    if (/^https?:\/\//i.test(basePath) || basePath.startsWith('{{')) {
      fullUrl = basePath
    } else {
      if (basePath && !basePath.startsWith('/')) {
        basePath = '/' + basePath
      }
      fullUrl = `${cleanBase}${basePath}`
    }

    // 4. 智能合并 URL 内置参数与表格手输的 Query Params，彻底避免同名参数重复传输 (如 key=1,1)
    const tableDisabledKeys = new Set(
      queryParams.value.filter(p => !p.enabled && p.key.trim()).map(p => p.key.trim())
    )
    const tableActiveParams = queryParams.value.filter(p => p.enabled && p.key.trim())
    const tableKeySet = new Set(tableActiveParams.map(p => p.key.trim()))

    const urlParams = parseQueryString(inlineQueryStr)
    const finalParamPairs: Array<{ key: string; value: string }> = []

    // 4.1 对于 URL 中的内置参数：
    // 若表格中未定义该 key，且未被表格显式禁用，则保留 URL 内置参数
    for (const p of urlParams) {
      const k = p.key.trim()
      if (!k) continue
      if (tableDisabledKeys.has(k)) continue
      if (!tableKeySet.has(k)) {
        finalParamPairs.push({ key: k, value: p.value })
      }
    }

    // 4.2 对于表格中的激活参数（手输的 params）：
    // 表格中的参数具有绝对权威（覆盖 URL 中的同名参数，并包含表格新增的参数）
    for (const p of tableActiveParams) {
      finalParamPairs.push({ key: p.key.trim(), value: p.value })
    }

    // 5. 组装最终查询参数字符串 (保护 {{...}})
    if (finalParamPairs.length > 0) {
      const parts = finalParamPairs.map(p => {
        const k = encodeParamPreservingVariables(p.key)
        const v = encodeParamPreservingVariables(p.value)
        return `${k}=${v}`
      })
      fullUrl = `${fullUrl}?${parts.join('&')}`
    }

    return fullUrl
  })

  // 实时预览 BaseURL 插值计算值
  const interpolatedBaseUrl = computed(() => {
    try {
      const projStore = useProjectStore()
      const tabStore = useTabStore()
      const activeTab = tabStore.tabs.find(t => t.id === tabStore.activeTabId)
      const varMap = projStore.getEffectiveVariableMap(activeTab?.subProjectDir)
      return interpolate(baseUrl.value, varMap)
    } catch {
      return baseUrl.value
    }
  })

  // 实时预览插值计算后的最终完整 URL
  const interpolatedUrl = computed(() => {
    try {
      const projStore = useProjectStore()
      const tabStore = useTabStore()
      const activeTab = tabStore.tabs.find(t => t.id === tabStore.activeTabId)
      const varMap = projStore.getEffectiveVariableMap(activeTab?.subProjectDir)
      return interpolate(resolvedUrl.value, varMap)
    } catch {
      return resolvedUrl.value
    }
  })

  // 提取当前 URL 中所包含的动态变量 Tokens 详情 (供 Tooltip / 标签状态使用)
  const urlVariableTokens = computed(() => {
    try {
      const projStore = useProjectStore()
      const tabStore = useTabStore()
      const activeTab = tabStore.tabs.find(t => t.id === tabStore.activeTabId)
      const varMap = projStore.getEffectiveVariableMap(activeTab?.subProjectDir)
      return inspectInterpolationTokens(resolvedUrl.value, varMap)
    } catch {
      return []
    }
  })

  // 发送 RESTful 请求
  async function send() {
    if (!resolvedUrl.value) return
    loading.value = true
    errorMessage.value = null
    response.value = null

    let finalUrl = ''
    try {
      const projStore = useProjectStore()
      const tabStore = useTabStore()
      const activeTab = tabStore.tabs.find(t => t.id === tabStore.activeTabId)
      const varMap = projStore.getEffectiveVariableMap(activeTab?.subProjectDir)

      // 1. 动态插值解析请求最终 URL (含 BaseURL, 路径参数, Query 参数)
      finalUrl = interpolate(resolvedUrl.value, varMap)

      if (!/^https?:\/\//i.test(finalUrl)) {
        throw new Error(`无效的请求 URL: "${finalUrl}"。请求地址必须以 http:// 或 https:// 开头，请在顶部设置 BaseURL 或在环境变量/路径中使用完整地址。`)
      }

      // 2. 组装并插值 Header 数组 (合并项目与子项目级联继承的 Headers + 请求自身独立 Headers，同名 key 接口优先覆盖)
      const effectiveInheritedHeaders = projStore.resolveEffectiveHeaders(activeTab?.subProjectDir)
      const headerMap = new Map<string, { key: string; value: string; enabled: boolean }>()

      // 2.1 先载入公共继承 Headers
      for (const h of effectiveInheritedHeaders) {
        if (h.key.trim()) {
          headerMap.set(h.key.trim().toLowerCase(), {
            key: h.key.trim(),
            value: h.value || '',
            enabled: h.enabled !== false
          })
        }
      }

      // 2.2 接口自身 Headers 覆盖公共 Headers (同名 key 覆盖值和启用状态)
      for (const h of headers.value) {
        if (h.key.trim()) {
          headerMap.set(h.key.trim().toLowerCase(), {
            key: h.key.trim(),
            value: h.value || '',
            enabled: h.enabled !== false
          })
        }
      }

      // 2.3 仅保留 enabled === true 的 Headers 并进行动态插值
      const validHeaders: [string, string][] = Array.from(headerMap.values())
        .filter(h => h.enabled && h.key.trim())
        .map(h => [interpolate(h.key.trim(), varMap), interpolate(h.value, varMap)])

      // 3. 组装并插值 Form 字段
      const validFormFields = formFields.value
        .filter(f => f.enabled && f.key.trim())
        .map(f => ({
          key: interpolate(f.key.trim(), varMap),
          value: interpolate(f.value, varMap),
          is_file: f.is_file
        }))

      // 4. 插值请求 Body 内容
      let finalBody: string | null = null
      if (['json', 'raw'].includes(bodyType.value) && bodyContent.value) {
        finalBody = interpolate(bodyContent.value, varMap)
      }

      // 5. 如果开启了 Cookie Jar，且请求头中未显式包含 Cookie，自动注入匹配域名的 Cookie
      if (networkSettings.value.enableCookieJar && sessionCookies.value.length > 0) {
        const hasManualCookie = validHeaders.some(([k]) => k.toLowerCase() === 'cookie')
        if (!hasManualCookie) {
          try {
            const urlObj = new URL(finalUrl)
            const host = urlObj.hostname
            const matchingCookies = sessionCookies.value.filter(c => {
              if (!c.domain) return true
              const cleanDomain = c.domain.replace(/^\./, '').toLowerCase()
              return host.toLowerCase() === cleanDomain || host.toLowerCase().endsWith('.' + cleanDomain)
            })
            if (matchingCookies.length > 0) {
              const cookieHeaderVal = matchingCookies.map(c => `${c.name}=${c.value}`).join('; ')
              validHeaders.push(['Cookie', cookieHeaderVal])
            }
          } catch {
            // ignore URL parse error
          }
        }
      }

      const payload = {
        url: finalUrl,
        method: method.value,
        headers: validHeaders,
        bodyType: bodyType.value,
        bodyContent: finalBody,
        formFields: ['form-data', 'x-www-form-urlencoded'].includes(bodyType.value) ? validFormFields : null,
        timeoutMs: 30000,
        dangerouslyDisableSsl: networkSettings.value.dangerouslyDisableSsl,
        proxyUrl: networkSettings.value.enableProxy && networkSettings.value.proxyUrl.trim()
          ? networkSettings.value.proxyUrl.trim()
          : undefined
      }

      const reqId = crypto.randomUUID()
      currentRequestId.value = reqId

      const res = await invoke<any>('send_rest_request', { requestId: reqId, payload })
      const statusText = res.statusText || res.status_text || getStandardStatusText(res.status)
      const durationMs = Number(res.durationMs ?? res.duration_ms ?? 0)
      const sizeBytes = Number(res.sizeBytes ?? res.size_bytes ?? 0)
      const respHeaders = Array.isArray(res.headers) ? Object.fromEntries(res.headers) : (res.headers || {})
      const isTruncated = Boolean(res.isTruncated ?? res.is_truncated)
      const contentType = res.contentType || res.content_type || ''

      // 前端控制台输出友好结构化请求日志
      try {
        console.groupCollapsed(
          `%c[JustAPI]%c ${method.value} ${finalUrl} %c(${res.status} ${statusText}, ${durationMs}ms)`,
          'color:#6366f1;font-weight:bold',
          'color:inherit;font-weight:bold',
          res.status >= 200 && res.status < 300 ? 'color:#34d399' : 'color:#f87171'
        )
        console.log('Request Headers:', Object.fromEntries(validHeaders))
        if (['form-data', 'x-www-form-urlencoded'].includes(bodyType.value) && validFormFields) {
          console.log('Form Fields:', validFormFields)
        } else if (finalBody) {
          console.log('Request Body:', finalBody)
        }
        console.log(`Response (${durationMs}ms, ${sizeBytes} bytes):`, {
          status: res.status,
          statusText,
          headers: respHeaders,
          cookies: res.cookies || []
        })
        console.groupEnd()
      } catch {
        // ignore console formatting errors
      }

      response.value = {
        status: res.status,
        statusText,
        durationMs,
        sizeBytes,
        headers: respHeaders,
        cookies: res.cookies || [],
        body: res.body || '',
        isTruncated,
        contentType,
        timestamp: Date.now()
      }

      // 同步缓存到当前激活 Tab
      const currentTab = tabStore.tabs.find(t => t.id === tabStore.activeTabId)
      if (currentTab) {
        currentTab.cachedResponse = response.value
      }

      // 如果启用了 Cookie Jar，将服务端 Set-Cookie 返回的 Cookie 自动同步存入 sessionCookies
      if (networkSettings.value.enableCookieJar && res.cookies && res.cookies.length > 0) {
        let defaultDomain = ''
        try {
          defaultDomain = new URL(finalUrl).hostname
        } catch {
          // ignore
        }

        for (const newCookie of res.cookies as CookieItem[]) {
          const cookieDomain = newCookie.domain || defaultDomain
          const existingIdx = sessionCookies.value.findIndex(
            c => c.name === newCookie.name && (c.domain || defaultDomain) === cookieDomain
          )
          const cookieToStore = {
            ...newCookie,
            domain: cookieDomain
          }
          if (existingIdx !== -1) {
            sessionCookies.value[existingIdx] = cookieToStore
          } else {
            sessionCookies.value.push(cookieToStore)
          }
        }
      }

      // 自动追加到历史记录 (包含完整请求头与请求体，支持后续完整追溯恢复)
      try {
        projStore.recordHistory({
          id: crypto.randomUUID(),
          name: path.value,
          method: method.value,
          url: finalUrl,
          status: res.status,
          durationMs,
          timestamp: Date.now(),
          headers: validHeaders,
          bodyType: bodyType.value,
          bodyContent: finalBody || undefined
        })
      } catch (e) {
        // ignore history error
      }
    } catch (err: any) {
      errorMessage.value = err?.message || String(err)
      console.error(`%c[JustAPI ERROR]%c ${method.value} ${finalUrl || resolvedUrl.value}:`, 'color:#ef4444;font-weight:bold', 'color:inherit', err)
    } finally {
      loading.value = false
      currentRequestId.value = null
    }
  }

  // 取消正在进行中的 RESTful 请求
  async function cancelRequest() {
    if (!loading.value || !currentRequestId.value) return
    const idToCancel = currentRequestId.value
    try {
      await invoke('cancel_rest_request', { requestId: idToCancel })
    } catch (e) {
      // ignore
    } finally {
      loading.value = false
      errorMessage.value = '请求已由用户手动取消'
      currentRequestId.value = null
    }
  }

  // 手动格式化 JSON (基于 Rust 原生 serde_json 异步执行)
  async function formatJson() {
    if (!bodyContent.value.trim()) return
    try {
      const res = await invoke<string>('format_json_fast', { raw: bodyContent.value })
      bodyContent.value = res
    } catch (err: any) {
      alert(`JSON 格式化失败: ${err?.message || err}`)
    }
  }

  // 手动压缩单行 JSON (基于 Rust 原生 serde_json 异步执行)
  async function minifyJson() {
    if (!bodyContent.value.trim()) return
    try {
      const res = await invoke<string>('minify_json_fast', { raw: bodyContent.value })
      bodyContent.value = res
    } catch (err: any) {
      alert(`JSON 压缩失败: ${err?.message || err}`)
    }
  }

  function clearCookies() {
    sessionCookies.value = []
  }

  function removeCookie(index: number) {
    sessionCookies.value.splice(index, 1)
  }

  function addCookie(cookie: CookieItem) {
    sessionCookies.value.push(cookie)
  }

  function clearResponse() {
    response.value = null
    errorMessage.value = null
    const tabStore = useTabStore()
    const currentTab = tabStore.tabs.find(t => t.id === tabStore.activeTabId)
    if (currentTab) {
      currentTab.cachedResponse = null
    }
  }

  return {
    networkSettings,
    sessionCookies,
    clearCookies,
    removeCookie,
    addCookie,
    method,
    baseUrl,
    path,
    group,
    pathParams,
    queryParams,
    headers,
    bodyType,
    bodyContent,
    formFields,
    loading,
    currentRequestId,
    cancelRequest,
    response,
    errorMessage,
    resolvedUrl,
    interpolatedUrl,
    interpolatedBaseUrl,
    urlVariableTokens,
    send,
    clearResponse,
    formatJson,
    minifyJson
  }
})

function getStandardStatusText(status: number): string {
  const map: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    202: 'Accepted',
    204: 'No Content',
    301: 'Moved Permanently',
    302: 'Found',
    304: 'Not Modified',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    408: 'Request Timeout',
    409: 'Conflict',
    413: 'Payload Too Large',
    415: 'Unsupported Media Type',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout'
  }
  return map[status] || ''
}

