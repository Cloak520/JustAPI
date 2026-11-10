<template>
  <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
    <!-- 树形结构快捷操作栏 (展开全部 / 折叠全部 / 接口总数) -->
    <div
      v-if="workspaceStore.subProjects.length > 0"
      class="px-3 py-1.5 bg-muted/20 border-b border-border/50 flex items-center justify-between text-[11px] text-muted-foreground shrink-0 select-none"
    >
      <div class="flex items-center space-x-1.5">
        <span class="font-medium text-foreground/80">接口模块</span>
        <span
          class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-medium transition"
          :class="searchQuery.trim() ? 'bg-amber-500/20 text-amber-400' : 'bg-primary/10 text-primary'"
        >
          {{ searchQuery.trim() ? `${matchedRequestsCount} / ${totalRequestsCount}` : `${totalRequestsCount} 个` }}
        </span>
      </div>

      <div class="flex items-center space-x-1">
        <button
          @click="expandAllTree"
          class="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition text-[10px]"
          title="全部展开所有模块与接口分组"
        >
          <UnfoldVertical class="w-3 h-3 text-primary/80" />
          <span>展开全部</span>
        </button>
        <button
          @click="collapseAllTree"
          class="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition text-[10px]"
          title="全部折叠接口分组 (子项目保持展开)"
        >
          <FoldVertical class="w-3 h-3 text-muted-foreground" />
          <span>折叠全部</span>
        </button>
      </div>
    </div>

    <!-- 接口实时搜索过滤栏 (Cmd/Ctrl + F) -->
    <div
      v-if="workspaceStore.subProjects.length > 0"
      class="px-2.5 py-1.5 border-b border-border/50 bg-card/40 shrink-0"
    >
      <div class="relative flex items-center">
        <Search class="w-3.5 h-3.5 text-muted-foreground/60 absolute left-2.5 pointer-events-none" />
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          type="text"
          placeholder="搜索接口名称、路径、Method... (Cmd+F)"
          class="w-full pl-8 pr-7 py-1 text-xs rounded-md bg-muted/50 border border-border/60 focus:bg-background focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition text-foreground placeholder:text-muted-foreground/60 font-sans"
          @keydown.esc="handleSearchEscape($event)"
        />
        <button
          v-if="searchQuery"
          @click="searchQuery = ''"
          class="absolute right-2 p-0.5 text-muted-foreground/60 hover:text-foreground rounded transition"
          title="清空搜索 (Esc)"
        >
          <X class="w-3 h-3" />
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-2 space-y-2">
      <div
        v-if="workspaceStore.subProjects.length === 0"
        class="p-4 text-center text-muted-foreground text-xs space-y-2"
      >
        <div>暂无子项目模块</div>
        <button
          @click="emit('open-import-collection')"
          class="text-xs text-primary underline font-medium"
        >
          导入接口文档
        </button>
      </div>

      <!-- 搜索无结果提示 -->
      <div
        v-else-if="searchQuery.trim() && filteredSubProjects.length === 0"
        class="p-6 text-center text-xs text-muted-foreground space-y-2.5"
      >
        <SearchX class="w-8 h-8 opacity-40 mx-auto text-muted-foreground" />
        <div class="text-foreground/90 font-medium">未找到匹配的接口</div>
        <p class="text-[11px] text-muted-foreground">
          没有接口名称、路径或分组包含 “<span class="text-primary font-mono">{{ searchQuery }}</span>”
        </p>
        <button
          @click="searchQuery = ''"
          class="px-2.5 py-1 rounded bg-muted hover:bg-muted/80 text-foreground text-xs transition"
        >
          清空搜索条件
        </button>
      </div>

      <div
        v-for="sub in filteredSubProjects"
        :key="sub.dirName"
        class="rounded-lg border border-border/80 bg-card/20 overflow-hidden"
      >
        <!-- 子项目头 -->
        <div
          class="flex items-center justify-between p-2 bg-muted/30 cursor-pointer hover:bg-muted/50 transition group"
          @click="toggleSubProject(sub.dirName)"
        >
          <div class="flex items-center space-x-1.5 truncate">
            <ChevronRight
              class="w-3.5 h-3.5 text-muted-foreground transition-transform"
              :class="isSubOpen(sub.dirName) ? 'rotate-90' : ''"
            />
            <span class="font-medium text-foreground truncate">{{ sub.config.name }}</span>
            <span class="text-[10px] text-muted-foreground font-mono">({{ sub.requests.length }})</span>
          </div>

          <!-- 子项目操作 (文档刷新、设置、新增请求、删除) -->
          <div class="flex items-center space-x-1" @click.stop>
            <div v-if="getSyncInfo(sub.config)" class="flex items-center space-x-1">
              <span
                class="text-[9px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono"
                :title="getSyncInfo(sub.config)?.pluginMissing ? `插件 ${getSyncInfo(sub.config)?.importerId} 未激活` : undefined"
              >
                {{ getSyncInfo(sub.config)?.badge }}
              </span>
              <button
                @click="workspaceStore.refreshCollectionWithFeedback(sub.dirName)"
                :disabled="workspaceStore.refreshingCollectionDir === sub.dirName"
                class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                :title="`一键无损刷新 (${getSyncInfo(sub.config)?.source})`"
              >
                <RefreshCw
                  class="w-3 h-3 text-amber-400"
                  :class="workspaceStore.refreshingCollectionDir === sub.dirName ? 'animate-spin' : ''"
                />
              </button>
            </div>

            <button
              @click="openSubProjectSettings(sub.dirName)"
              class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition"
              title="配置子项目 (BaseURL、环境变量覆盖、Headers)"
            >
              <Settings2 class="w-3.5 h-3.5" />
            </button>
            <button
              @click="openNewRequestModal(sub.dirName)"
              class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition"
              title="在子项目下新建请求"
            >
              <Plus class="w-3.5 h-3.5" />
            </button>
            <button
              @click="promptDeleteSubProject(sub.dirName, sub.config.name)"
              class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition"
              title="删除子项目"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <!-- 子项目下的请求列表 -->
        <div v-if="isSubOpen(sub.dirName)" class="pl-2 bg-background/30 text-xs">
          <!-- 1. 存在分组，按目录折叠展示 -->
          <template v-if="getSubProjectGroups(sub.requests).hasGroups">
            <div
              v-for="grp in getSubProjectGroups(sub.requests).groups"
              :key="grp.name"
              class="py-0.5"
            >
              <div
                @click="toggleGroup(sub.dirName, grp.name)"
                class="flex items-center justify-between py-1 px-1.5 rounded cursor-pointer hover:bg-muted/50 transition group/grp text-muted-foreground hover:text-foreground select-none"
              >
                <div class="flex items-center space-x-1.5 truncate">
                  <ChevronRight
                    class="w-3 h-3 text-muted-foreground/60 transition-transform duration-150"
                    :class="isGroupOpen(sub.dirName, grp.name) ? 'rotate-90' : ''"
                  />
                  <Folder class="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
                  <span class="font-medium text-[11px] truncate">{{ grp.name }}</span>
                </div>
                <span class="text-[9px] text-muted-foreground font-mono bg-muted/80 px-1.5 py-0.2 rounded-full">
                  {{ grp.requests.length }}
                </span>
              </div>

              <div
                v-if="isGroupOpen(sub.dirName, grp.name)"
                class="pl-3.5 divide-y divide-border/20 border-l border-border/40 ml-2.5 my-0.5"
              >
                <div
                  v-for="req in grp.requests"
                  :key="req.id || req.fileName"
                  :id="getReqDomId(sub.dirName, req)"
                  @click="sessionStore.openTab(req, sub.dirName)"
                  :class="
                    isReqHighlighted(sub.dirName, req)
                      ? 'bg-primary/20 ring-1 ring-primary/80 font-semibold text-primary rounded-sm shadow-sm'
                      : 'hover:bg-muted/40'
                  "
                  class="flex items-center justify-between py-1.5 pr-2 pl-1 cursor-pointer transition group"
                >
                  <div class="flex items-center space-x-2 truncate">
                    <span class="font-mono font-bold text-[10px]" :class="getMethodTextColor(req.method)">
                      {{ req.method }}
                    </span>
                    <span
                      class="truncate text-[11px] font-medium"
                      :class="req.name.includes('[已下线]') ? 'text-muted-foreground line-through opacity-70' : 'text-foreground/90'"
                      :title="req.name || req.path"
                    >
                      {{ req.name || req.path }}
                    </span>
                  </div>

                  <div class="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition shrink-0" @click.stop>
                    <button
                      @click.stop="duplicateRequest(sub.dirName, req)"
                      class="p-0.5 rounded text-muted-foreground/60 hover:text-foreground transition"
                      title="复制接口 (生成副本)"
                    >
                      <Copy class="w-3 h-3" />
                    </button>
                    <button
                      @click.stop="promptRenameRequest(sub.dirName, req)"
                      class="p-0.5 rounded text-muted-foreground/60 hover:text-primary transition"
                      title="编辑接口 (名称/URL)"
                    >
                      <Edit3 class="w-3 h-3" />
                    </button>
                    <button
                      @click.stop="promptDeleteRequest(sub.dirName, req)"
                      class="p-0.5 rounded text-muted-foreground/60 hover:text-destructive transition"
                      title="删除接口"
                    >
                      <Trash2 class="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 未分组的请求 -->
            <div v-if="getSubProjectGroups(sub.requests).ungrouped.length > 0" class="py-0.5">
              <div
                @click="toggleGroup(sub.dirName, '__other__')"
                class="flex items-center justify-between py-1 px-1.5 rounded cursor-pointer hover:bg-muted/50 transition group/grp text-muted-foreground hover:text-foreground select-none"
              >
                <div class="flex items-center space-x-1.5 truncate">
                  <ChevronRight
                    class="w-3 h-3 text-muted-foreground/60 transition-transform duration-150"
                    :class="isGroupOpen(sub.dirName, '__other__') ? 'rotate-90' : ''"
                  />
                  <Folder class="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                  <span class="font-medium text-[11px] truncate">其他接口</span>
                </div>
                <span class="text-[9px] text-muted-foreground font-mono bg-muted/80 px-1.5 py-0.2 rounded-full">
                  {{ getSubProjectGroups(sub.requests).ungrouped.length }}
                </span>
              </div>

              <div
                v-if="isGroupOpen(sub.dirName, '__other__')"
                class="pl-3.5 divide-y divide-border/20 border-l border-border/40 ml-2.5 my-0.5"
              >
                <div
                  v-for="req in getSubProjectGroups(sub.requests).ungrouped"
                  :key="req.id || req.fileName"
                  :id="getReqDomId(sub.dirName, req)"
                  @click="sessionStore.openTab(req, sub.dirName)"
                  :class="
                    isReqHighlighted(sub.dirName, req)
                      ? 'bg-primary/20 ring-1 ring-primary/80 font-semibold text-primary rounded-sm shadow-sm'
                      : 'hover:bg-muted/40'
                  "
                  class="flex items-center justify-between py-1.5 pr-2 pl-1 cursor-pointer transition group"
                >
                  <div class="flex items-center space-x-2 truncate">
                    <span class="font-mono font-bold text-[10px]" :class="getMethodTextColor(req.method)">
                      {{ req.method }}
                    </span>
                    <span
                      class="truncate text-[11px] font-medium"
                      :class="req.name.includes('[已下线]') ? 'text-muted-foreground line-through opacity-70' : 'text-foreground/90'"
                      :title="req.name || req.path"
                    >
                      {{ req.name || req.path }}
                    </span>
                  </div>

                  <div class="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition shrink-0" @click.stop>
                    <button
                      @click.stop="duplicateRequest(sub.dirName, req)"
                      class="p-0.5 rounded text-muted-foreground/60 hover:text-foreground transition"
                      title="复制接口 (生成副本)"
                    >
                      <Copy class="w-3 h-3" />
                    </button>
                    <button
                      @click.stop="promptRenameRequest(sub.dirName, req)"
                      class="p-0.5 rounded text-muted-foreground/60 hover:text-primary transition"
                      title="编辑接口 (名称/URL)"
                    >
                      <Edit3 class="w-3 h-3" />
                    </button>
                    <button
                      @click.stop="promptDeleteRequest(sub.dirName, req)"
                      class="p-0.5 rounded text-muted-foreground/60 hover:text-destructive transition"
                      title="删除接口"
                    >
                      <Trash2 class="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- 2. 全未分组，经典平铺展示 -->
          <template v-else>
            <div class="divide-y divide-border/40">
              <div
                v-for="req in sub.requests"
                :key="req.id || req.fileName"
                :id="getReqDomId(sub.dirName, req)"
                @click="sessionStore.openTab(req, sub.dirName)"
                :class="
                  isReqHighlighted(sub.dirName, req)
                    ? 'bg-primary/20 ring-1 ring-primary/80 font-semibold text-primary rounded-sm shadow-sm'
                    : 'hover:bg-muted/40'
                "
                class="flex items-center justify-between py-1.5 pr-2 pl-1 cursor-pointer transition group"
              >
                <div class="flex items-center space-x-2 truncate">
                  <span class="font-mono font-bold text-[10px]" :class="getMethodTextColor(req.method)">
                    {{ req.method }}
                  </span>
                  <span
                    class="truncate text-[11px] font-medium"
                    :class="req.name.includes('[已下线]') ? 'text-muted-foreground line-through opacity-70' : 'text-foreground/90'"
                    :title="req.name || req.path"
                  >
                    {{ req.name || req.path }}
                  </span>
                </div>

                <div class="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition shrink-0" @click.stop>
                  <button
                    @click.stop="duplicateRequest(sub.dirName, req)"
                    class="p-0.5 rounded text-muted-foreground/60 hover:text-foreground transition"
                    title="复制接口 (生成副本)"
                  >
                    <Copy class="w-3 h-3" />
                  </button>
                  <button
                    @click.stop="promptRenameRequest(sub.dirName, req)"
                    class="p-0.5 rounded text-muted-foreground/60 hover:text-primary transition"
                    title="编辑接口 (名称/URL)"
                  >
                    <Edit3 class="w-3 h-3" />
                  </button>
                  <button
                    @click.stop="promptDeleteRequest(sub.dirName, req)"
                    class="p-0.5 rounded text-muted-foreground/60 hover:text-destructive transition"
                    title="删除接口"
                  >
                    <Trash2 class="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </template>

          <div
            v-if="sub.requests.length === 0"
            class="py-2 text-center text-[10px] text-muted-foreground/60"
          >
            空模块，点击上方 + 添加请求
          </div>
        </div>
      </div>
    </div>

    <!-- 树级管理模态框 -->
    <SubProjectSettingsModal v-model="showSubSettingsModal" :dir-name="targetSubDirForSettings" />
    <NewRequestModal v-model="showNewRequestModal" :initial-sub-dir="targetSubDirForNewReq" />
    <RenameRequestModal :target="reqToRename" @close="reqToRename = null" />
    <ConfirmDeleteModal :target="itemToDelete" @close="itemToDelete = null" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ChevronRight,
  Copy,
  Edit3,
  FoldVertical,
  Folder,
  Plus,
  RefreshCw,
  Search,
  SearchX,
  Settings2,
  Trash2,
  UnfoldVertical,
  X
} from 'lucide-vue-next'
import SubProjectSettingsModal from '@/components/modals/SubProjectSettingsModal.vue'
import { defaultCommandRegistry } from '@/core/commands/commandRegistry'
import { collectionImporterRegistry } from '@/core/registries/extensionRegistry'
import { defaultEscapeStack, ESCAPE_PRIORITY } from '@/core/shortcuts/escapeStack'
import { useAppStore } from '@/stores/appStore'
import { useSessionStore } from '@/stores/sessionStore'
import { resolveSubProjectSyncSource, useWorkspaceStore } from '@/stores/workspaceStore'
import type { ApiRequest, SubProjectConfig } from '@/types'
import { getMethodTextColor } from '@/utils/methodStyle'
import ConfirmDeleteModal, { type PendingDeleteTarget } from './modals/ConfirmDeleteModal.vue'
import NewRequestModal from './modals/NewRequestModal.vue'
import RenameRequestModal, { type RenameTarget } from './modals/RenameRequestModal.vue'

interface RequestGroup {
  name: string
  requests: ApiRequest[]
}

const props = withDefaults(
  defineProps<{
    active?: boolean
  }>(),
  { active: true }
)

const emit = defineEmits<{
  (e: 'open-import-collection'): void
}>()

function getSyncInfo(config: SubProjectConfig) {
  const sync = resolveSubProjectSyncSource(config)
  if (!sync) return null
  const importer = collectionImporterRegistry.get(sync.importerId)
  const fallbackBadge = sync.importerId === 'justapi.swagger' ? 'Swagger' : sync.importerId
  return {
    importerId: sync.importerId,
    source: sync.source,
    badge: importer?.shortLabel || importer?.label || fallbackBadge,
    pluginMissing: !importer
  }
}

const workspaceStore = useWorkspaceStore()
const sessionStore = useSessionStore()
const appStore = useAppStore()

const openSubprojects = ref<Set<string>>(new Set())
const collapsedGroups = ref<Set<string>>(new Set())
const knownSubDirs = ref<Set<string>>(new Set())
const hasInitializedTree = ref(false)

const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)

function handleSearchEscape(e: KeyboardEvent) {
  if (defaultEscapeStack.hasActive(ESCAPE_PRIORITY.MODAL)) return
  if (searchQuery.value) {
    searchQuery.value = ''
    e.preventDefault()
    e.stopPropagation()
  }
}

// 定位高亮状态
const highlightedReqKey = ref<string | null>(null)
let highlightClearTimer: ReturnType<typeof setTimeout> | null = null

// 模态框状态
const showSubSettingsModal = ref(false)
const targetSubDirForSettings = ref('')
const showNewRequestModal = ref(false)
const targetSubDirForNewReq = ref('')
const reqToRename = ref<RenameTarget | null>(null)
const itemToDelete = ref<PendingDeleteTarget | null>(null)

let unregisterFocusCommand: (() => void) | null = null

onMounted(() => {
  unregisterFocusCommand = defaultCommandRegistry.register({
    id: 'sidebar.focusSearch',
    title: '搜索集合接口',
    shortcut: { key: 'f', mod: true },
    when: () => props.active && workspaceStore.hasProject && appStore.sidebarVisible,
    run: () => {
      searchInputRef.value?.focus()
      searchInputRef.value?.select()
    }
  })
})

onBeforeUnmount(() => {
  unregisterFocusCommand?.()
  if (highlightClearTimer) clearTimeout(highlightClearTimer)
})

function getSubProjectGroups(requests: ApiRequest[]): {
  groups: RequestGroup[]
  ungrouped: ApiRequest[]
  hasGroups: boolean
} {
  const groupMap = new Map<string, ApiRequest[]>()
  const ungrouped: ApiRequest[] = []

  for (const req of requests) {
    if (req.group && req.group.trim()) {
      const gName = req.group.trim()
      if (!groupMap.has(gName)) {
        groupMap.set(gName, [])
      }
      groupMap.get(gName)!.push(req)
    } else {
      ungrouped.push(req)
    }
  }

  const groups: RequestGroup[] = []
  for (const [name, reqs] of groupMap.entries()) {
    groups.push({ name, requests: reqs })
  }

  return {
    groups,
    ungrouped,
    hasGroups: groups.length > 0
  }
}

watch(
  () => workspaceStore.projectPath,
  () => {
    hasInitializedTree.value = false
    openSubprojects.value.clear()
    collapsedGroups.value.clear()
    knownSubDirs.value.clear()
  }
)

watch(
  () => workspaceStore.subProjects.map(s => s.dirName),
  () => {
    const subs = workspaceStore.subProjects
    if (!subs || subs.length === 0) return

    if (!hasInitializedTree.value) {
      for (const sub of subs) {
        openSubprojects.value.add(sub.dirName)
        knownSubDirs.value.add(sub.dirName)

        const { groups, ungrouped } = getSubProjectGroups(sub.requests)
        for (const grp of groups) {
          collapsedGroups.value.add(`${sub.dirName}:${grp.name}`)
        }
        if (ungrouped.length > 0) {
          collapsedGroups.value.add(`${sub.dirName}:__other__`)
        }
      }
      hasInitializedTree.value = true
    } else {
      for (const sub of subs) {
        if (!knownSubDirs.value.has(sub.dirName)) {
          knownSubDirs.value.add(sub.dirName)
          openSubprojects.value.add(sub.dirName)
        }
      }
    }
  },
  { immediate: true }
)

watch(
  () => appStore.revealTarget,
  async target => {
    if (!target) return

    if (searchQuery.value) {
      searchQuery.value = ''
    }

    openSubprojects.value.add(target.subDir)

    const sub = workspaceStore.findSubProject(target.subDir)
    let foundReq: ApiRequest | undefined
    if (sub) {
      foundReq = sub.requests.find(
        r => r.fileName === target.fileName || r.id === target.requestId
      )
      if (foundReq?.group && foundReq.group.trim()) {
        collapsedGroups.value.delete(`${target.subDir}:${foundReq.group.trim()}`)
      } else {
        const { hasGroups } = getSubProjectGroups(sub.requests)
        if (hasGroups) {
          collapsedGroups.value.delete(`${target.subDir}:__other__`)
        }
      }
    }

    const identifier = target.fileName || target.requestId || ''
    highlightedReqKey.value = `${target.subDir}:${identifier}`

    if (highlightClearTimer) clearTimeout(highlightClearTimer)
    highlightClearTimer = setTimeout(() => {
      highlightedReqKey.value = null
    }, 2800)

    await nextTick()
    setTimeout(() => {
      const cleanId = identifier.replace(/[^a-zA-Z0-9_-]/g, '_')
      const el = document.getElementById(`req-item-${target.subDir}-${cleanId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }, 60)

    appStore.showToast(`已在侧边栏定位: ${foundReq?.name || target.fileName || '接口文件'}`)
  }
)

const filteredSubProjects = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) {
    return workspaceStore.subProjects
  }

  return workspaceStore.subProjects
    .map(sub => {
      const matchedRequests = sub.requests.filter(req => {
        const nameMatch = req.name?.toLowerCase().includes(q)
        const pathMatch = req.path?.toLowerCase().includes(q)
        const methodMatch = req.method?.toLowerCase().includes(q)
        const groupMatch = req.group?.toLowerCase().includes(q)
        return Boolean(nameMatch || pathMatch || methodMatch || groupMatch)
      })
      return {
        ...sub,
        requests: matchedRequests
      }
    })
    .filter(sub => sub.requests.length > 0)
})

const totalRequestsCount = computed(() =>
  workspaceStore.subProjects.reduce((sum, s) => sum + s.requests.length, 0)
)

const matchedRequestsCount = computed(() =>
  filteredSubProjects.value.reduce((sum, s) => sum + s.requests.length, 0)
)

function isSubOpen(dir: string) {
  if (searchQuery.value.trim()) return true
  return openSubprojects.value.has(dir)
}

function toggleSubProject(dir: string) {
  if (openSubprojects.value.has(dir)) {
    openSubprojects.value.delete(dir)
  } else {
    openSubprojects.value.add(dir)
  }
}

function isGroupOpen(subDir: string, groupName: string) {
  if (searchQuery.value.trim()) return true
  return !collapsedGroups.value.has(`${subDir}:${groupName}`)
}

function toggleGroup(subDir: string, groupName: string) {
  const key = `${subDir}:${groupName}`
  if (collapsedGroups.value.has(key)) {
    collapsedGroups.value.delete(key)
  } else {
    collapsedGroups.value.add(key)
  }
}

function expandAllTree() {
  for (const sub of workspaceStore.subProjects) {
    openSubprojects.value.add(sub.dirName)
  }
  collapsedGroups.value.clear()
}

function collapseAllTree() {
  for (const sub of workspaceStore.subProjects) {
    const { groups, ungrouped } = getSubProjectGroups(sub.requests)
    for (const grp of groups) {
      collapsedGroups.value.add(`${sub.dirName}:${grp.name}`)
    }
    if (ungrouped.length > 0) {
      collapsedGroups.value.add(`${sub.dirName}:__other__`)
    }
  }
}

function getReqDomId(subDir: string, req: ApiRequest) {
  const identifier = (req.fileName || req.id || '').replace(/[^a-zA-Z0-9_-]/g, '_')
  return `req-item-${subDir}-${identifier}`
}

function isReqHighlighted(subDir: string, req: ApiRequest) {
  if (!highlightedReqKey.value) return false
  return (
    highlightedReqKey.value === `${subDir}:${req.fileName}` ||
    highlightedReqKey.value === `${subDir}:${req.id}`
  )
}

function openSubProjectSettings(dirName: string) {
  targetSubDirForSettings.value = dirName
  showSubSettingsModal.value = true
}

function openNewRequestModal(dirName: string) {
  targetSubDirForNewReq.value = dirName || workspaceStore.subProjects[0]?.dirName || ''
  showNewRequestModal.value = true
}

function promptDeleteRequest(subDir: string, req: ApiRequest) {
  itemToDelete.value = {
    type: 'request',
    subDir,
    fileName: req.fileName || `${req.id}.json`,
    requestId: req.id,
    name: req.name || req.path
  }
}

function promptDeleteSubProject(subDir: string, subName: string) {
  itemToDelete.value = {
    type: 'subproject',
    subDir,
    name: `子项目模块: ${subName} (${subDir})`
  }
}

function promptRenameRequest(subDir: string, req: ApiRequest) {
  reqToRename.value = {
    subDir,
    fileName: req.fileName || `${req.id}.json`,
    req
  }
}

async function duplicateRequest(subDir: string, req: ApiRequest) {
  try {
    const cloned = await workspaceStore.duplicateRequest(subDir, req)
    if (cloned) {
      sessionStore.openTab(cloned, subDir)
      appStore.showToast(`接口已成功复制为: [${cloned.name}]`)
    }
  } catch (err: any) {
    appStore.showToast(`复制接口失败: ${err?.message || err}`, true)
  }
}
</script>
