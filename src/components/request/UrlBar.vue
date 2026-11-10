<template>
  <div class="flex flex-col space-y-1.5">
    <!-- 接口名称、所属子项目/分组 与 导入/导出/复制扩展动作 -->
    <div class="flex items-center justify-between pb-0.5 px-0.5 gap-2">
      <div class="group/title flex items-center space-x-1.5 flex-1 max-w-md min-w-0">
        <input
          v-model="tabTitle"
          type="text"
          placeholder="未命名请求 (点击输入接口名称)"
          class="text-xs font-semibold bg-transparent hover:bg-muted/40 focus:bg-background px-2 py-0.5 rounded border border-transparent hover:border-border/60 focus:border-primary focus:outline-none transition w-full text-foreground truncate"
          @change="handleTabTitleCommit"
          @blur="handleTabTitleCommit"
          @keydown.enter="($event.target as HTMLElement).blur()"
          title="点击直接重命名当前接口"
        />
        <Edit3 class="w-3 h-3 text-muted-foreground/40 group-hover/title:text-primary transition shrink-0 pointer-events-none" />
      </div>

      <div class="flex items-center space-x-1.5 text-xs shrink-0">
        <button
          @click="appStore.showSaveModal = true"
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono transition border"
          :class="
            activeTab?.subProjectDir
              ? 'bg-muted/50 hover:bg-muted text-foreground/90 border-border hover:border-primary/50'
              : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-dashed border-amber-500/40'
          "
          :title="activeTab?.subProjectDir ? '点击更改所属子项目与分组' : '当前请求尚未关联子项目，点击指定'"
        >
          <Folder class="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span class="max-w-[200px] truncate font-sans font-medium">
            {{
              activeTab?.subProjectDir
                ? `${subProjectDisplayName}${activeTab.group ? ` / ${activeTab.group}` : ''}`
                : '未关联子项目 (点击指定)'
            }}
          </span>
          <ChevronDown class="w-3 h-3 opacity-60 shrink-0" />
        </button>

        <!-- 扩展注册：导入请求 (如 cURL) -->
        <button
          v-if="importers.length > 0"
          @click="showImportModal = true"
          class="flex items-center space-x-1 px-2 py-1 rounded-lg text-[11px] font-sans font-medium transition border bg-muted/40 hover:bg-muted text-foreground/80 hover:text-foreground border-border hover:border-primary/50"
          title="导入外部请求 (如 cURL)"
        >
          <Terminal class="w-3.5 h-3.5 text-muted-foreground" />
          <span>导入</span>
        </button>

        <!-- 扩展注册：导出请求 (单个直接点击复制，多个下拉选择) -->
        <button
          v-if="exporters.length === 1"
          @click="runExporter(exporters[0])"
          class="flex items-center space-x-1 px-2 py-1 rounded-lg text-[11px] font-sans font-medium transition border bg-muted/40 hover:bg-muted text-foreground/80 hover:text-foreground border-border hover:border-primary/50"
          :title="exporters[0].description || `导出并复制 ${exporters[0].label}`"
        >
          <Code2 class="w-3.5 h-3.5 text-muted-foreground" />
          <span>{{ exporters[0].label }}</span>
        </button>

        <div v-else-if="exporters.length > 1" ref="exportDropdownRef" class="relative">
          <button
            @click="showExportDropdown = !showExportDropdown"
            class="flex items-center space-x-1 px-2 py-1 rounded-lg text-[11px] font-sans font-medium transition border bg-muted/40 hover:bg-muted text-foreground/80 hover:text-foreground border-border hover:border-primary/50"
            title="导出当前请求为代码/命令"
          >
            <Code2 class="w-3.5 h-3.5 text-muted-foreground" />
            <span>导出</span>
            <ChevronDown class="w-3 h-3 opacity-60" />
          </button>

          <div
            v-if="showExportDropdown"
            class="absolute right-0 top-full mt-1 w-40 rounded-xl border border-border bg-card p-1 shadow-2xl z-50 text-xs animate-in fade-in zoom-in-95"
          >
            <button
              v-for="exp in exporters"
              :key="exp.id"
              @click="runExporter(exp)"
              class="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-muted transition truncate"
              :title="exp.description"
            >
              {{ exp.label }}
            </button>
          </div>
        </div>

        <button
          @click="sessionStore.duplicateActiveOrSubprojectRequest()"
          class="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-sans font-medium transition border bg-muted/40 hover:bg-muted text-foreground/80 hover:text-foreground border-border hover:border-primary/50"
          title="复制当前接口为新副本 (Duplicate)"
        >
          <Copy class="w-3.5 h-3.5 text-muted-foreground" />
          <span>复制接口</span>
        </button>
      </div>
    </div>

    <div class="flex items-center space-x-2">
      <!-- Method 下拉选择器 -->
      <div ref="methodDropdownRef" class="relative shrink-0">
        <button
          type="button"
          @click="showMethodDropdown = !showMethodDropdown"
          :class="getMethodBadgeClass(req.method)"
          class="font-mono font-bold text-xs px-3 py-2 rounded-lg border flex items-center space-x-1.5 transition cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
          title="点击切换 HTTP 请求方式"
        >
          <span>{{ req.method }}</span>
          <ChevronDown
            class="w-3.5 h-3.5 opacity-70 transition-transform duration-150"
            :class="showMethodDropdown ? 'rotate-180' : ''"
          />
        </button>

        <div
          v-if="showMethodDropdown"
          class="absolute left-0 top-full mt-1.5 w-32 rounded-xl border border-border bg-card p-1 shadow-2xl z-50 text-xs font-mono font-semibold animate-in fade-in zoom-in-95 duration-100"
          @click.stop
        >
          <div
            v-for="m in HTTP_METHODS"
            :key="m"
            @click="selectMethod(m)"
            class="flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition hover:bg-muted"
            :class="req.method === m ? 'bg-primary/10 font-bold' : ''"
          >
            <span :class="getMethodTextColor(m)">{{ m }}</span>
            <Check v-if="req.method === m" class="w-3.5 h-3.5 text-primary" />
          </div>
        </div>
      </div>

      <!-- URL 输入框群组 -->
      <div class="flex-1 flex items-center bg-card border border-border rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-primary transition">
        <div
          v-if="req.group"
          class="px-2.5 py-1.5 bg-amber-500/10 text-amber-400 text-xs font-mono border-r border-border flex items-center space-x-1 shrink-0 select-none"
          :title="`分组: ${req.group}`"
        >
          <Folder class="w-3 h-3 text-amber-400" />
          <span class="max-w-[120px] truncate font-sans font-medium text-[11px]">{{ req.group }}</span>
        </div>

        <div
          v-if="!isAbsoluteUrl"
          class="px-2.5 py-1.5 bg-muted/60 text-muted-foreground text-xs font-mono border-r border-border flex items-center space-x-1.5 shrink-0 select-none transition-all animate-in fade-in duration-150"
        >
          <Globe class="w-3.5 h-3.5 text-primary/80" />
          <span
            class="max-w-[200px] truncate"
            :title="
              sessionStore.interpolatedBaseUrl !== sessionStore.baseUrl
                ? `${sessionStore.baseUrl} -> ${sessionStore.interpolatedBaseUrl}`
                : sessionStore.baseUrl || '无 BaseURL'
            "
          >
            {{ sessionStore.interpolatedBaseUrl || sessionStore.baseUrl || '无 BaseURL' }}
          </span>
        </div>

        <input
          ref="pathInputRef"
          v-model="req.path"
          type="text"
          :placeholder="isAbsoluteUrl ? 'https://api.example.com/v1/...' : '/api/v1/resource/{id} (可直接输入完整 https:// 地址，输入 {{ 插入变量)'"
          class="w-full bg-transparent px-3 py-2 text-xs font-mono text-foreground focus:outline-none"
          @change="sessionStore.autoSaveActiveTab()"
          @blur="sessionStore.autoSaveActiveTab()"
          @keydown.enter="handlePathEnter"
        />
      </div>

      <!-- 发送 / 取消按钮 -->
      <button
        v-if="sessionStore.loading"
        @click="sessionStore.cancelActiveRequest()"
        class="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 font-medium text-xs transition shadow-sm shrink-0 animate-in fade-in"
        title="中途取消此请求"
      >
        <Square class="w-3 h-3 fill-current" />
        <span>Cancel</span>
      </button>

      <button
        v-else
        @click="sessionStore.sendActiveRequest()"
        class="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-xs hover:bg-primary/90 transition shadow-sm shrink-0"
        title="快捷键: Cmd/Ctrl + Enter"
      >
        <Send class="w-3.5 h-3.5" />
        <span>Send</span>
      </button>
    </div>

    <!-- 实时拼接完整 URL 与插值预览 -->
    <div class="flex flex-col space-y-1 px-1">
      <div class="flex items-center justify-between text-[11px] text-muted-foreground">
        <div class="flex items-center space-x-2 truncate flex-1 min-w-0">
          <span class="text-muted-foreground/70 shrink-0">拼接预览:</span>
          <span class="font-mono text-foreground/90 truncate select-all">{{ sessionStore.resolvedUrl }}</span>
        </div>
        <button
          v-if="sessionStore.resolvedUrl"
          @click="copyUrlToClipboard(sessionStore.resolvedUrl, 'resolved')"
          class="flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/80 transition shrink-0 ml-2 border border-transparent hover:border-border"
          title="复制拼接 URL 到剪贴板"
        >
          <Check v-if="copiedType === 'resolved'" class="w-3 h-3 text-emerald-400" />
          <Copy v-else class="w-3 h-3" />
          <span>{{ copiedType === 'resolved' ? '已复制' : '复制 URL' }}</span>
        </button>
      </div>

      <div v-if="sessionStore.urlVariableTokens.length > 0" class="flex items-center justify-between text-[11px]">
        <div class="flex items-center space-x-2 flex-wrap gap-y-1 flex-1 min-w-0">
          <span class="text-emerald-400/90 font-medium shrink-0">实际发送:</span>
          <span class="font-mono text-emerald-400 font-semibold truncate">{{ sessionStore.interpolatedUrl }}</span>

          <div class="flex items-center space-x-1 pl-1">
            <span
              v-for="token in sessionStore.urlVariableTokens"
              :key="token.key"
              class="text-[10px] px-1.5 py-0.2 rounded font-mono border"
              :class="{
                'bg-purple-500/10 text-purple-400 border-purple-500/20': token.source === 'system',
                'bg-blue-500/10 text-blue-400 border-blue-500/20': token.source === 'subproject',
                'bg-emerald-500/10 text-emerald-400 border-emerald-500/20': token.source === 'project',
                'bg-rose-500/10 text-rose-400 border-rose-500/20': token.source === 'unresolved'
              }"
              :title="
                token.source === 'system'
                  ? `${token.token}: 系统内置动态变量 (发送时实时生成)`
                  : token.source === 'subproject'
                    ? `${token.token} -> '${token.value}' (来自子项目覆盖)`
                    : token.source === 'project'
                      ? `${token.token} -> '${token.value}' (来自环境: ${token.environmentName || '当前环境'})`
                      : `${token.token}: 未定义变量，将保持原样`
              "
            >
              {{ token.token }}
              <span v-if="token.source === 'system'">⚡</span>
              <span v-else-if="token.source === 'subproject'">[子项目]</span>
              <span v-else-if="token.source === 'project'">[{{ token.environmentName }}]</span>
              <span v-else class="text-rose-400">[未定义]</span>
            </span>
          </div>
        </div>
        <button
          @click="copyUrlToClipboard(sessionStore.interpolatedUrl, 'interpolated')"
          class="flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition shrink-0 ml-2 border border-emerald-500/20"
          title="复制实际发送 URL 到剪贴板"
        >
          <Check v-if="copiedType === 'interpolated'" class="w-3 h-3 text-emerald-400" />
          <Copy v-else class="w-3 h-3" />
          <span>{{ copiedType === 'interpolated' ? '已复制' : '复制' }}</span>
        </button>
      </div>
    </div>

    <!-- 通用请求导入弹窗 -->
    <ImportRequestModal v-model="showImportModal" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import {
  Check,
  ChevronDown,
  Code2,
  Copy,
  Edit3,
  Folder,
  Globe,
  Send,
  Square,
  Terminal
} from 'lucide-vue-next'
import ImportRequestModal from '@/components/modals/ImportRequestModal.vue'
import { useEscapeCancel } from '@/composables/useEscapeCancel'
import {
  isVariableAutocompleteActiveForElement,
  useVariableInput,
  wasVariableAutocompleteEnterHandled
} from '@/composables/useVariableAutocomplete'
import {
  requestExporterRegistry,
  requestImporterRegistry,
  type RequestExporterContribution
} from '@/core/registries/extensionRegistry'
import { ESCAPE_PRIORITY } from '@/core/shortcuts/escapeStack'
import { useAppStore } from '@/stores/appStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { HttpMethod } from '@/types'
import { getMethodBadgeClass, getMethodTextColor } from '@/utils/methodStyle'

const sessionStore = useSessionStore()
const workspaceStore = useWorkspaceStore()
const appStore = useAppStore()

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']

const activeTab = computed(() => sessionStore.activeTab)
const req = computed(() => sessionStore.activeRequest)

const importers = computed(() => requestImporterRegistry.list())
const exporters = computed(() => requestExporterRegistry.list())

const showImportModal = ref(false)
const showExportDropdown = ref(false)
const exportDropdownRef = ref<HTMLElement | null>(null)
const showMethodDropdown = ref(false)
const methodDropdownRef = ref<HTMLElement | null>(null)
const pathInputRef = ref<HTMLInputElement | null>(null)
const copiedType = ref<string | null>(null)

useVariableInput(pathInputRef, {
  onApplied: nextVal => {
    req.value.path = nextVal
    sessionStore.markCurrentDirty(true)
  }
})

function handlePathEnter(e: KeyboardEvent) {
  if (
    wasVariableAutocompleteEnterHandled(e) ||
    isVariableAutocompleteActiveForElement(e.currentTarget)
  ) {
    return
  }
  void sessionStore.sendActiveRequest()
}

onClickOutside(methodDropdownRef, () => {
  showMethodDropdown.value = false
})

onClickOutside(exportDropdownRef, () => {
  showExportDropdown.value = false
})

useEscapeCancel(
  showMethodDropdown,
  () => {
    showMethodDropdown.value = false
  },
  { priority: ESCAPE_PRIORITY.DROPDOWN }
)

useEscapeCancel(
  showExportDropdown,
  () => {
    showExportDropdown.value = false
  },
  { priority: ESCAPE_PRIORITY.DROPDOWN }
)

const subProjectDisplayName = computed(() => {
  if (!activeTab.value?.subProjectDir) return ''
  const sub = workspaceStore.findSubProject(activeTab.value.subProjectDir)
  return sub ? sub.config.name : activeTab.value.subProjectDir
})

const tabTitle = computed({
  get: () => activeTab.value?.title || '',
  set: (val: string) => {
    sessionStore.handleTabTitleChange(val)
  }
})

const isAbsoluteUrl = computed(() => {
  const p = req.value.path.trim()
  return /^https?:\/\//i.test(p) || p.startsWith('{{')
})

async function selectMethod(m: HttpMethod) {
  req.value.method = m
  showMethodDropdown.value = false
  await sessionStore.autoSaveActiveTab()
}

async function handleTabTitleCommit() {
  if (!activeTab.value) return
  const newName = activeTab.value.title.trim() || '未命名请求'
  if (activeTab.value.title !== newName) {
    sessionStore.handleTabTitleChange(newName)
  }
  await sessionStore.autoSaveActiveTab()
}

async function runExporter(exp: RequestExporterContribution) {
  showExportDropdown.value = false
  try {
    const payload = sessionStore.buildExportPayload()
    const output = exp.exportRequest(payload)
    await navigator.clipboard.writeText(output)
    appStore.showToast(`已复制 (${exp.label}) 到剪贴板`)
  } catch (err: any) {
    appStore.showToast(`导出失败: ${err?.message || err}`, true)
  }
}

async function copyUrlToClipboard(text: string, type: string) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copiedType.value = type
    setTimeout(() => {
      if (copiedType.value === type) {
        copiedType.value = null
      }
    }, 2000)
  } catch (err) {
    console.error('Failed to copy URL to clipboard', err)
  }
}
</script>
