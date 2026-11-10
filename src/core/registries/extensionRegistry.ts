import { ref, type Component } from 'vue'
import type { ApiRequest, ApiResponse, ImportedCollection } from '@/types'
import type { RequestExecutionContext } from '@/core/pipeline/requestPipeline'

export interface ContributionItem {
  id: string
  order?: number
}

/**
 * 通用轻量级响应式扩展注册表
 */
export class ContributionRegistry<T extends ContributionItem> {
  private items = new Map<string, T>()
  private version = ref(0)

  register(item: T): () => void {
    this.items.set(item.id, item)
    this.version.value++
    return () => this.unregister(item.id)
  }

  unregister(id: string): void {
    if (this.items.delete(id)) {
      this.version.value++
    }
  }

  get(id: string): T | undefined {
    void this.version.value
    return this.items.get(id)
  }

  list(): T[] {
    void this.version.value
    return Array.from(this.items.values()).sort(
      (a, b) => (a.order ?? 100) - (b.order ?? 100)
    )
  }
}

export interface RequestTabContribution extends ContributionItem {
  label: string
  component: Component
  badgeCount?: (ctx: {
    request: ApiRequest
    activeHeadersCount: number
  }) => number
}

export interface BodyEditorContribution extends ContributionItem {
  label: string
  component: Component
}

export interface ResponseTabContribution extends ContributionItem {
  label: string
  component: Component
  badgeText?: (
    res: ApiResponse | null,
    ctx?: RequestExecutionContext | null
  ) => string | undefined
  badgeCount?: (
    res: ApiResponse | null,
    ctx?: RequestExecutionContext | null
  ) => number
  badgeClass?: (
    res: ApiResponse | null,
    ctx?: RequestExecutionContext | null
  ) => string | undefined
}

export interface RequestImporterContribution extends ContributionItem {
  label: string
  description?: string
  placeholder?: string
  supports: (rawInput: string) => boolean
  parse: (rawInput: string) => ApiRequest
}

export interface RequestExporterContribution extends ContributionItem {
  label: string
  description?: string
  exportRequest: (ctx: {
    request: ApiRequest
    resolvedUrl: string
    headers: [string, string][]
    body: string | null
  }) => string
}

export interface CollectionParseHelpers {
  parseStructuredDocument: (rawText: string) => Promise<unknown>
}

export interface CollectionImporterContribution extends ContributionItem {
  label: string
  shortLabel?: string
  description?: string
  sourcePlaceholder?: string
  supportsRefresh?: boolean
  supports?: (rawText: string, source?: string) => boolean | Promise<boolean>
  parse: (
    rawText: string,
    helpers: CollectionParseHelpers
  ) => ImportedCollection | Promise<ImportedCollection>
}

export const requestTabRegistry = new ContributionRegistry<RequestTabContribution>()
export const bodyEditorRegistry = new ContributionRegistry<BodyEditorContribution>()
export const responseTabRegistry = new ContributionRegistry<ResponseTabContribution>()
export const requestImporterRegistry = new ContributionRegistry<RequestImporterContribution>()
export const requestExporterRegistry = new ContributionRegistry<RequestExporterContribution>()
export const collectionImporterRegistry =
  new ContributionRegistry<CollectionImporterContribution>()
