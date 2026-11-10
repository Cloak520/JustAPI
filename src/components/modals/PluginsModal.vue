<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
  >
    <div class="flex flex-col w-full max-w-2xl h-[560px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      <!-- 头部 -->
      <div class="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/40 shrink-0">
        <div class="flex items-center space-x-2">
          <div class="w-6 h-6 rounded-md bg-primary/20 text-primary flex items-center justify-center">
            <Puzzle class="w-3.5 h-3.5" />
          </div>
          <h3 class="font-semibold text-sm">外置插件管理</h3>
          <span class="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-mono">
            .justapi/plugins/
          </span>
        </div>

        <div class="flex items-center space-x-1.5">
          <button
            @click="handleReload"
            :disabled="loading"
            class="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-muted/70 hover:bg-muted text-xs text-foreground transition disabled:opacity-50"
            title="重新扫描 .justapi/plugins/ 并热重载所有已启用插件"
          >
            <RefreshCw class="w-3.5 h-3.5" :class="loading ? 'animate-spin text-primary' : ''" />
            <span>刷新重载</span>
          </button>
          <button
            @click="close"
            class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- 主体区 -->
      <div class="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
        <!-- 插件目录卡片 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="p-3.5 rounded-xl border border-border bg-card/60 space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-1.5 font-semibold text-foreground">
                <Folder class="w-3.5 h-3.5 text-amber-400" />
                <span>项目级插件目录</span>
              </div>
              <span class="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                优先级更高
              </span>
            </div>
            <p
              class="text-[11px] font-mono text-muted-foreground truncate"
              :title="projectPluginsPathText"
            >
              {{ projectPluginsPathText }}
            </p>
            <div class="flex items-center space-x-2 pt-0.5">
              <button
                @click="openPluginsFolder('project')"
                :disabled="!workspaceStore.projectPath"
                class="flex items-center space-x-1 px-2 py-1 rounded bg-muted hover:bg-muted/80 text-[11px] transition disabled:opacity-40"
              >
                <FolderOpen class="w-3 h-3" />
                <span>打开目录</span>
              </button>
              <button
                @click="createExample('project')"
                :disabled="!workspaceStore.projectPath || creatingScope === 'project'"
                class="flex items-center space-x-1 px-2 py-1 rounded bg-primary/15 hover:bg-primary/25 text-primary text-[11px] font-medium transition disabled:opacity-40"
              >
                <Sparkles class="w-3 h-3" />
                <span>生成示例插件</span>
              </button>
            </div>
          </div>

          <div class="p-3.5 rounded-xl border border-border bg-card/60 space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-1.5 font-semibold text-foreground">
                <Globe class="w-3.5 h-3.5 text-primary" />
                <span>全局插件目录</span>
              </div>
              <span class="text-[10px] px-1.5 py-0.2 rounded bg-primary/15 text-primary border border-primary/30">
                跨项目生效
              </span>
            </div>
            <p
              class="text-[11px] font-mono text-muted-foreground truncate"
              :title="globalPluginsPathText"
            >
              {{ globalPluginsPathText }}
            </p>
            <div class="flex items-center space-x-2 pt-0.5">
              <button
                @click="openPluginsFolder('global')"
                class="flex items-center space-x-1 px-2 py-1 rounded bg-muted hover:bg-muted/80 text-[11px] transition"
              >
                <FolderOpen class="w-3 h-3" />
                <span>打开目录</span>
              </button>
              <button
                @click="createExample('global')"
                :disabled="creatingScope === 'global'"
                class="flex items-center space-x-1 px-2 py-1 rounded bg-primary/15 hover:bg-primary/25 text-primary text-[11px] font-medium transition disabled:opacity-40"
              >
                <Sparkles class="w-3 h-3" />
                <span>生成示例插件</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 全局扫描错误提示 -->
        <div
          v-if="lastSyncError"
          class="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive flex items-start space-x-2"
        >
          <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />
          <div class="space-y-0.5">
            <div class="font-semibold">扫描插件目录失败</div>
            <div class="text-[11px] font-mono break-all">{{ lastSyncError }}</div>
          </div>
        </div>

        <!-- 已发现插件列表 -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-muted-foreground">
            <span class="font-semibold text-foreground">
              已发现插件 ({{ records.length }})
            </span>
            <span class="text-[11px]">
              已激活 {{ activeCount }} 个 · 开关变更即时生效
            </span>
          </div>

          <div
            v-if="records.length === 0"
            class="py-10 px-4 rounded-xl border border-dashed border-border/70 flex flex-col items-center justify-center text-center space-y-2 text-muted-foreground"
          >
            <Puzzle class="w-8 h-8 opacity-30" />
            <div class="font-medium text-foreground/80">
              当前 .justapi/plugins/ 目录下暂无外置插件
            </div>
            <p class="text-[11px] max-w-md leading-relaxed">
              你可以点击上方「生成示例插件」一键体验，或在 <code class="font-mono">.justapi/plugins/&lt;plugin-name&gt;/</code> 中放入
              <code class="font-mono">manifest.json</code> 和 <code class="font-mono">index.mjs</code> 后点击「刷新重载」。
            </p>
          </div>

          <div
            v-for="rec in records"
            :key="rec.key"
            class="p-3.5 rounded-xl border bg-card/60 space-y-2 transition"
            :class="
              rec.status === 'error'
                ? 'border-destructive/40 bg-destructive/5'
                : rec.status === 'active'
                  ? 'border-emerald-500/30'
                  : 'border-border'
            "
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 space-y-1">
                <div class="flex items-center flex-wrap gap-1.5">
                  <span class="font-semibold text-foreground text-xs">
                    {{ rec.manifest?.name || rec.dirName }}
                  </span>
                  <span
                    v-if="rec.manifest?.version"
                    class="text-[10px] px-1.5 py-0.2 rounded bg-muted font-mono text-muted-foreground"
                  >
                    v{{ rec.manifest.version }}
                  </span>
                  <span
                    class="text-[10px] px-1.5 py-0.2 rounded border"
                    :class="scopeBadgeClass(rec.scope)"
                  >
                    {{ scopeLabel(rec.scope) }}
                  </span>
                  <span
                    class="text-[10px] px-1.5 py-0.2 rounded border font-medium"
                    :class="statusBadgeClass(rec.status)"
                  >
                    {{ statusLabel(rec) }}
                  </span>
                </div>

                <div class="text-[11px] font-mono text-muted-foreground truncate">
                  ID: {{ rec.manifest?.id || '(未知)' }} · 目录: {{ rec.dirName }}
                </div>

                <p
                  v-if="rec.manifest?.description"
                  class="text-[11px] text-muted-foreground leading-relaxed"
                >
                  {{ rec.manifest.description }}
                </p>
              </div>

              <!-- 操作区：移除按钮 + 启用/禁用开关 -->
              <div class="flex items-center space-x-2 shrink-0 mt-0.5">
                <button
                  @click="requestRemovePlugin(rec)"
                  :disabled="rec.scope === 'bundled' || loading || removingKey !== null"
                  class="p-1.5 rounded-md transition"
                  :class="
                    rec.scope === 'bundled'
                      ? 'text-muted-foreground/35 cursor-not-allowed'
                      : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-40 disabled:cursor-not-allowed'
                  "
                  :title="
                    rec.scope === 'bundled'
                      ? '官方内置插件不可移除，可通过右侧开关禁用'
                      : '从本地目录永久移除此插件'
                  "
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>

                <label
                  class="relative inline-flex items-center shrink-0"
                  :class="loading || removingKey !== null ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'"
                  :title="rec.enabled ? '点击禁用此插件' : '点击启用此插件'"
                >
                  <input
                    type="checkbox"
                    :checked="rec.enabled"
                    :disabled="loading || removingKey !== null"
                    @change="togglePlugin(rec.key, $event)"
                    class="sr-only peer"
                  />
                  <div class="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
                </label>
              </div>
            </div>

            <div
              v-if="rec.error"
              class="p-2 rounded-lg bg-destructive/10 border border-destructive/25 text-destructive text-[11px] font-mono break-all"
            >
              {{ rec.error }}
            </div>
          </div>
        </div>

        <!-- 开发者目录约定提示 -->
        <div class="p-3.5 rounded-xl border border-border/70 bg-muted/20 space-y-1.5">
          <div class="flex items-center space-x-1.5 font-semibold text-foreground/90">
            <Code2 class="w-3.5 h-3.5 text-primary" />
            <span>外置插件最小结构约定</span>
          </div>
          <pre class="text-[11px] font-mono text-muted-foreground leading-relaxed overflow-x-auto">.justapi/plugins/&lt;my-plugin&gt;/
├── manifest.json   # { "id", "name", "version", "entry": "index.mjs", "style"?: "style.css" }
└── index.mjs       # export function activate(ctx) { ctx.registerRequestTab(...) }</pre>
        </div>
      </div>

      <!-- 底部 -->
      <div class="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/40 shrink-0 text-xs gap-3">
        <span v-if="workspaceStore.hasProject" class="text-[11px] text-muted-foreground">
          插件启停状态保存在项目 <code class="font-mono">.justapi/project.json</code> · 支持项目与全局目录
        </span>
        <span v-else class="text-[11px] text-muted-foreground">
          未打开项目时启停状态暂存本地浏览器；打开项目后保存在 <code class="font-mono">.justapi/project.json</code>
        </span>
        <button
          @click="close"
          class="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition shadow-sm"
        >
          完成
        </button>
      </div>
    </div>

    <!-- 移除插件确认浮层 -->
    <div
      v-if="pendingRemoveTarget"
      class="fixed inset-0 z-10 flex items-center justify-center bg-black/50 backdrop-blur-[1px] p-4"
    >
      <div class="bg-card border border-border rounded-xl p-5 w-full max-w-sm space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div class="flex items-start space-x-3">
          <div class="w-8 h-8 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
            <AlertTriangle class="w-4 h-4" />
          </div>
          <div class="min-w-0">
            <h4 class="font-semibold text-sm text-foreground">
              移除外置插件
            </h4>
            <p class="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              此操作不可撤销，将从本地磁盘永久删除该插件目录并自动清理禁用记录。
            </p>
          </div>
        </div>

        <div class="p-2.5 rounded-lg bg-muted/40 border border-border/60 text-xs space-y-1">
          <div class="flex items-center justify-between gap-2">
            <span class="font-semibold text-foreground truncate">
              {{ pendingRemoveTarget.manifest?.name || pendingRemoveTarget.dirName }}
            </span>
            <span
              class="text-[10px] px-1.5 py-0.2 rounded border shrink-0"
              :class="scopeBadgeClass(pendingRemoveTarget.scope)"
            >
              {{ scopeLabel(pendingRemoveTarget.scope) }}
            </span>
          </div>
          <div class="text-[11px] font-mono text-muted-foreground break-all">
            {{ pendingRemoveTarget.pluginDir }}
          </div>
        </div>

        <div class="flex justify-end space-x-2 pt-1 text-xs">
          <button
            @click="cancelRemovePlugin"
            :disabled="removingKey !== null"
            class="px-3 py-1.5 rounded hover:bg-muted text-muted-foreground transition disabled:opacity-50"
          >
            取消
          </button>
          <button
            @click="confirmRemovePlugin"
            :disabled="removingKey !== null"
            class="px-4 py-1.5 rounded bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90 transition shadow-sm disabled:opacity-50"
          >
            {{ removingKey !== null ? '移除中...' : '确认移除' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  AlertCircle,
  AlertTriangle,
  Code2,
  Folder,
  FolderOpen,
  Globe,
  Puzzle,
  RefreshCw,
  Sparkles,
  Trash2,
  X
} from 'lucide-vue-next'
import { useEscapeCancel } from '@/composables/useEscapeCancel'
import { defaultExternalPluginHost } from '@/core/plugins/pluginHost'
import type { ExternalPluginRecord, PluginScope } from '@/core/plugins/types'
import { ESCAPE_PRIORITY } from '@/core/shortcuts/escapeStack'
import {
  createExampleExternalPlugin,
  isTauriRuntime,
  openExternalPluginsDir
} from '@/services/pluginService'
import { useAppStore } from '@/stores/appStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
}>()

const workspaceStore = useWorkspaceStore()
const appStore = useAppStore()

const creatingScope = ref<PluginScope | null>(null)
const pendingRemoveTarget = ref<ExternalPluginRecord | null>(null)
const removingKey = ref<string | null>(null)

watch(
  () => props.modelValue,
  open => {
    if (!open) {
      pendingRemoveTarget.value = null
    }
  }
)

const records = computed(() => defaultExternalPluginHost.records.value)
const activeCount = computed(() => defaultExternalPluginHost.activeCount.value)
const loading = computed(() => defaultExternalPluginHost.loading.value)
const lastSyncError = computed(() => defaultExternalPluginHost.lastSyncError.value)

const projectPluginsPathText = computed(() => {
  if (defaultExternalPluginHost.projectDir.value) {
    return defaultExternalPluginHost.projectDir.value
  }
  if (workspaceStore.projectPath) {
    return `${workspaceStore.projectPath}/.justapi/plugins`
  }
  return '未打开本地项目（打开项目后自动扫描 <project>/.justapi/plugins）'
})

const globalPluginsPathText = computed(() => {
  return defaultExternalPluginHost.globalDir.value || '~/.justapi/plugins'
})

function scopeLabel(scope: PluginScope): string {
  switch (scope) {
    case 'project':
      return '项目'
    case 'global':
      return '全局'
    case 'bundled':
      return '官方外置'
  }
}

function scopeBadgeClass(scope: PluginScope): string {
  switch (scope) {
    case 'project':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/30'
    case 'global':
      return 'bg-primary/10 text-primary border-primary/30'
    case 'bundled':
      return 'bg-purple-500/10 text-purple-400 border-purple-500/30'
  }
}

function statusLabel(rec: ExternalPluginRecord): string {
  switch (rec.status) {
    case 'active':
      return '已激活'
    case 'disabled':
      return '已禁用'
    case 'overridden':
      if (rec.overriddenByScope === 'global') return '已被全局插件覆盖'
      return '已被项目插件覆盖'
    case 'error':
      return '加载失败'
  }
}

function statusBadgeClass(status: ExternalPluginRecord['status']): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    case 'disabled':
      return 'bg-muted text-muted-foreground border-border'
    case 'overridden':
      return 'bg-blue-500/15 text-blue-400 border-blue-500/30'
    case 'error':
      return 'bg-destructive/15 text-destructive border-destructive/30'
  }
}

async function handleReload() {
  await defaultExternalPluginHost.sync(workspaceStore.projectPath)
  appStore.showToast(`已重载外置插件（当前激活 ${defaultExternalPluginHost.activeCount.value} 个）`)
}

async function togglePlugin(key: string, event: Event) {
  const input = event.target as HTMLInputElement
  const enabled = input.checked
  try {
    await defaultExternalPluginHost.setPluginEnabled(key, enabled)
  } catch (err: any) {
    input.checked = !enabled
    appStore.showToast(`保存插件启停状态失败: ${err?.message || err}`, true)
  }
}

async function openPluginsFolder(scope: PluginScope) {
  if (!isTauriRuntime()) {
    appStore.showToast('请在 Tauri 桌面应用中打开本地插件目录', true)
    return
  }
  try {
    const dir = await openExternalPluginsDir(scope, workspaceStore.projectPath)
    appStore.showToast(`已打开插件目录: ${dir}`)
  } catch (err: any) {
    appStore.showToast(`打开插件目录失败: ${err?.message || err}`, true)
  }
}

async function createExample(scope: PluginScope) {
  if (!isTauriRuntime()) {
    appStore.showToast('请在 Tauri 桌面应用中生成本地示例插件', true)
    return
  }
  creatingScope.value = scope
  try {
    const createdPath = await createExampleExternalPlugin(scope, workspaceStore.projectPath)
    await defaultExternalPluginHost.sync(workspaceStore.projectPath)
    appStore.showToast(`已生成并激活示例插件: ${createdPath}`)
  } catch (err: any) {
    appStore.showToast(`生成示例插件失败: ${err?.message || err}`, true)
  } finally {
    creatingScope.value = null
  }
}

function requestRemovePlugin(rec: ExternalPluginRecord) {
  if (rec.scope === 'bundled') {
    appStore.showToast('官方内置插件不可移除，可使用右侧开关禁用', true)
    return
  }
  pendingRemoveTarget.value = rec
}

function cancelRemovePlugin() {
  if (removingKey.value !== null) return
  pendingRemoveTarget.value = null
}

async function confirmRemovePlugin() {
  const target = pendingRemoveTarget.value
  if (!target) return
  if (!isTauriRuntime()) {
    appStore.showToast('请在 Tauri 桌面应用中移除本地插件', true)
    pendingRemoveTarget.value = null
    return
  }

  removingKey.value = target.key
  try {
    await defaultExternalPluginHost.removePlugin(target.key)
    pendingRemoveTarget.value = null
    appStore.showToast(`已移除插件 [${target.manifest?.name || target.dirName}]`)
  } catch (err: any) {
    appStore.showToast(`移除插件失败: ${err?.message || err}`, true)
  } finally {
    removingKey.value = null
  }
}

function close() {
  if (removingKey.value !== null) return
  pendingRemoveTarget.value = null
  emit('update:modelValue', false)
}

useEscapeCancel(() => props.modelValue, close)
useEscapeCancel(
  () => props.modelValue && Boolean(pendingRemoveTarget.value),
  cancelRemovePlugin,
  { priority: ESCAPE_PRIORITY.OVERLAY }
)
</script>

