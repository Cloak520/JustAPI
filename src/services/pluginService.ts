import { invoke } from '@tauri-apps/api/core'
import type {
  ExternalPluginAssets,
  ExternalPluginsDiscoveryResult,
  PluginScope
} from '@/core/plugins/types'

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function discoverExternalPlugins(
  projectPath?: string | null
): Promise<ExternalPluginsDiscoveryResult> {
  return invoke<ExternalPluginsDiscoveryResult>('discover_external_plugins', {
    projectPath: projectPath || null
  })
}

export async function readExternalPluginAssets(
  scope: PluginScope,
  dirName: string,
  projectPath?: string | null
): Promise<ExternalPluginAssets> {
  return invoke<ExternalPluginAssets>('read_external_plugin_assets', {
    scope,
    dirName,
    projectPath: projectPath || null
  })
}

export async function openExternalPluginsDir(
  scope: PluginScope,
  projectPath?: string | null
): Promise<string> {
  return invoke<string>('open_external_plugins_dir', {
    scope,
    projectPath: projectPath || null
  })
}

export async function createExampleExternalPlugin(
  scope: PluginScope,
  projectPath?: string | null
): Promise<string> {
  return invoke<string>('create_example_external_plugin', {
    scope,
    projectPath: projectPath || null
  })
}

export async function removeExternalPlugin(
  scope: PluginScope,
  dirName: string,
  projectPath?: string | null
): Promise<void> {
  await invoke('remove_external_plugin', {
    scope,
    dirName,
    projectPath: projectPath || null
  })
}

