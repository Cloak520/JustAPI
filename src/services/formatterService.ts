import { invoke } from '@tauri-apps/api/core'

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function formatJsonFast(raw: string): Promise<string> {
  if (!raw.trim()) return raw
  if (!isTauriRuntime()) {
    return JSON.stringify(JSON.parse(raw), null, 2)
  }
  return invoke<string>('format_json_fast', { raw })
}

export async function minifyJsonFast(raw: string): Promise<string> {
  if (!raw.trim()) return raw
  if (!isTauriRuntime()) {
    return JSON.stringify(JSON.parse(raw))
  }
  return invoke<string>('minify_json_fast', { raw })
}
