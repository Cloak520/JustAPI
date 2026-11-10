import { computed, effectScope, ref, watch } from 'vue'
import * as formatterService from '@/services/formatterService'
import { useSessionStore } from '@/stores/sessionStore'
import type { ApiResponse } from '@/types'

export function getResponseContentType(res: ApiResponse | null): string {
  if (!res) return ''
  return (
    res.contentType ||
    res.headers?.['content-type'] ||
    res.headers?.['Content-Type'] ||
    ''
  ).toLowerCase()
}

export function isJsonResponse(res: ApiResponse | null): boolean {
  if (!res) return false
  const ct = getResponseContentType(res)
  const body = (res.body || '').trim()
  return ct.includes('application/json') || body.startsWith('{') || body.startsWith('[')
}

export function isHtmlResponse(res: ApiResponse | null): boolean {
  const ct = getResponseContentType(res)
  return ct.includes('text/html') || ct.includes('application/xhtml+xml')
}

export function extractCleanMimeType(contentType: string, fallback = 'image/png'): string {
  const mime = (contentType || '').split(';')[0]?.trim().toLowerCase()
  if (mime && mime.startsWith('image/')) {
    return mime
  }
  return fallback
}

function sniffImageMimeFromBase64(b64: string): string | null {
  const trimmed = b64.trimStart()
  if (trimmed.startsWith('iVBORw0KGgo')) return 'image/png'
  if (trimmed.startsWith('/9j/')) return 'image/jpeg'
  if (trimmed.startsWith('R0lGOD')) return 'image/gif'
  if (trimmed.startsWith('UklGR')) return 'image/webp'
  if (trimmed.startsWith('Qk')) return 'image/bmp'
  if (trimmed.startsWith('AAABAAE')) return 'image/x-icon'
  if (trimmed.startsWith('PHN2Zw') || trimmed.startsWith('PD94bWw')) return 'image/svg+xml'
  return null
}

export function isImageResponse(res: ApiResponse | null): boolean {
  if (!res) return false
  return getResponseContentType(res).includes('image/') || Boolean(res.bodyBase64)
}

export function buildImageDataUrl(res: ApiResponse | null): string {
  if (!res) return ''
  const ct = getResponseContentType(res)

  if (res.bodyBase64) {
    const cleanB64 = res.bodyBase64.trim()
    if (!cleanB64) return ''
    if (/^data:image\//i.test(cleanB64)) return cleanB64
    const fallbackMime = sniffImageMimeFromBase64(cleanB64) || 'image/png'
    const mime = extractCleanMimeType(ct, fallbackMime)
    return `data:${mime};base64,${cleanB64}`
  }

  const b = (res.body || '').trim()
  if (!b) return ''
  if (/^data:image\//i.test(b)) return b

  if (ct.includes('image/svg+xml') || b.startsWith('<svg') || (b.startsWith('<?xml') && b.includes('<svg'))) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(b)}`
  }

  const normalizedB64 = b.replace(/\s+/g, '')
  const fallbackMime = sniffImageMimeFromBase64(normalizedB64) || 'image/png'
  const mime = extractCleanMimeType(ct, fallbackMime)
  return `data:${mime};base64,${normalizedB64}`
}

export function getContentTypeTag(res: ApiResponse | null): string {
  if (!res) return ''
  const ct = getResponseContentType(res)
  if (isJsonResponse(res)) return 'JSON'
  if (isHtmlResponse(res)) return 'HTML'
  if (ct.includes('xml')) return 'XML'
  if (isImageResponse(res)) return 'IMG'
  if (ct.includes('text/plain')) return 'TXT'
  return ct.split(';')[0].split('/')[1]?.toUpperCase() || ''
}

export function getContentTypeBadgeClass(res: ApiResponse | null): string {
  if (isJsonResponse(res)) return 'bg-emerald-500/10 text-emerald-400'
  if (isHtmlResponse(res)) return 'bg-blue-500/10 text-blue-400'
  if (isImageResponse(res)) return 'bg-purple-500/10 text-purple-400'
  return 'bg-muted text-muted-foreground'
}

let boundScope: ReturnType<typeof effectScope> | null = null
let boundStore: ReturnType<typeof useSessionStore> | null = null
const bodyViewMode = ref<'pretty' | 'raw' | 'preview'>('pretty')
const isMinified = ref(false)
const lineWrapping = ref(false)
const showSearchBar = ref(false)
const bodySearchQuery = ref('')
const formattedBodyCache = ref('')
let formatJobSeq = 0

export function useResponseViewState() {
  const sessionStore = useSessionStore()

  if (boundStore !== sessionStore) {
    boundScope?.stop()
    boundStore = sessionStore
    boundScope = effectScope(true)
    boundScope.run(() => {
      watch(
        () => sessionStore.response,
        newRes => {
          if (!newRes) return
          if (isImageResponse(newRes)) {
            bodyViewMode.value = 'preview'
          } else if (bodyViewMode.value === 'preview' && !isHtmlResponse(newRes)) {
            bodyViewMode.value = 'pretty'
          }
        },
        { immediate: true }
      )

      watch(
        [
          () => sessionStore.response?.body,
          () => sessionStore.response?.contentType,
          bodyViewMode,
          isMinified
        ],
        async ([rawBody]) => {
          const jobId = ++formatJobSeq
          const raw = rawBody || ''
          if (!raw) {
            formattedBodyCache.value = ''
            return
          }
          if (bodyViewMode.value === 'raw' || !isJsonResponse(sessionStore.response)) {
            formattedBodyCache.value = raw
            return
          }

          // 先立即展示原文避免白屏，再由 Rust serde_json 后台异步格式化
          formattedBodyCache.value = raw
          try {
            const formatted = isMinified.value
              ? await formatterService.minifyJsonFast(raw)
              : await formatterService.formatJsonFast(raw)
            if (jobId === formatJobSeq) {
              formattedBodyCache.value = formatted
            }
          } catch {
            if (jobId === formatJobSeq) {
              formattedBodyCache.value = raw
            }
          }
        },
        { immediate: true }
      )
    })
  }

  const contentType = computed(() => getResponseContentType(sessionStore.response))
  const isJson = computed(() => isJsonResponse(sessionStore.response))
  const isHtml = computed(() => isHtmlResponse(sessionStore.response))
  const isImage = computed(() => isImageResponse(sessionStore.response))
  const contentTypeTag = computed(() => getContentTypeTag(sessionStore.response))

  const displayBody = computed(() => {
    const raw = sessionStore.response?.body || ''
    if (!raw) return sessionStore.response?.bodyBase64 || ''
    if (bodyViewMode.value === 'raw') return raw
    if (isJson.value) return formattedBodyCache.value || raw
    return raw
  })

  const editorLanguage = computed<'json' | 'raw'>(() =>
    isJson.value && bodyViewMode.value === 'pretty' ? 'json' : 'raw'
  )

  return {
    bodyViewMode,
    isMinified,
    lineWrapping,
    showSearchBar,
    bodySearchQuery,
    contentType,
    isJson,
    isHtml,
    isImage,
    contentTypeTag,
    displayBody,
    editorLanguage
  }
}

