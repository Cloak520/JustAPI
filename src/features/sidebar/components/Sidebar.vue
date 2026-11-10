<template>
  <aside class="flex flex-col h-full bg-card/30 border-r border-border select-none text-xs relative">
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
    <div v-show="sidebarView === 'collections'" class="flex-1 flex flex-col overflow-hidden">
      <!-- 项目根信息与操作栏 -->
      <div class="p-3 border-b border-border bg-card/40 flex items-center justify-between shrink-0">
        <div class="flex-1 truncate mr-2">
          <div class="font-semibold text-foreground truncate" :title="workspaceStore.projectConfig?.name || '未打开项目'">
            {{ workspaceStore.projectConfig?.name || '无本地项目' }}
          </div>
          <div class="text-[10px] text-muted-foreground truncate font-mono" :title="workspaceStore.projectPath || ''">
            {{ workspaceStore.projectPath || '请选择一个本地目录' }}
          </div>
        </div>

        <div class="flex items-center space-x-1 shrink-0">
          <button
            @click="workspaceStore.pickAndOpenProject"
            class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
            title="打开本地项目目录"
          >
            <FolderOpen class="w-4 h-4 text-primary" />
          </button>
          <button
            v-if="workspaceStore.hasProject"
            @click="showImportModal = true"
            class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
            title="导入接口文档 / 集合 (Swagger / OpenAPI 等插件)"
          >
            <FileDown class="w-4 h-4 text-amber-400" />
          </button>
          <button
            v-if="workspaceStore.hasProject"
            @click="showNewSubprojectModal = true"
            class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
            title="新建子项目模块"
          >
            <FolderPlus class="w-4 h-4 text-emerald-400" />
          </button>
          <button
            v-if="workspaceStore.hasProject"
            @click="showProjectSettingsModal = true"
            class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
            title="主项目全局配置 (BaseURL、名称等)"
          >
            <FolderCog class="w-4 h-4 text-primary/80" />
          </button>
        </div>
      </div>

      <!-- 未打开项目时的欢迎引导与最近项目 -->
      <div v-if="!workspaceStore.hasProject" class="flex-1 flex flex-col p-4 space-y-4 overflow-y-auto">
        <div class="p-4 rounded-xl border border-dashed border-border text-center space-y-3 bg-card/20">
          <FolderCode class="w-8 h-8 text-primary/60 mx-auto" />
          <div class="space-y-1">
            <h4 class="font-medium text-foreground text-xs">目录即项目 (Folder-as-Project)</h4>
            <p class="text-[11px] text-muted-foreground leading-relaxed">
              选择本地代码仓库的任意目录，所有接口单文件保存，天然支持 Git 协同。
            </p>
          </div>
          <button
            @click="workspaceStore.pickAndOpenProject"
            class="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium text-xs hover:bg-primary/90 transition shadow-sm w-full"
          >
            打开或新建目录
          </button>
        </div>

        <div v-if="workspaceStore.recentProjects.length > 0" class="space-y-2">
          <div class="text-[11px] font-medium text-muted-foreground px-1">最近打开的项目</div>
          <div class="space-y-1">
            <div
              v-for="rec in workspaceStore.recentProjects"
              :key="rec.path"
              @click="workspaceStore.loadProject(rec.path)"
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

      <!-- 已打开项目：子项目与请求集合树 -->
      <CollectionTree
        v-else
        :active="sidebarView === 'collections'"
        @open-import-collection="showImportModal = true"
      />
    </div>

    <!-- 2. 历史记录视图 -->
    <HistoryPanel v-show="sidebarView === 'history'" />

    <!-- 工作区级别模态框 -->
    <ImportCollectionModal v-model="showImportModal" />
    <NewSubprojectModal v-model="showNewSubprojectModal" />
    <ProjectSettingsModal
      v-model="showProjectSettingsModal"
      @saved="appStore.showToast('主项目配置已保存至 project.json')"
    />
  </aside>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  FileDown,
  FolderCode,
  FolderCog,
  FolderOpen,
  FolderPlus,
  FolderTree,
  History
} from 'lucide-vue-next'
import ProjectSettingsModal from '@/components/modals/ProjectSettingsModal.vue'
import { useAppStore } from '@/stores/appStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import CollectionTree from './CollectionTree.vue'
import HistoryPanel from './HistoryPanel.vue'
import ImportCollectionModal from './modals/ImportCollectionModal.vue'
import NewSubprojectModal from './modals/NewSubprojectModal.vue'

const workspaceStore = useWorkspaceStore()
const appStore = useAppStore()

const sidebarView = ref<'collections' | 'history'>('collections')
const showImportModal = ref(false)
const showNewSubprojectModal = ref(false)
const showProjectSettingsModal = ref(false)

watch(
  () => appStore.revealTarget,
  target => {
    if (target) {
      sidebarView.value = 'collections'
    }
  }
)
</script>

