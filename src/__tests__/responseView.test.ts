import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildImageDataUrl,
  extractCleanMimeType,
  getContentTypeTag,
  isImageResponse,
  useResponseViewState
} from '@/features/response-viewer/composables/useResponseViewState'
import { sendRestRequest } from '@/services/transportService'
import { useSessionStore } from '@/stores/sessionStore'
import type { ApiResponse } from '@/types'

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn()
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke
}))

function makeResponse(overrides: Partial<ApiResponse>): ApiResponse {
  return {
    status: 200,
    statusText: 'OK',
    durationMs: 12,
    sizeBytes: 128,
    headers: {},
    body: '',
    timestamp: Date.now(),
    ...overrides
  }
}

describe('responseView image preview & transport mapping', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    setActivePinia(createPinia())
  })

  it('builds valid data URLs from bodyBase64, strips charset params, and handles UTF-8 SVG safely', () => {
    expect(extractCleanMimeType('image/png; charset=binary')).toBe('image/png')
    expect(extractCleanMimeType('application/octet-stream', 'image/webp')).toBe('image/webp')

    const pngRes = makeResponse({
      contentType: 'image/png; charset=binary',
      body: '',
      bodyBase64: 'iVBORw0KGgoAAAANSUhEUg=='
    })
    expect(isImageResponse(pngRes)).toBe(true)
    expect(getContentTypeTag(pngRes)).toBe('IMG')
    expect(buildImageDataUrl(pngRes)).toBe('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==')

    // 当响应头为 application/octet-stream 时也能从 base64 前缀推断精确 MIME
    const octetJpegRes = makeResponse({
      contentType: 'application/octet-stream',
      body: '',
      bodyBase64: '/9j/4AAQSkZJRgABAQEASABIAAD/'
    })
    expect(isImageResponse(octetJpegRes)).toBe(true)
    expect(buildImageDataUrl(octetJpegRes)).toBe(
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/'
    )

    // 纯文本 UTF-8 SVG（含中文标签）无 bodyBase64 时使用 URI 编码不抛 btoa 异常
    const svgTextRes = makeResponse({
      contentType: 'image/svg+xml; charset=utf-8',
      body: '<svg xmlns="http://www.w3.org/2000/svg"><text>测试图标</text></svg>'
    })
    const svgUrl = buildImageDataUrl(svgTextRes)
    expect(svgUrl.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
    expect(decodeURIComponent(svgUrl.split(',')[1])).toContain('测试图标')
  })

  it('maps bodyBase64 without legacy isTruncated in transportService', async () => {
    mockInvoke.mockResolvedValueOnce({
      requestId: 'req-img-1',
      status: 200,
      statusText: 'OK',
      durationMs: 45,
      sizeBytes: 64,
      headers: [['content-type', 'image/png']],
      cookies: [],
      body: '',
      bodyBase64: 'iVBORw0KGgo=',
      contentType: 'image/png'
    })

    const res = await sendRestRequest('req-img-1', {
      url: 'https://example.com/logo.png',
      method: 'GET',
      headers: [],
      bodyType: 'none',
      bodyContent: '',
      formFields: [],
      timeoutMs: 30000,
      dangerouslyDisableSsl: false
    })

    expect(res.body).toBe('')
    expect(res.bodyBase64).toBe('iVBORw0KGgo=')
    expect('isTruncated' in res).toBe(false)
  })

  it('auto-switches bodyViewMode to preview for images and restores pretty for JSON', async () => {
    const sessionStore = useSessionStore()
    const { bodyViewMode, displayBody } = useResponseViewState()

    sessionStore.activeRuntime.response = makeResponse({
      contentType: 'image/png',
      body: '',
      bodyBase64: 'iVBORw0KGgo='
    })
    await nextTick()
    expect(bodyViewMode.value).toBe('preview')
    expect(displayBody.value).toBe('iVBORw0KGgo=')

    sessionStore.activeRuntime.response = makeResponse({
      contentType: 'application/json',
      body: '{"ok":true}'
    })
    await nextTick()
    expect(bodyViewMode.value).toBe('pretty')
  })
})
