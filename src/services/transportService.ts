import { invoke } from '@tauri-apps/api/core'
import type { ApiResponse } from '@/types'
import type { TransportRequestPayload } from '@/core/pipeline/requestPipeline'

export function getStandardStatusText(status: number): string {
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

export async function sendRestRequest(
  requestId: string,
  payload: TransportRequestPayload
): Promise<ApiResponse> {
  const res = await invoke<any>('send_rest_request', { requestId, payload })
  const statusText = res.statusText || res.status_text || getStandardStatusText(res.status)
  const durationMs = Number(res.durationMs ?? res.duration_ms ?? 0)
  const sizeBytes = Number(res.sizeBytes ?? res.size_bytes ?? 0)
  const respHeaders = Array.isArray(res.headers)
    ? Object.fromEntries(res.headers)
    : res.headers || {}
  const bodyBase64 = res.bodyBase64 || res.body_base64 || undefined
  const contentType = res.contentType || res.content_type || ''

  return {
    requestId: res.requestId || res.request_id || requestId,
    status: res.status,
    statusText,
    durationMs,
    sizeBytes,
    headers: respHeaders,
    cookies: res.cookies || [],
    body: res.body || '',
    bodyBase64,
    contentType,
    timestamp: Date.now()
  }
}

export async function cancelRestRequest(requestId: string): Promise<boolean> {
  return invoke<boolean>('cancel_rest_request', { requestId })
}

export async function pickFile(): Promise<string | null> {
  return invoke<string | null>('pick_file')
}

export async function saveResponseToFile(options: {
  defaultFilename: string
  content: string
  useRawBytes: boolean
  requestId?: string
}): Promise<string | null> {
  try {
    return await invoke<string | null>('save_response_to_file', {
      defaultFilename: options.defaultFilename,
      content: options.content,
      useRawBytes: options.useRawBytes,
      requestId: options.requestId
    })
  } catch (err) {
    // 非 Tauri 浏览器预览上下文下回退到 Blob 下载
    if (typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window)) {
      const blob = new Blob([options.content], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = options.defaultFilename
      a.click()
      URL.revokeObjectURL(url)
      return options.defaultFilename
    }
    throw err
  }
}

