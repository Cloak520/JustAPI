import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useStorage } from '@vueuse/core'
import type { HttpMethod, BodyType, KeyValuePair, ApiResponse, CookieItem, NetworkSettings } from '@/types'
import { extractPathVariables } from '@/utils/parser'
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

  // 内存/会话 Cookie Jar 列表
  const sessionCookies = useStorage<CookieItem[]>('justapi_session_cookies', [])
  // 当前请求基础状态
  const method = ref<HttpMethod>('GET')
  const baseUrl = ref('https://httpbin.org')
  const path = ref('/get')
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

    // 替换 Path Variables (保护 {{...}})
    for (const p of pathParams.value) {
      if (p.key) {
        const safeVal = encodeParamPreservingVariables(p.value)
        cleanPath = cleanPath.replaceAll(`{${p.key}}`, safeVal)
        cleanPath = cleanPath.replaceAll(`:${p.key}`, safeVal)
      }
    }

    // 拼接 BaseURL 与相对路径
    let fullUrl = ''
    if (/^https?:\/\//i.test(cleanPath) || cleanPath.startsWith('{{')) {
      fullUrl = cleanPath
    } else {
      if (cleanPath && !cleanPath.startsWith('/')) {
        cleanPath = '/' + cleanPath
      }
      fullUrl = `${cleanBase}${cleanPath}`
    }

    // 拼接 Query Params (保护 {{...}})
    const activeParams = queryParams.value.filter(p => p.enabled && p.key.trim())
    if (activeParams.length > 0) {
      const parts = activeParams.map(p => {
        const k = encodeParamPreservingVariables(p.key.trim())
        const v = encodeParamPreservingVariables(p.value)
        return `${k}=${v}`
      })
      const separator = fullUrl.includes('?') ? '&' : '?'
      fullUrl = `${fullUrl}${separator}${parts.join('&')}`
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

    try {
      const projStore = useProjectStore()
      const tabStore = useTabStore()
      const activeTab = tabStore.tabs.find(t => t.id === tabStore.activeTabId)
      const varMap = projStore.getEffectiveVariableMap(activeTab?.subProjectDir)

      // 1. 动态插值解析请求最终 URL (含 BaseURL, 路径参数, Query 参数)
      const finalUrl = interpolate(resolvedUrl.value, varMap)

      if (!/^https?:\/\//i.test(finalUrl)) {
        throw new Error(`无效的请求 URL: "${finalUrl}"。请求地址必须以 http:// 或 https:// 开头，请在顶部设置 BaseURL 或在环境变量/路径中使用完整地址。`)
      }

      // 2. 组装并插值 Header 数组 (合并项目与子项目级联继承的 Headers + 请求自身独立 Headers)
      const effectiveInheritedHeaders = projStore.resolveEffectiveHeaders(activeTab?.subProjectDir)
      const allHeaders = [...effectiveInheritedHeaders, ...headers.value]
      const validHeaders: [string, string][] = allHeaders
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

      const res = await invoke<any>('send_rest_request', { payload })
      response.value = {
        status: res.status,
        statusText: res.status_text,
        durationMs: res.duration_ms,
        sizeBytes: res.size_bytes,
        headers: Object.fromEntries(res.headers),
        cookies: res.cookies || [],
        body: res.body,
        isTruncated: res.is_truncated,
        timestamp: Date.now()
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

      // 自动追加到历史记录
      try {
        projStore.recordHistory({
          id: crypto.randomUUID(),
          name: path.value,
          method: method.value,
          url: finalUrl,
          status: res.status,
          durationMs: res.duration_ms,
          timestamp: Date.now()
        })
      } catch (e) {
        // ignore history error
      }
    } catch (err: any) {
      errorMessage.value = err?.message || String(err)
    } finally {
      loading.value = false
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
    response,
    errorMessage,
    resolvedUrl,
    interpolatedUrl,
    interpolatedBaseUrl,
    urlVariableTokens,
    send,
    formatJson,
    minifyJson
  }
})

