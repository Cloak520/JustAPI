import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { HttpMethod, BodyType, KeyValuePair, ApiResponse } from '@/types'
import { extractPathVariables } from '@/utils/parser'
import { useProjectStore } from './projectStore'

export const useRequestStore = defineStore('request', () => {
  // 当前请求基础状态
  const method = ref<HttpMethod>('GET')
  const baseUrl = ref('https://httpbin.org')
  const path = ref('/get')
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

  // 实时计算最终拼接后的完整 URL (含 BaseURL、替换后的 Path 参数和 Query 参数)
  const resolvedUrl = computed(() => {
    let cleanBase = baseUrl.value.trim().replace(/\/+$/, '')
    let cleanPath = path.value.trim()

    // 替换 Path Variables
    for (const p of pathParams.value) {
      if (p.key) {
        cleanPath = cleanPath.replaceAll(`{${p.key}}`, encodeURIComponent(p.value))
        cleanPath = cleanPath.replaceAll(`:${p.key}`, encodeURIComponent(p.value))
      }
    }

    // 拼接 BaseURL 与相对路径
    let fullUrl = ''
    if (/^https?:\/\//i.test(cleanPath)) {
      fullUrl = cleanPath
    } else {
      if (cleanPath && !cleanPath.startsWith('/')) {
        cleanPath = '/' + cleanPath
      }
      fullUrl = `${cleanBase}${cleanPath}`
    }

    // 拼接 Query Params
    const activeParams = queryParams.value.filter(p => p.enabled && p.key.trim())
    if (activeParams.length > 0) {
      const searchParams = new URLSearchParams()
      for (const p of activeParams) {
        searchParams.append(p.key.trim(), p.value)
      }
      const separator = fullUrl.includes('?') ? '&' : '?'
      fullUrl = `${fullUrl}${separator}${searchParams.toString()}`
    }

    return fullUrl
  })

  // 发送 RESTful 请求
  async function send() {
    if (!resolvedUrl.value) return
    loading.value = true
    errorMessage.value = null
    response.value = null

    try {
      // 组装 Header 数组
      const validHeaders: [string, string][] = headers.value
        .filter(h => h.enabled && h.key.trim())
        .map(h => [h.key.trim(), h.value])

      // 组装 Form 字段
      const validFormFields = formFields.value
        .filter(f => f.enabled && f.key.trim())
        .map(f => ({
          key: f.key.trim(),
          value: f.value,
          is_file: f.is_file
        }))

      const payload = {
        url: resolvedUrl.value,
        method: method.value,
        headers: validHeaders,
        body_type: bodyType.value,
        body_content: ['json', 'raw'].includes(bodyType.value) ? bodyContent.value : null,
        form_fields: ['form-data', 'x-www-form-urlencoded'].includes(bodyType.value) ? validFormFields : null,
        timeout_ms: 30000
      }

      const res = await invoke<any>('send_rest_request', { payload })
      response.value = {
        status: res.status,
        statusText: res.status_text,
        durationMs: res.duration_ms,
        sizeBytes: res.size_bytes,
        headers: Object.fromEntries(res.headers),
        body: res.body,
        isTruncated: res.is_truncated,
        timestamp: Date.now()
      }

      // 自动追加到历史记录
      try {
        const projStore = useProjectStore()
        projStore.recordHistory({
          id: crypto.randomUUID(),
          name: path.value,
          method: method.value,
          url: resolvedUrl.value,
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

  return {
    method,
    baseUrl,
    path,
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
    send,
    formatJson,
    minifyJson
  }
})

