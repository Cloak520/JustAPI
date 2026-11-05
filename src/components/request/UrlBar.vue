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

      <!-- 右侧：所属子项目与分组提示 -->
      <div v-if="activeTab?.subProjectDir" class="flex items-center space-x-1.5 text-[11px] text-muted-foreground font-mono">
        <Folder class="w-3 h-3 text-muted-foreground/60" />
        <span>{{ activeTab.subProjectDir }}{{ activeTab.group ? ` / ${activeTab.group}` : '' }}</span>
      </div>
    </div>

    <div class="flex items-center space-x-2">
      <!-- Method 选择框 -->
      <div class="relative shrink-0">
        <select
          v-model="store.method"
          :class="methodColorClass"
          class="font-mono font-bold text-xs px-3 py-2 rounded-lg border border-border appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary pr-7 transition"
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

        <!-- 继承的 BaseURL 标签/前缀 -->
        <div class="px-2.5 py-1.5 bg-muted/60 text-muted-foreground text-xs font-mono border-r border-border flex items-center space-x-1.5 shrink-0 select-none">
          <Globe class="w-3.5 h-3.5 text-primary/80" />
          <span class="max-w-[200px] truncate" :title="store.interpolatedBaseUrl !== store.baseUrl ? `${store.baseUrl} -> ${store.interpolatedBaseUrl}` : (store.baseUrl || '无 BaseURL')">{{ store.interpolatedBaseUrl || store.baseUrl || '无 BaseURL' }}</span>
        </div>

        <!-- 相对路径 Path 输入 -->
        <input
          v-model="store.path"
          type="text"
          placeholder="/api/v1/resource/{id}"
          class="w-full bg-transparent px-3 py-2 text-xs font-mono text-foreground focus:outline-none"
          @keydown.enter="store.send"
        />
      </div>

      <!-- 发送按钮 -->
      <button
        @click="store.send"
        :disabled="store.loading"
        class="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-xs hover:bg-primary/90 transition shadow-sm disabled:opacity-50 shrink-0"
        title="快捷键: Cmd/Ctrl + Enter"
      >
        <Loader2 v-if="store.loading" class="w-3.5 h-3.5 animate-spin" />
        <Send v-else class="w-3.5 h-3.5" />
        <span>{{ store.loading ? '请求中...' : 'Send' }}</span>
      </button>
    </div>

    <!-- 实时拼接完整 URL 与插值预览 -->
    <div class="flex flex-col space-y-1 px-1">
      <div class="flex items-center space-x-2 text-[11px] text-muted-foreground truncate">
        <span class="text-muted-foreground/70 shrink-0">拼接预览:</span>
        <span class="font-mono text-foreground/90 truncate">{{ store.resolvedUrl }}</span>
      </div>

      <!-- 当存在环境变量插值时展示最终实际请求 URL 与变量来源徽章 -->
      <div v-if="store.urlVariableTokens.length > 0" class="flex items-center space-x-2 text-[11px] flex-wrap gap-y-1">
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown, Send, Loader2, Globe, Folder, Edit3 } from 'lucide-vue-next'
import { useRequestStore } from '@/stores/requestStore'
import { useTabStore } from '@/stores/tabStore'
import { useProjectStore } from '@/stores/projectStore'
import { onKeyStroke } from '@vueuse/core'

const store = useRequestStore()
const tabStore = useTabStore()
const projectStore = useProjectStore()

const activeTab = computed(() => tabStore.tabs.find(t => t.id === tabStore.activeTabId))

const tabTitle = computed({
  get: () => activeTab.value?.title || '',
  set: (val: string) => {
    if (activeTab.value) {
      activeTab.value.title = val
      tabStore.markCurrentDirty(true)
    }
  }
})

async function handleTabTitleChange() {
  if (!activeTab.value) return
  const newName = activeTab.value.title.trim() || '未命名请求'
  activeTab.value.title = newName

  // 若当前请求已在子项目中保存过文件，自动同步更新到文件和内存列表中
  if (activeTab.value.subProjectDir && activeTab.value.fileName && projectStore.projectPath) {
    const sub = projectStore.subProjects.find(s => s.dir_name === activeTab.value?.subProjectDir)
    const existingReq = sub?.requests.find(r => r.fileName === activeTab.value?.fileName || r.id === activeTab.value?.requestId)
    if (existingReq) {
      existingReq.name = newName
      await projectStore.saveRequest(activeTab.value.subProjectDir, activeTab.value.fileName, existingReq)
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
    default: return 'bg-muted text-muted-foreground'
  }
})

// 快捷键 Cmd/Ctrl + Enter 发送请求
onKeyStroke('Enter', (e) => {
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault()
    store.send()
  }
})
</script>

