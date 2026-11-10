declare module '*/.justapi/plugins/curl/index.mjs' {
  import type { JustAPIPluginContext } from '@/core/plugins/types'
  import type { ApiRequest } from '@/types'

  export function tokenizeShellCommand(input: string): string[]
  export function isCurlCommand(rawInput: string): boolean
  export function parseCurlCommand(
    rawInput: string,
    createRequest?: (overrides?: Partial<ApiRequest>) => ApiRequest
  ): ApiRequest
  export function quotePosixArg(value: string): string
  export function serializeToCurl(ctx: {
    request: ApiRequest
    resolvedUrl: string
    headers: [string, string][]
    body: string | null
  }): string
  export function activate(ctx: JustAPIPluginContext): void | Promise<void>
}

declare module '*/.justapi/plugins/assertions/index.mjs' {
  import type { JustAPIPluginContext } from '@/core/plugins/types'
  import type { ApiRequest, ApiResponse } from '@/types'

  export const ASSERTIONS_EXTENSION_KEY: string
  export function getRequestAssertions(request: ApiRequest | null | undefined): any[]
  export function setRequestAssertions(request: ApiRequest, rules: any[]): void
  export function resolveJsonPath(
    root: unknown,
    rawPath?: string
  ): { found: boolean; value: unknown }
  export function buildAssertionLabel(rule: any): string
  export function evaluateAssertions(
    rules: any[],
    response: ApiResponse,
    interpolate?: (text: string) => string
  ): {
    total: number
    passed: number
    failed: number
    results: Array<{
      ruleId: string
      label: string
      passed: boolean
      actual: string
      expected: string
      message: string
    }>
  }
  export function activate(ctx: JustAPIPluginContext): void | Promise<void>
}

declare module '*/.justapi/plugins/swagger/index.mjs' {
  import type { CollectionParseHelpers } from '@/core/registries/extensionRegistry'
  import type { JustAPIPluginContext } from '@/core/plugins/types'
  import type { ImportedCollection } from '@/types'

  export function resolveJsonPointer(rootDoc: unknown, refStr: string): unknown
  export function resolveRefNode(
    node: unknown,
    rootDoc: unknown,
    visitedRefs?: Set<string>
  ): unknown
  export function generateExampleFromSchema(
    rawSchema: unknown,
    rootDoc: unknown,
    depth?: number,
    visitedRefs?: Set<string>
  ): unknown
  export function extractBaseUrl(doc: unknown): string | undefined
  export function extractDefaultParamValue(param: unknown, rootDoc?: unknown): string
  export function supportsOpenApiDocument(rawText: string, source?: string): boolean
  export function parseOpenApiDocument(doc: unknown): ImportedCollection
  export function parseOpenApiContent(
    rawText: string,
    helpers?: CollectionParseHelpers
  ): Promise<ImportedCollection>
  export function activate(ctx: JustAPIPluginContext): void | Promise<void>
}
