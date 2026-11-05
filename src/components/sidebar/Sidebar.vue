<template>
  <aside class="flex flex-col h-full bg-card/30 border-r border-border select-none text-xs">
    <!-- 侧边栏模式切换 (Collections / History) -->
    <div class="flex items-center border-b border-border p-1 bg-muted/20 shrink-0">
      <button
        @click="sidebarView = 'collections'"
        :class="sidebarView === 'collections' ? 'bg-card text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'"
        class="flex-1 py-1 px-2 rounded text-[11px] flex items-center justify-center space-x-1 transition"
      >
        <FolderTree class="w-3.5 h-3.5 text-primary" />
        <span>集合与子项目</span>
      </button>
      <button
        @click="sidebarView = 'history'"
        :class="sidebarView === 'history' ? 'bg-card text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'"
        class="flex-1 py-1 px-2 rounded text-[11px] flex items-center justify-center space-x-1 transition"
      >
        <History class="w-3.5 h-3.5 text-primary" />
        <span>历史记录</span>
      </button>
    </div>

    <!-- 1. 集合与子项目树形视图 -->
    <div v-if="sidebarView === 'collections'" class="flex-1 flex flex-col overflow-hidden">
      <!-- 项目根信息与操作栏 -->
      <div class="p-3 border-b border-border bg-card/40 flex items-center justify-between shrink-0">
        <div class="flex-1 truncate mr-2">
          <div class="font-semibold text-foreground truncate" :title="projectStore.projectConfig?.name || '未打开项目'">
            {{ projectStore.projectConfig?.name || '无本地项目' }}
          </div>
          <div class="text-[10px] text-muted-foreground truncate font-mono" :title="projectStore.projectPath || ''">
            {{ projectStore.projectPath || '请选择一个本地目录' }}
          </div>
        </div>

        <div class="flex items-center space-x-1 shrink-0">
          <button
            @click="projectStore.pickAndOpenProject"
            class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
            title="打开本地项目目录"
          >
            <FolderOpen class="w-4 h-4 text-primary" />
          </button>
          <button
            v-if="projectStore.hasProject"
            @click="showNewSubprojectModal = true"
            class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
            title="新建子项目模块"
          >
            <FolderPlus class="w-4 h-4 text-emerald-400" />
          </button>
        </div>
      </div>

      <!-- 未打开项目时的欢迎引导与最近项目 -->
      <div v-if="!projectStore.hasProject" class="flex-1 flex flex-col p-4 space-y-4 overflow-y-auto">
        <div class="p-4 rounded-xl border border-dashed border-border text-center space-y-3 bg-card/20">
          <FolderCode class="w-8 h-8 text-primary/60 mx-auto" />
          <div class="space-y-1">
            <h4 class="font-medium text-foreground text-xs">目录即项目 (Folder-as-Project)</h4>
            <p class="text-[11px] text-muted-foreground leading-relaxed">
              选择本地代码仓库的任意目录，所有接口单文件保存，天然支持 Git 协同。
            </p>
          </div>
          <button
            @click="projectStore.pickAndOpenProject"
            class="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium text-xs hover:bg-primary/90 transition shadow-sm w-full"
          >
            打开或新建目录
          </button>
        </div>

        <!-- 最近打开的项目列表 -->
        <div v-if="projectStore.recentProjects.length > 0" class="space-y-2">
          <div class="text-[11px] font-medium text-muted-foreground px-1">最近打开的项目</div>
          <div class="space-y-1">
            <div
              v-for="rec in projectStore.recentProjects"
              :key="rec.path"
              @click="projectStore.loadProject(rec.path)"
              class="p-2 rounded-lg border border-border bg-card/40 hover:bg-muted/50 cursor-pointer transition group"
            >
              <div class="font-medium text-foreground text-xs truncate group-hover:text-primary">
                {{ rec.name }}
              </div>
              <div class="text-[10px] text-muted-foreground truncate font-mono">
                {{ rec.path }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 已打开项目：子项目与请求树 -->
      <div v-else class="flex-1 overflow-y-auto p-2 space-y-2">
        <div v-if="projectStore.subProjects.length === 0" class="p-4 text-center text-muted-foreground text-xs">
          暂无子项目，点击右上角「+」创建第一个模块
        </div>

        <div
          v-for="sub in projectStore.subProjects"
          :key="sub.dir_name"
          class="rounded-lg border border-border/80 bg-card/20 overflow-hidden"
        >
          <!-- 子项目头 -->
          <div
            class="flex items-center justify-between p-2 bg-muted/30 cursor-pointer hover:bg-muted/50 transition group"
            @click="toggleSubProject(sub.dir_name)"
          >
            <div class="flex items-center space-x-1.5 truncate">
              <ChevronRight
                class="w-3.5 h-3.5 text-muted-foreground transition-transform"
                :class="isSubOpen(sub.dir_name) ? 'rotate-90' : ''"
              />
              <span class="font-medium text-foreground truncate">{{ sub.config.name }}</span>
              <span class="text-[10px] text-muted-foreground font-mono">({{ sub.requests.length }})</span>
            </div>

            <!-- 子项目操作 (新增请求、删除) -->
            <div class="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition" @click.stop>
              <button
                @click="openNewRequestModal(sub.dir_name)"
                class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title="在子项目下新建请求"
              >
                <Plus class="w-3.5 h-3.5" />
              </button>
              <button
                @click="deleteSubProject(sub.dir_name)"
                class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                title="删除子项目"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <!-- 子项目下的请求列表 -->
          <div v-if="isSubOpen(sub.dir_name)" class="divide-y divide-border/40 pl-4 bg-background/30">
            <div
              v-for="req in sub.requests"
              :key="req.id || req.fileName"
              @click="tabStore.openTab(req, sub.dir_name)"
              class="flex items-center justify-between py-1.5 pr-2 pl-1 cursor-pointer hover:bg-muted/40 transition group"
            >
              <div class="flex items-center space-x-2 truncate">
                <span class="font-mono font-bold text-[10px]" :class="getMethodColor(req.method)">
                  {{ req.method }}
                </span>
                <span class="truncate text-[11px] text-foreground/90 font-medium" :title="req.name || req.path">
                  {{ req.name || req.path }}
                </span>
              </div>

              <button
                @click.stop="deleteRequest(sub.dir_name, req.fileName!)"
                class="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground/50 hover:text-destructive transition"
                title="删除请求"
              >
                <Trash2 class="w-3 h-3" />
              </button>
            </div>

            <div v-if="sub.requests.length === 0" class="py-2 text-center text-[10px] text-muted-foreground/60">
              空模块，点击上方 + 添加请求
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. 历史记录视图 -->
    <div v-else class="flex-1 flex flex-col overflow-hidden">
      <div class="p-2 border-b border-border flex items-center justify-between shrink-0 bg-muted/20">
        <span class="text-[11px] font-medium text-muted-foreground">最近执行历史 (上限 200)</span>
        <button
          @click="projectStore.clearHistory"
          class="text-[10px] text-muted-foreground hover:text-destructive transition"
        >
          清空
        </button>
      </div>

      <div class="flex-1 overflow-y-auto divide-y divide-border/60">
        <div
          v-for="h in projectStore.history"
          :key="h.id"
          class="p-2.5 hover:bg-muted/30 cursor-pointer transition space-y-1"
          @click="loadHistoryToEditor(h)"
        >
          <div class="flex items-center justify-between">
            <span class="font-mono font-bold text-[10px]" :class="getMethodColor(h.method as any)">
              {{ h.method }}
            </span>
            <span class="font-mono text-[10px]" :class="h.status >= 200 && h.status < 300 ? 'text-emerald-400' : 'text-rose-400'">
              {{ h.status }} ({{ h.durationMs }}ms)
            </span>
          </div>
          <div class="text-[11px] text-foreground font-mono truncate" :title="h.url">
            {{ h.url }}
          </div>
          <div class="text-[10px] text-muted-foreground/60">
            {{ new Date(h.timestamp).toLocaleTimeString() }}
          </div>
        </div>

        <div v-if="projectStore.history.length === 0" class="py-6 text-center text-xs text-muted-foreground/60">
          暂无请求历史
        </div>
      </div>
    </div>

    <!-- 弹窗：新建子项目 -->
    <div
      v-if="showNewSubprojectModal"
      class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div class="bg-card border border-border rounded-xl p-5 w-full max-w-sm space-y-4 shadow-xl">
        <h3 class="font-semibold text-sm">新建子项目模块</h3>
        <div class="space-y-3 text-xs">
          <div>
            <label class="text-muted-foreground block mb-1">模块名称 (如 用户中心 / Auth)</label>
            <input
              v-model="newSubName"
              type="text"
              placeholder="Auth Service"
              class="w-full p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label class="text-muted-foreground block mb-1">文件夹名 (英文小写)</label>
            <input
              v-model="newSubDir"
              type="text"
              placeholder="auth_service"
              class="w-full p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary font-mono"
            />
          </div>
          <div>
            <label class="text-muted-foreground block mb-1">模块 BaseURL / 路径前缀 (可选)</label>
            <input
              v-model="newSubBase"
              type="text"
              placeholder="/auth 或 https://auth.api.com"
              class="w-full p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary font-mono"
            />
          </div>
        </div>

        <div class="flex justify-end space-x-2 pt-2">
          <button
            @click="showNewSubprojectModal = false"
            class="px-3 py-1.5 rounded text-xs text-muted-foreground hover:bg-muted"
          >
            取消
          </button>
          <button
            @click="confirmCreateSubproject"
            class="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground font-medium hover:bg-primary/90"
          >
            创建
          </button>
        </div>
      </div>
    </div>

    <!-- 弹窗：新建请求 -->
    <div
      v-if="showNewRequestModal"
      class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div class="bg-card border border-border rounded-xl p-5 w-full max-w-sm space-y-4 shadow-xl">
        <h3 class="font-semibold text-sm">新建请求到子项目</h3>
        <div class="space-y-3 text-xs">
          <div>
            <label class="text-muted-foreground block mb-1">请求名称</label>
            <input
              v-model="newReqName"
              type="text"
              placeholder="获取用户资料"
              class="w-full p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label class="text-muted-foreground block mb-1">相对路径</label>
            <input
              v-model="newReqPath"
              type="text"
              placeholder="/users/{id}"
              class="w-full p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary font-mono"
            />
          </div>
          <div>
            <label class="text-muted-foreground block mb-1">请求方法</label>
            <select
              v-model="newReqMethod"
              class="w-full p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary font-mono"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
              <option value="PATCH">PATCH</option>
            </select>
          </div>
        </div>

        <div class="flex justify-end space-x-2 pt-2">
          <button
            @click="showNewRequestModal = false"
            class="px-3 py-1.5 rounded text-xs text-muted-foreground hover:bg-muted"
          >
            取消
          </button>
          <button
            @click="confirmCreateRequest"
            class="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground font-medium hover:bg-primary/90"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { FolderTree, History, FolderOpen, FolderPlus, Plus, Trash2, ChevronRight, FolderCode } from 'lucide-vue-next'
import { useProjectStore } from '@/stores/projectStore'
import { useTabStore } from '@/stores/tabStore'
import { useRequestStore } from '@/stores/requestStore'
import type { HttpMethod, HistoryItem, ApiRequest } from '@/types'

const projectStore = useProjectStore()
const tabStore = useTabStore()
const requestStore = useRequestStore()

const sidebarView = ref<'collections' | 'history'>('collections')
const openSubprojects = ref<Set<string>>(new Set())

// 新建子项目弹窗状态
const showNewSubprojectModal = ref(false)
const newSubName = ref('')
const newSubDir = ref('')
const newSubBase = ref('')

// 新建请求弹窗状态
const showNewRequestModal = ref(false)
const targetSubDir = ref('')
const newReqName = ref('')
const newReqPath = ref('/api/v1/resource')
const newReqMethod = ref<HttpMethod>('GET')

function isSubOpen(dir: string) {
  return openSubprojects.value.has(dir)
}

function toggleSubProject(dir: string) {
  if (openSubprojects.value.has(dir)) {
    openSubprojects.value.delete(dir)
  } else {
    openSubprojects.value.add(dir)
  }
}

function openNewRequestModal(dir: string) {
  targetSubDir.value = dir
  newReqName.value = '新请求'
  newReqPath.value = '/get'
  newReqMethod.value = 'GET'
  showNewRequestModal.value = true
}

async function confirmCreateSubproject() {
  if (!newSubDir.value.trim()) return
  await projectStore.createSubProject(newSubName.value, newSubDir.value, newSubBase.value)
  openSubprojects.value.add(newSubDir.value.trim())
  showNewSubprojectModal.value = false
  newSubName.value = ''
  newSubDir.value = ''
  newSubBase.value = ''
}

async function confirmCreateRequest() {
  if (!targetSubDir.value) return
  const reqId = crypto.randomUUID()
  const fileName = `${newReqName.value.trim().replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_') || 'req'}_${Date.now().toString().slice(-4)}`

  const newReq: ApiRequest = {
    id: reqId,
    name: newReqName.value.trim() || '未命名请求',
    method: newReqMethod.value,
    path: newReqPath.value.trim() || '/get',
    pathParams: [],
    queryParams: [],
    headers: [],
    bodyType: 'none',
    bodyContent: '',
    subProjectId: targetSubDir.value,
    fileName: `${fileName}.json`
  }

  await projectStore.saveRequest(targetSubDir.value, fileName, newReq)
  showNewRequestModal.value = false
  tabStore.openTab(newReq, targetSubDir.value)
}

async function deleteSubProject(dir: string) {
  if (confirm(`确定删除子项目 [${dir}] 及其所有接口吗？此操作无法撤销。`)) {
    await projectStore.deleteSubProject(dir)
  }
}

async function deleteRequest(subDir: string, fileName: string) {
  if (confirm(`确定删除接口文件 [${fileName}] 吗？`)) {
    await projectStore.deleteRequest(subDir, fileName)
  }
}

function loadHistoryToEditor(item: HistoryItem) {
  requestStore.method = item.method as HttpMethod
  requestStore.path = item.url
  requestStore.send()
}

function getMethodColor(method: HttpMethod) {
  switch (method) {
    case 'GET': return 'text-emerald-400'
    case 'POST': return 'text-amber-400'
    case 'PUT': return 'text-blue-400'
    case 'DELETE': return 'text-rose-400'
    case 'PATCH': return 'text-purple-400'
    default: return 'text-muted-foreground'
  }
}
</script>

