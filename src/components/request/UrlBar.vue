<template>
  <div class="flex flex-col space-y-1.5">
    <!-- 接口名称 (直接重命名当前接口) 与 所属子项目/分组 -->
    <div class="flex items-center justify-between pb-0.5 px-0.5">
      <div class="group/title flex items-center space-x-1.5 flex-1 max-w-md">
        <input
          v-model="tabTitle"
          type="text"
          placeholder="未命名请求 (点击输入接口名称)"
          class="text-xs font-semibold bg-transparent hover:bg-muted/40 focus:bg-background px-2 py-0.5 rounded border border-transparent hover:border-border/60 focus:border-primary focus:outline-none transition w-full text-foreground truncate"
          @change="handleTabTitleChange"
          @blur="handleTabTitleChange"
          @keydown.enter="($event.target as HTMLElement).blur()"
          title="点击直接重命名当前接口"
        />
        <Edit3 class="w-3 h-3 text-muted-foreground/40 group-hover/title:text-primary transition shrink-0 pointer-events-none" />
      </div>

      <!-- 右侧：所属子项目与分组选择器 (点击可切换子项目或分组) -->
      <div class="flex items-center space-x-1.5 text-xs shrink-0">
        <button
          @click="tabStore.showSaveModal = true"
          class="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono transition border"
          :class="activeTab?.subProjectDir
            ? 'bg-muted/50 hover:bg-muted text-foreground/90 border-border hover:border-primary/50'
            : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-dashed border-amber-500/40'"
          :title="activeTab?.subProjectDir ? '点击更改所属子项目与分组' : '当前请求尚未关联子项目，点击指定'"
        >
          <Folder class="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span class="max-w-[200px] truncate font-sans font-medium">
            {{ activeTab?.subProjectDir ? `${subProjectDisplayName}${activeTab.group ? ` / ${activeTab.group}` : ''}` : '未关联子项目 (点击指定)' }}
          </span>
          <ChevronDown class="w-3 h-3 opacity-60 shrink-0" />
        </button>

        <!-- 复制当前接口按钮 -->
        <button
          @click="handleDuplicateCurrent"
          class="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-sans font-medium transition border bg-muted/40 hover:bg-muted text-foreground/80 hover:text-foreground border-border hover:border-primary/50"
          title="复制当前接口为新副本 (Duplicate)"
        >
          <Copy class="w-3.5 h-3.5 text-muted-foreground" />
          <span>复制接口</span>
        </button>
      </div>
    </div>

    <div class="flex items-center space-x-2">
      <!-- Method 选择框 -->
      <div class="relative shrink-0">
        <select
          v-model="store.method"
          :class="methodColorClass"
          class="font-mono font-bold text-xs px-3 py-2 rounded-lg border border-border appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary pr-7 transition"
          @change="handleMethodChange"
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
          <option value="PATCH">PATCH</option>
          <option value="HEAD">HEAD</option>
          <option value="OPTIONS">OPTIONS</option>
        </select>
        <ChevronDown class="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
      </div>

      <!-- URL 输入框群组 (BaseURL 拼接展示 + Path 输入) -->
      <div class="flex-1 flex items-center bg-card border border-border rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-primary transition">
        <!-- 分组标记 (若存在) -->
        <div v-if="store.group" class="px-2.5 py-1.5 bg-amber-500/10 text-amber-400 text-xs font-mono border-r border-border flex items-center space-x-1 shrink-0 select-none" :title="`分组: ${store.group}`">
          <Folder class="w-3 h-3 text-amber-400" />
          <span class="max-w-[120px] truncate font-sans font-medium text-[11px]">{{ store.group }}</span>
        </div>

        <!-- 继承的 BaseURL 标签/前缀 (输入绝对地址 https?:// 或 {{...}} 时自动优雅收起) -->
        <div
          v-if="!isAbsoluteUrl"
          class="px-2.5 py-1.5 bg-muted/60 text-muted-foreground text-xs font-mono border-r border-border flex items-center space-x-1.5 shrink-0 select-none transition-all animate-in fade-in duration-150"
        >
          <Globe class="w-3.5 h-3.5 text-primary/80" />
          <span class="max-w-[200px] truncate" :title="store.interpolatedBaseUrl !== store.baseUrl ? `${store.baseUrl} -> ${store.interpolatedBaseUrl}` : (store.baseUrl || '无 BaseURL')">{{ store.interpolatedBaseUrl || store.baseUrl || '无 BaseURL' }}</span>
        </div>

        <!-- 相对路径 Path 或完整绝对 URL 输入 -->
        <input
          v-model="store.path"
          type="text"
          :placeholder="isAbsoluteUrl ? 'https://api.example.com/v1/...' : '/api/v1/resource/{id} (可直接输入完整 https:// 地址)'"
          class="w-full bg-transparent px-3 py-2 text-xs font-mono text-foreground focus:outline-none"
          @input="handlePathInput"
          @change="handlePathChange"
          @blur="handlePathChange"
          @keydown.enter="store.send"
        />
      </div>

      <!-- 发送 / 取消按钮 -->
      <button
        v-if="store.loading"
        @click="store.cancelRequest"
        class="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 font-medium text-xs transition shadow-sm shrink-0 animate-in fade-in"
        title="中途取消此请求"
      >
        <Square class="w-3 h-3 fill-current" />
        <span>Cancel</span>
      </button>

      <button
        v-else
        @click="store.send"
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
          <span class="font-mono text-foreground/90 truncate select-all">{{ store.resolvedUrl }}</span>
        </div>
        <button
          v-if="store.resolvedUrl"
          @click="copyUrlToClipboard(store.resolvedUrl, 'resolved')"
          class="flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/80 transition shrink-0 ml-2 border border-transparent hover:border-border"
          title="复制拼接 URL 到剪贴板"
        >
          <Check v-if="copiedType === 'resolved'" class="w-3 h-3 text-emerald-400" />
          <Copy v-else class="w-3 h-3" />
          <span>{{ copiedType === 'resolved' ? '已复制' : '复制 URL' }}</span>
        </button>
      </div>

      <!-- 当存在环境变量插值时展示最终实际请求 URL 与变量来源徽章 -->
      <div v-if="store.urlVariableTokens.length > 0" class="flex items-center justify-between text-[11px]">
        <div class="flex items-center space-x-2 flex-wrap gap-y-1 flex-1 min-w-0">
          <span class="text-emerald-400/90 font-medium shrink-0">实际发送:</span>
          <span class="font-mono text-emerald-400 font-semibold truncate">{{ store.interpolatedUrl }}</span>

          <!-- 变量来源徽章 -->
          <div class="flex items-center space-x-1 pl-1">
            <span
              v-for="token in store.urlVariableTokens"
              :key="token.key"
              class="text-[10px] px-1.5 py-0.2 rounded font-mono border"
              :class="{
                'bg-purple-500/10 text-purple-400 border-purple-500/20': token.source === 'system',
                'bg-blue-500/10 text-blue-400 border-blue-500/20': token.source === 'subproject',
                'bg-emerald-500/10 text-emerald-400 border-emerald-500/20': token.source === 'project',
                'bg-rose-500/10 text-rose-400 border-rose-500/20': token.source === 'unresolved'
              }"
              :title="token.source === 'system'
                ? `${token.token}: 系统内置动态变量 (发送时实时生成)`
                : token.source === 'subproject'
                ? `${token.token} -> '${token.value}' (来自子项目覆盖)`
                : token.source === 'project'
                ? `${token.token} -> '${token.value}' (来自环境: ${token.environmentName || '当前环境'})`
                : `${token.token}: 未定义变量，将保持原样`"
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
          @click="copyUrlToClipboard(store.interpolatedUrl, 'interpolated')"
          class="flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition shrink-0 ml-2 border border-emerald-500/20"
          title="复制实际发送 URL 到剪贴板"
        >
          <Check v-if="copiedType === 'interpolated'" class="w-3 h-3 text-emerald-400" />
          <Copy v-else class="w-3 h-3" />
          <span>{{ copiedType === 'interpolated' ? '已复制' : '复制' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronDown, Send, Globe, Folder, Edit3, Copy, Check, Square } from 'lucide-vue-next'
import { useRequestStore } from '@/stores/requestStore'
import { useTabStore } from '@/stores/tabStore'
import { useProjectStore } from '@/stores/projectStore'
import type { ApiRequest } from '@/types'

const store = useRequestStore()
const tabStore = useTabStore()
const projectStore = useProjectStore()

const activeTab = computed(() => tabStore.tabs.find(t => t.id === tabStore.activeTabId))

const subProjectDisplayName = computed(() => {
  if (!activeTab.value?.subProjectDir) return ''
  const sub = projectStore.subProjects.find(s => s.dir_name === activeTab.value?.subProjectDir)
  return sub ? sub.config.name : activeTab.value.subProjectDir
})

const tabTitle = computed({
  get: () => activeTab.value?.title || '',
  set: (val: string) => {
    if (activeTab.value) {
      activeTab.value.title = val
      tabStore.markCurrentDirty(true)
    }
  }
})

const isAbsoluteUrl = computed(() => {
  const p = store.path.trim()
  return /^https?:\/\//i.test(p) || p.startsWith('{{')
})

function handlePathInput() {
  if (activeTab.value) {
    tabStore.markCurrentDirty(true)
  }
}

async function handlePathChange() {
  await autoSaveCurrentRequest()
}

async function handleMethodChange() {
  if (activeTab.value) {
    activeTab.value.method = store.method
    tabStore.markCurrentDirty(true)
    await autoSaveCurrentRequest()
  }
}

async function handleTabTitleChange() {
  if (!activeTab.value) return
  const newName = activeTab.value.title.trim() || '未命名请求'
  activeTab.value.title = newName
  await autoSaveCurrentRequest()
}

async function autoSaveCurrentRequest() {
  if (!activeTab.value) return
  tabStore.captureCurrentDraft()

  // 若当前请求已在子项目中保存过文件，自动同步更新到文件和内存列表中
  if (activeTab.value.subProjectDir && activeTab.value.fileName && projectStore.projectPath) {
    const sub = projectStore.subProjects.find(s => s.dir_name === activeTab.value?.subProjectDir)
    const existingReq = sub?.requests.find(r => r.fileName === activeTab.value?.fileName || r.id === activeTab.value?.requestId)
    if (existingReq) {
      existingReq.name = activeTab.value.title || existingReq.name || existingReq.path
      existingReq.method = store.method
      existingReq.path = store.path.trim()
      existingReq.pathParams = JSON.parse(JSON.stringify(store.pathParams))
      existingReq.queryParams = JSON.parse(JSON.stringify(store.queryParams))
      existingReq.headers = JSON.parse(JSON.stringify(store.headers))
      existingReq.bodyType = store.bodyType
      existingReq.bodyContent = store.bodyContent
      existingReq.group = activeTab.value.group || store.group || existingReq.group

      await projectStore.saveRequest(activeTab.value.subProjectDir, activeTab.value.fileName, existingReq)
      activeTab.value.isDirty = false
    }
  }
}

const methodColorClass = computed(() => {
  switch (store.method) {
    case 'GET': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    case 'POST': return 'bg-amber-500/10 text-amber-400 border-amber-500/30'
    case 'PUT': return 'bg-blue-500/10 text-blue-400 border-blue-500/30'
    case 'DELETE': return 'bg-rose-500/10 text-rose-400 border-rose-500/30'
    case 'PATCH': return 'bg-purple-500/10 text-purple-400 border-purple-500/30'
    case 'HEAD': return 'bg-teal-500/10 text-teal-400 border-teal-500/30'
    case 'OPTIONS': return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
    default: return 'bg-muted text-muted-foreground'
  }
})

const copiedType = ref<string | null>(null)

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

// 复制当前接口为新副本
async function handleDuplicateCurrent() {
  if (!activeTab.value) return

  // 1. 若当前 Tab 已归属子项目，基于最新状态创建新副本并保存
  if (activeTab.value.subProjectDir && projectStore.projectPath) {
    const rawReq: ApiRequest = {
      id: activeTab.value.requestId || crypto.randomUUID(),
      name: tabTitle.value || activeTab.value.title || store.path || '未命名请求',
      method: store.method,
      path: store.path,
      pathParams: JSON.parse(JSON.stringify(store.pathParams)),
      queryParams: JSON.parse(JSON.stringify(store.queryParams)),
      headers: JSON.parse(JSON.stringify(store.headers)),
      bodyType: store.bodyType,
      bodyContent: store.bodyContent,
      subProjectId: activeTab.value.subProjectDir,
      fileName: activeTab.value.fileName,
      group: activeTab.value.group || store.group || undefined
    }

    const cloned = await projectStore.duplicateRequest(activeTab.value.subProjectDir, rawReq)
    if (cloned) {
      tabStore.openTab(cloned, activeTab.value.subProjectDir)
    }
  } else {
    // 2. 若尚未保存到子项目，直接在 Tab 栏克隆内存副本
    tabStore.duplicateMemoryTab(activeTab.value.id)
  }
}
</script>

