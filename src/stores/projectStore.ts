import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useStorage } from '@vueuse/core'
import type { FullProjectData, ProjectConfig, SubProjectData, SubProjectConfig, ApiRequest, HistoryItem, KeyValuePair, Environment, NetworkSettings } from '@/types'
import { resolveEffectiveVariableMap, interpolate as interpolateText, type VariableSourceInfo } from '@/utils/interpolation'
import { useRequestStore } from './requestStore'

export interface RecentProject {
  path: string
  name: string
  lastOpened: number
}

export const useProjectStore = defineStore('project', () => {
  const projectPath = ref<string | null>(null)
  const projectConfig = ref<ProjectConfig | null>(null)
  const subProjects = ref<SubProjectData[]>([])
  const history = ref<HistoryItem[]>([])
  const currentSubProjectDir = ref<string | null>(null)

  // 本地存储的最近打开项目
  const recentProjects = useStorage<RecentProject[]>('justapi_recent_projects', [])

  // 全局独立环境列表与激活 ID (当未打开任何本地目录时生效，持久化保存在 localStorage)
  const globalEnvironments = useStorage<Environment[]>('justapi_global_environments', [
    {
      id: 'env_dev',
      name: 'Development',
      variables: {
        baseUrl: 'http://localhost:6674',
        env: 'dev'
      }
    }
  ])
  const globalActiveEnvId = useStorage<string | null>('justapi_global_active_env_id', 'env_dev')

  const hasProject = computed(() => !!projectPath.value && !!projectConfig.value)

  // 1. 打开项目对话框
  async function pickAndOpenProject() {
    try {
      const selected = await invoke<string | null>('pick_project_folder')
      if (selected) {
        await loadProject(selected)
      }
    } catch (err: any) {
      alert(`打开项目失败: ${err?.message || err}`)
    }
  }

  // 2. 加载项目目录
  async function loadProject(path: string) {
    try {
      const data = await invoke<FullProjectData>('load_project_from_dir', { path })
      projectPath.value = data.path
      projectConfig.value = data.config
      subProjects.value = data.sub_projects
      history.value = data.history

      if (data.sub_projects.length > 0 && !currentSubProjectDir.value) {
        currentSubProjectDir.value = data.sub_projects[0].dir_name
      }

      // 同步主项目根 baseUrl 至当前请求 store
      if (data.config.baseUrl) {
        const reqStore = useRequestStore()
        reqStore.baseUrl = data.config.baseUrl
      }

      // 同步主项目中的网络设置至当前请求 store
      if (data.config.networkSettings) {
        const reqStore = useRequestStore()
        reqStore.networkSettings = { ...data.config.networkSettings }
      }

      // 更新最近项目列表
      const existingIdx = recentProjects.value.findIndex(p => p.path === path)
      if (existingIdx !== -1) {
        recentProjects.value.splice(existingIdx, 1)
      }
      recentProjects.value.unshift({
        path,
        name: data.config.name,
        lastOpened: Date.now()
      })
      if (recentProjects.value.length > 10) {
        recentProjects.value.length = 10
      }
    } catch (err: any) {
      alert(`加载项目出错: ${err?.message || err}`)
    }
  }

  // 3. 级联继承解析：计算目标子项目的有效 BaseURL
  function resolveEffectiveBaseUrl(subProjectDir?: string): string {
    const rootBase = projectConfig.value?.baseUrl || ''
    if (!subProjectDir) return rootBase

    const sub = subProjects.value.find(s => s.dir_name === subProjectDir)
    if (!sub) return rootBase

    if (!sub.config.inheritBaseUrl && sub.config.baseUrl.trim()) {
      return sub.config.baseUrl.trim()
    }

    // 继承主项目 BaseURL，并可拼接子项目的前缀子路径
    let combined = rootBase.replace(/\/+$/, '')
    if (sub.config.baseUrl && !sub.config.baseUrl.startsWith('http')) {
      const prefix = sub.config.baseUrl.startsWith('/') ? sub.config.baseUrl : `/${sub.config.baseUrl}`
      combined = `${combined}${prefix}`
    }
    return combined
  }

  // 4. 级联继承解析：计算目标子项目的有效 Headers (合并主项目 + 子项目)
  function resolveEffectiveHeaders(subProjectDir?: string): KeyValuePair[] {
    const result: KeyValuePair[] = []
    const keyMap = new Set<string>()

    // 1) 先放入主项目全局 Headers
    if (projectConfig.value?.headers) {
      for (const h of projectConfig.value.headers) {
        if (h.enabled && h.key.trim()) {
          result.push({
            ...h,
            id: `proj_${h.id}`,
            inheritedFrom: 'project'
          })
          keyMap.add(h.key.trim().toLowerCase())
        }
      }
    }

    // 2) 如果有子项目，并且子项目配置了 headers
    if (subProjectDir) {
      const sub = subProjects.value.find(s => s.dir_name === subProjectDir)
      if (sub && sub.config.headers) {
        for (const h of sub.config.headers) {
          if (h.enabled && h.key.trim()) {
            const lowerKey = h.key.trim().toLowerCase()
            // 如果同名，子项目覆盖主项目
            const existingIdx = result.findIndex(r => r.key.trim().toLowerCase() === lowerKey)
            const item: KeyValuePair = {
              ...h,
              id: `sub_${h.id}`,
              inheritedFrom: 'subproject'
            }
            if (existingIdx !== -1) {
              result[existingIdx] = item
            } else {
              result.push(item)
            }
          }
        }
      }
    }

    return result
  }

  // 5. 保存主项目配置
  async function saveProjectConfig() {
    if (!projectPath.value || !projectConfig.value) return
    await invoke('save_project_config', {
      path: projectPath.value,
      config: projectConfig.value
    })
  }

  // 5.1 自动保存并同步主项目根 BaseURL 到 project.json
  async function updateBaseUrl(newBaseUrl: string) {
    if (!projectPath.value || !projectConfig.value) return
    const cleanUrl = newBaseUrl.trim()
    projectConfig.value.baseUrl = cleanUrl
    await saveProjectConfig()

    const reqStore = useRequestStore()
    reqStore.baseUrl = cleanUrl
  }

  // 5.2 自动保存并同步网络设置到 project.json
  async function updateNetworkSettings(settings: NetworkSettings) {
    if (!projectPath.value || !projectConfig.value) return
    projectConfig.value.networkSettings = { ...settings }
    await saveProjectConfig()
  }

  // 6. 创建子项目
  async function createSubProject(name: string, dirName: string, baseUrl?: string) {
    if (!projectPath.value) return
    const cleanDir = dirName.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
    const config: SubProjectConfig = {
      id: cleanDir,
      name: name.trim() || cleanDir,
      baseUrl: baseUrl?.trim() || '',
      inheritBaseUrl: true,
      headers: [],
      inheritHeaders: true,
      variables: {},
      inheritVariables: true
    }

    await invoke('create_subproject', {
      projectPath: projectPath.value,
      dirName: cleanDir,
      config
    })

    subProjects.value.push({
      config,
      dir_name: cleanDir,
      requests: []
    })
    currentSubProjectDir.value = cleanDir
  }

  // 7. 保存请求到子项目
  async function saveRequest(subProjectDir: string, fileName: string, req: ApiRequest) {
    if (!projectPath.value) return
    const cleanFname = fileName.endsWith('.json') ? fileName : `${fileName}.json`
    const toSave = { ...req, fileName: cleanFname }

    await invoke('save_request_file', {
      projectPath: projectPath.value,
      dirName: subProjectDir,
      fileName: cleanFname,
      request: toSave
    })

    // 更新内存列表
    const sub = subProjects.value.find(s => s.dir_name === subProjectDir)
    if (sub) {
      const idx = sub.requests.findIndex(r => r.id === req.id || r.fileName === cleanFname)
      if (idx !== -1) {
        sub.requests[idx] = toSave
      } else {
        sub.requests.push(toSave)
      }
    }
  }

  // 7.5 删除子项目
  async function deleteSubProject(dirName: string) {
    if (!projectPath.value) return
    await invoke('delete_subproject', {
      projectPath: projectPath.value,
      dirName
    })
    subProjects.value = subProjects.value.filter(s => s.dir_name !== dirName)
    if (currentSubProjectDir.value === dirName) {
      currentSubProjectDir.value = subProjects.value[0]?.dir_name || null
    }
  }

  // 8. 删除请求
  async function deleteRequest(subProjectDir: string, fileName: string) {
    if (!projectPath.value) return
    await invoke('delete_request_file', {
      projectPath: projectPath.value,
      dirName: subProjectDir,
      fileName
    })
    const sub = subProjects.value.find(s => s.dir_name === subProjectDir)
    if (sub) {
      sub.requests = sub.requests.filter(r => r.fileName !== fileName)
    }
  }

  // 9. 记录历史
  async function recordHistory(item: HistoryItem) {
    history.value.unshift(item)
    if (history.value.length > 200) {
      history.value.length = 200
    }
    if (projectPath.value) {
      await invoke('record_history', {
        projectPath: projectPath.value,
        item
      })
    }
  }

  // 10. 清空历史
  async function clearHistory() {
    history.value = []
    if (projectPath.value) {
      await invoke('clear_history', { projectPath: projectPath.value })
    }
  }

  // 11. 导入 Swagger 并无损合并至子项目
  async function importSwagger(subProjectDir: string, sourceUrl: string) {
    if (!projectPath.value) return null
    const stats = await invoke<{ added: number; updated: number; deprecated: number; total: number }>(
      'import_swagger_to_subproject',
      {
        projectPath: projectPath.value,
        dirName: subProjectDir,
        source: sourceUrl.trim()
      }
    )
    await loadProject(projectPath.value)
    return stats
  }

  // 12. 一键无损刷新子项目的 Swagger API
  async function refreshSwagger(subProjectDir: string) {
    if (!projectPath.value) return null
    const stats = await invoke<{ added: number; updated: number; deprecated: number; total: number }>(
      'refresh_swagger_subproject',
      {
        projectPath: projectPath.value,
        dirName: subProjectDir
      }
    )
    await loadProject(projectPath.value)
    return stats
  }

  // 13. 环境变量管理 (兼容打开本地项目目录与纯独立单机使用)
  const environments = computed<Environment[]>(() => {
    if (projectConfig.value?.environments && projectConfig.value.environments.length > 0) {
      return projectConfig.value.environments
    }
    return globalEnvironments.value
  })

  const activeEnvironment = computed<Environment | null>(() => {
    if (projectConfig.value?.environments && projectConfig.value.environments.length > 0) {
      if (!projectConfig.value.activeEnvironmentId) return null
      return projectConfig.value.environments.find(e => e.id === projectConfig.value?.activeEnvironmentId) || null
    }
    if (!globalActiveEnvId.value) return null
    return globalEnvironments.value.find(e => e.id === globalActiveEnvId.value) || null
  })

  async function setActiveEnvironment(id: string | null) {
    if (projectConfig.value) {
      projectConfig.value.activeEnvironmentId = id || undefined
      await saveProjectConfig()
    } else {
      globalActiveEnvId.value = id
    }
  }

  // 批量保存所有环境与激活状态 (兼容本地项目与独立模式)
  async function saveEnvironments(envs: Environment[], activeId?: string | null) {
    if (projectConfig.value) {
      projectConfig.value.environments = envs
      if (activeId !== undefined) {
        projectConfig.value.activeEnvironmentId = activeId || undefined
      }
      await saveProjectConfig()
    } else {
      globalEnvironments.value = envs
      if (activeId !== undefined) {
        globalActiveEnvId.value = activeId
      }
    }
  }

  async function createEnvironment(name: string, variables: Record<string, string> = {}) {
    const newEnv: Environment = {
      id: 'env_' + crypto.randomUUID().slice(0, 8),
      name: name.trim() || '新环境',
      variables
    }
    if (projectConfig.value) {
      if (!projectConfig.value.environments) {
        projectConfig.value.environments = []
      }
      projectConfig.value.environments.push(newEnv)
      if (!projectConfig.value.activeEnvironmentId) {
        projectConfig.value.activeEnvironmentId = newEnv.id
      }
      await saveProjectConfig()
    } else {
      globalEnvironments.value.push(newEnv)
      if (!globalActiveEnvId.value) {
        globalActiveEnvId.value = newEnv.id
      }
    }
    return newEnv
  }

  async function updateEnvironment(id: string, name: string, variables: Record<string, string>) {
    if (projectConfig.value?.environments) {
      const env = projectConfig.value.environments.find(e => e.id === id)
      if (env) {
        env.name = name.trim()
        env.variables = variables
        await saveProjectConfig()
      }
    } else {
      const env = globalEnvironments.value.find(e => e.id === id)
      if (env) {
        env.name = name.trim()
        env.variables = variables
      }
    }
  }

  async function deleteEnvironment(id: string) {
    if (projectConfig.value?.environments) {
      projectConfig.value.environments = projectConfig.value.environments.filter(e => e.id !== id)
      if (projectConfig.value.activeEnvironmentId === id) {
        projectConfig.value.activeEnvironmentId = projectConfig.value.environments[0]?.id || undefined
      }
      await saveProjectConfig()
    } else {
      globalEnvironments.value = globalEnvironments.value.filter(e => e.id !== id)
      if (globalActiveEnvId.value === id) {
        globalActiveEnvId.value = globalEnvironments.value[0]?.id || null
      }
    }
  }

  // 14. 更新子项目配置 (包含环境变量与继承开关)
  async function updateSubProjectConfig(dirName: string, config: SubProjectConfig) {
    if (!projectPath.value) return
    const sub = subProjects.value.find(s => s.dir_name === dirName)
    if (sub) {
      sub.config = config
    }
    await invoke('save_subproject_config', {
      projectPath: projectPath.value,
      dirName,
      config
    })
  }

  // 15. 获取针对指定子项目的多层级有效变量 Map (主项目环境 -> 子项目覆盖)
  function getEffectiveVariableMap(subProjectDir?: string) {
    const sub = subProjectDir ? subProjects.value.find(s => s.dir_name === subProjectDir) : null
    if (projectConfig.value) {
      return resolveEffectiveVariableMap(projectConfig.value, sub?.config)
    }

    // 未打开项目目录时的独立全局变量 Map
    const map = new Map<string, VariableSourceInfo>()
    const active = activeEnvironment.value
    if (active?.variables) {
      for (const [k, v] of Object.entries(active.variables)) {
        if (k.trim()) {
          map.set(k.trim(), {
            value: v,
            source: 'project',
            environmentName: active.name
          })
        }
      }
    }
    return map
  }

  // 16. 动态插值解析字符串
  function interpolate(text: string, subProjectDir?: string) {
    const map = getEffectiveVariableMap(subProjectDir)
    return interpolateText(text, map)
  }

  return {
    projectPath,
    projectConfig,
    subProjects,
    history,
    currentSubProjectDir,
    recentProjects,
    hasProject,
    environments,
    activeEnvironment,
    pickAndOpenProject,
    loadProject,
    resolveEffectiveBaseUrl,
    resolveEffectiveHeaders,
    saveProjectConfig,
    updateBaseUrl,
    updateNetworkSettings,
    saveEnvironments,
    createSubProject,
    deleteSubProject,
    updateSubProjectConfig,
    saveRequest,
    deleteRequest,
    recordHistory,
    clearHistory,
    importSwagger,
    refreshSwagger,
    setActiveEnvironment,
    createEnvironment,
    updateEnvironment,
    deleteEnvironment,
    getEffectiveVariableMap,
    interpolate
  }
})
