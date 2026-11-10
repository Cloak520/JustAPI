import type {
  ApiRequest,
  ApiResponse,
  CookieItem,
  Environment,
  FormField,
  NetworkSettings,
  ProjectConfig,
  SubProjectConfig
} from '@/types'
import type { VariableEngine, VariableSourceInfo } from '@/core/interpolation/engine'

export interface TransportRequestPayload {
  url: string
  method: string
  headers: [string, string][]
  bodyType: string
  bodyContent: string | null
  formFields: Array<{ key: string; value: string; is_file: boolean; enabled: boolean }> | null
  timeoutMs: number
  dangerouslyDisableSsl: boolean
  proxyUrl?: string
}

export type TransportAdapter = (
  requestId: string,
  payload: TransportRequestPayload
) => Promise<ApiResponse>

export interface RequestExecutionContext {
  requestId: string
  request: ApiRequest
  baseUrl: string
  subProjectDir?: string
  projectConfig: ProjectConfig | null
  subProjectConfig?: SubProjectConfig | null
  fallbackEnvironment?: Environment | null
  networkSettings: NetworkSettings
  cookies: CookieItem[]
  variableEngine: VariableEngine
  transport: TransportAdapter

  // Pipeline 计算产物
  varMap: Map<string, VariableSourceInfo>
  resolvedUrl: string
  finalUrl: string
  finalHeaders: [string, string][]
  finalBody: string | null
  finalFormFields: FormField[] | null
  response?: ApiResponse

  // 扩展元数据容器（例如前置脚本变量、断言结果、性能采样）
  metadata: Record<string, unknown>
}

export interface RequestMiddleware {
  id: string
  order: number
  description?: string
  execute: (ctx: RequestExecutionContext, next: () => Promise<void>) => Promise<void>
}

/**
 * 洋葱模型请求执行管线：
 * Pre-Request 钩子（order 小）-> Transport（order 1000）-> Post-Response 钩子（unwind 逆序）
 */
export class RequestPipeline {
  private middlewares: RequestMiddleware[] = []

  use(middleware: RequestMiddleware): () => void {
    this.remove(middleware.id)
    this.middlewares.push(middleware)
    this.middlewares.sort((a, b) => a.order - b.order)
    return () => this.remove(middleware.id)
  }

  remove(id: string): void {
    this.middlewares = this.middlewares.filter(m => m.id !== id)
  }

  list(): readonly RequestMiddleware[] {
    return this.middlewares
  }

  async execute(ctx: RequestExecutionContext): Promise<RequestExecutionContext> {
    const chain = [...this.middlewares]
    let index = -1

    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) {
        throw new Error('RequestPipeline next() called multiple times')
      }
      index = i
      const mw = chain[i]
      if (!mw) return
      await mw.execute(ctx, () => dispatch(i + 1))
    }

    await dispatch(0)
    return ctx
  }
}

