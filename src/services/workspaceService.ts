import { invoke } from '@tauri-apps/api/core'
import { normalizeRequest } from '@/core/models/requestFactory'
import type {
  ApiRequest,
  CollectionSyncSource,
  FullProjectData,
  HistoryItem,
  ImportedCollection,
  MergeStats,
  ProjectConfig,
  SubProjectConfig,
  SubProjectData
} from '@/types'

function normalizeSubProject(raw: any): SubProjectData {
  const dirName = raw.dirName ?? raw.dir_name ?? raw.config?.id ?? ''
  return {
    config: raw.config,
    dirName,
    requests: Array.isArray(raw.requests) ? raw.requests.map(normalizeRequest) : []
  }
}

function normalizeProjectData(raw: any): FullProjectData {
  const rawSubs = raw.subProjects ?? raw.sub_projects ?? []
  return {
    path: raw.path,
    config: raw.config,
    subProjects: Array.isArray(rawSubs) ? rawSubs.map(normalizeSubProject) : [],
    history: Array.isArray(raw.history) ? raw.history : []
  }
}

export async function pickProjectFolder(): Promise<string | null> {
  return invoke<string | null>('pick_project_folder')
}

export async function loadProjectFromDir(path: string): Promise<FullProjectData> {
  const raw = await invoke<any>('load_project_from_dir', { path })
  return normalizeProjectData(raw)
}

export async function saveProjectConfig(path: string, config: ProjectConfig): Promise<void> {
  await invoke('save_project_config', { path, config })
}

export async function createSubProject(
  projectPath: string,
  dirName: string,
  config: SubProjectConfig
): Promise<void> {
  await invoke('create_subproject', { projectPath, dirName, config })
}

export async function saveSubProjectConfig(
  projectPath: string,
  dirName: string,
  config: SubProjectConfig
): Promise<void> {
  await invoke('save_subproject_config', { projectPath, dirName, config })
}

export async function deleteSubProject(projectPath: string, dirName: string): Promise<void> {
  await invoke('delete_subproject', { projectPath, dirName })
}

export async function saveRequestFile(
  projectPath: string,
  dirName: string,
  fileName: string,
  request: ApiRequest
): Promise<void> {
  await invoke('save_request_file', { projectPath, dirName, fileName, request })
}

export async function deleteRequestFile(
  projectPath: string,
  dirName: string,
  fileName: string
): Promise<void> {
  await invoke('delete_request_file', { projectPath, dirName, fileName })
}

export async function recordHistory(projectPath: string, item: HistoryItem): Promise<void> {
  await invoke('record_history', { projectPath, item })
}

export async function clearHistory(projectPath: string): Promise<void> {
  await invoke('clear_history', { projectPath })
}

export async function deleteHistoryItem(projectPath: string, itemId: string): Promise<void> {
  await invoke('delete_history_item', { projectPath, itemId })
}

export async function pickImportFile(): Promise<string | null> {
  return invoke<string | null>('pick_file')
}

export async function readImportSource(source: string): Promise<string> {
  return invoke<string>('read_import_source', { source })
}

export async function parseStructuredDocument(rawText: string): Promise<unknown> {
  const trimmed = rawText.trim()
  if (!trimmed) {
    throw new Error('文档内容为空')
  }
  try {
    return JSON.parse(trimmed)
  } catch (jsonErr) {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      return invoke<unknown>('parse_structured_document', { rawText })
    }
    throw jsonErr
  }
}

export async function mergeAndSaveCollection(
  projectPath: string,
  dirName: string,
  collection: ImportedCollection,
  syncSource?: CollectionSyncSource
): Promise<MergeStats> {
  return invoke<MergeStats>('merge_and_save_collection', {
    projectPath,
    dirName,
    collection,
    syncSource: syncSource ?? null
  })
}

