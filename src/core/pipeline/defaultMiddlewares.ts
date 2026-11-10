import {
  resolveEffectiveBaseUrl,
  resolveHeaderLayers,
  resolveInheritedHeaders,
  resolveRequestUrl
} from '@/core/inheritance/resolver'
import { resolveEffectiveVariableMap } from '@/core/interpolation/engine'
import {
  RequestPipeline,
  type RequestMiddleware,
  type TransportRequestPayload
} from './requestPipeline'

export const resolveVariablesAndUrlMiddleware: RequestMiddleware = {
  id: 'core.resolve-url',
  order: 100,
  description: '计算层级变量映射与拼接 URL 并执行动态插值',
  async execute(ctx, next) {
    ctx.varMap = resolveEffectiveVariableMap(
      ctx.projectConfig,
      ctx.subProjectConfig,
      ctx.fallbackEnvironment
    )

    const effectiveBase =
      ctx.baseUrl || resolveEffectiveBaseUrl(ctx.projectConfig, ctx.subProjectConfig)

    ctx.resolvedUrl = resolveRequestUrl(
      effectiveBase,
      ctx.request.path,
      ctx.request.pathParams || [],
      ctx.request.queryParams || []
    )

    ctx.finalUrl = ctx.variableEngine.interpolate(ctx.resolvedUrl, ctx.varMap)
    if (!/^https?:\/\//i.test(ctx.finalUrl)) {
      throw new Error(
        `无效的请求 URL: "${ctx.finalUrl}"。请求地址必须以 http:// 或 https:// 开头，请在顶部设置 BaseURL 或在环境变量/路径中使用完整地址。`
      )
    }

    await next()
  }
}

export const mergeHeadersMiddleware: RequestMiddleware = {
  id: 'core.merge-headers',
  order: 200,
  description: '合并主项目、子项目与接口专属 Headers 并插值',
  async execute(ctx, next) {
    const inherited = resolveInheritedHeaders(ctx.projectConfig, ctx.subProjectConfig)
    const resolution = resolveHeaderLayers(inherited, ctx.request.headers || [])

    ctx.finalHeaders = resolution.sendableHeaders.map(h => [
      ctx.variableEngine.interpolate(h.key, ctx.varMap),
      ctx.variableEngine.interpolate(h.value, ctx.varMap)
    ])

    await next()
  }
}

export const interpolateBodyMiddleware: RequestMiddleware = {
  id: 'core.interpolate-body',
  order: 300,
  description: '对 Body 与 Form 字段进行动态变量插值',
  async execute(ctx, next) {
    const bodyType = ctx.request.bodyType

    if (['json', 'raw'].includes(bodyType) && ctx.request.bodyContent) {
      ctx.finalBody = ctx.variableEngine.interpolate(ctx.request.bodyContent, ctx.varMap)
    } else {
      ctx.finalBody = null
    }

    if (['form-data', 'x-www-form-urlencoded'].includes(bodyType)) {
      ctx.finalFormFields = (ctx.request.formFields || [])
        .filter(f => f.enabled && f.key.trim())
        .map(f => ({
          ...f,
          key: ctx.variableEngine.interpolate(f.key.trim(), ctx.varMap),
          value: ctx.variableEngine.interpolate(f.value, ctx.varMap)
        }))
    } else {
      ctx.finalFormFields = null
    }

    await next()
  }
}

export const cookieInjectionMiddleware: RequestMiddleware = {
  id: 'core.cookie-jar',
  order: 400,
  description: '根据 Cookie Jar 配置自动注入匹配域名 Cookie',
  async execute(ctx, next) {
    if (ctx.networkSettings.enableCookieJar && ctx.cookies.length > 0) {
      const hasManualCookie = ctx.finalHeaders.some(
        ([k]) => k.toLowerCase() === 'cookie'
      )
      if (!hasManualCookie) {
        try {
          const host = new URL(ctx.finalUrl).hostname.toLowerCase()
          const matching = ctx.cookies.filter(c => {
            if (!c.domain) return true
            const cleanDomain = c.domain.replace(/^\./, '').toLowerCase()
            return host === cleanDomain || host.endsWith('.' + cleanDomain)
          })
          if (matching.length > 0) {
            ctx.finalHeaders.push([
              'Cookie',
              matching.map(c => `${c.name}=${c.value}`).join('; ')
            ])
          }
        } catch {
          // ignore URL parse error
        }
      }
    }

    await next()
  }
}

export const consoleLoggerMiddleware: RequestMiddleware = {
  id: 'core.console-logger',
  order: 900,
  description: '输出结构化请求/响应调试日志',
  async execute(ctx, next) {
    await next()

    const res = ctx.response
    if (!res) return
    try {
      console.groupCollapsed(
        `%c[JustAPI]%c ${ctx.request.method} ${ctx.finalUrl} %c(${res.status} ${res.statusText}, ${res.durationMs}ms)`,
        'color:#6366f1;font-weight:bold',
        'color:inherit;font-weight:bold',
        res.status >= 200 && res.status < 300 ? 'color:#34d399' : 'color:#f87171'
      )
      console.log('Request Headers:', Object.fromEntries(ctx.finalHeaders))
      if (ctx.finalFormFields) {
        console.log('Form Fields:', ctx.finalFormFields)
      } else if (ctx.finalBody) {
        console.log('Request Body:', ctx.finalBody)
      }
      console.log(`Response (${res.durationMs}ms, ${res.sizeBytes} bytes):`, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
        cookies: res.cookies || []
      })
      console.groupEnd()
    } catch {
      // ignore console errors
    }
  }
}

export const transportMiddleware: RequestMiddleware = {
  id: 'core.transport',
  order: 1000,
  description: '调用传输适配器执行 HTTP 请求',
  async execute(ctx, next) {
    const payload: TransportRequestPayload = {
      url: ctx.finalUrl,
      method: ctx.request.method,
      headers: ctx.finalHeaders,
      bodyType: ctx.request.bodyType,
      bodyContent: ctx.finalBody,
      formFields: ctx.finalFormFields
        ? ctx.finalFormFields.map(f => ({
            key: f.key,
            value: f.value,
            is_file: f.is_file,
            enabled: f.enabled
          }))
        : null,
      timeoutMs: 30000,
      dangerouslyDisableSsl: ctx.networkSettings.dangerouslyDisableSsl,
      proxyUrl:
        ctx.networkSettings.enableProxy && ctx.networkSettings.proxyUrl.trim()
          ? ctx.networkSettings.proxyUrl.trim()
          : undefined
    }

    ctx.response = await ctx.transport(ctx.requestId, payload)
    await next()
  }
}

export function createDefaultMiddlewares() {
  return [
    resolveVariablesAndUrlMiddleware,
    mergeHeadersMiddleware,
    interpolateBodyMiddleware,
    cookieInjectionMiddleware,
    consoleLoggerMiddleware,
    transportMiddleware
  ]
}

export const defaultRequestPipeline = new RequestPipeline()
for (const mw of createDefaultMiddlewares()) {
  defaultRequestPipeline.use(mw)
}
