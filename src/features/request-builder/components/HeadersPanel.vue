<template>
  <div class="flex-1 min-h-0 flex flex-col overflow-hidden space-y-2">
    <!-- 顶部二级导航与视图切换 -->
    <div class="flex items-center justify-between shrink-0 select-none pb-0.5">
      <div class="flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/50 text-xs">
        <button
          @click="headersViewMode = 'split'"
          class="px-2.5 py-1 rounded-md transition font-medium flex items-center space-x-1.5"
          :class="headersViewMode === 'split' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          title="上下分栏同屏：专属置顶滚动 + 公共固定吸底"
        >
          <span>分栏同屏</span>
          <span
            v-if="inheritedHeaders.length > 0"
            class="text-[10px] px-1.5 py-0.2 rounded-full font-mono"
            :class="headersViewMode === 'split' ? 'bg-primary/15 text-primary font-semibold' : 'bg-muted text-muted-foreground'"
          >
            {{ resolution.customHeadersCount + inheritedHeaders.length }}
          </span>
        </button>

        <button
          @click="headersViewMode = 'custom'"
          class="px-2.5 py-1 rounded-md transition font-medium flex items-center space-x-1.5"
          :class="headersViewMode === 'custom' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          title="仅展示并编辑当前接口专属 Headers"
        >
          <span>接口专属</span>
          <span
            class="text-[10px] px-1.5 py-0.2 rounded-full font-mono"
            :class="headersViewMode === 'custom' ? 'bg-primary/15 text-primary font-semibold' : 'bg-muted text-muted-foreground'"
          >
            {{ resolution.customHeadersCount }}
          </span>
        </button>

        <button
          v-if="inheritedHeaders.length > 0"
          @click="headersViewMode = 'inherited'"
          class="px-2.5 py-1 rounded-md transition font-medium flex items-center space-x-1.5"
          :class="headersViewMode === 'inherited' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          title="全屏管理主项目与子项目级联继承 Headers"
        >
          <span>公共级联继承</span>
          <span
            class="text-[10px] px-1.5 py-0.2 rounded-full font-mono"
            :class="headersViewMode === 'inherited' ? 'bg-primary/15 text-primary font-semibold' : 'bg-muted text-muted-foreground'"
          >
            {{ inheritedHeaders.length }}
          </span>
          <span v-if="resolution.overriddenHeadersCount > 0" class="w-1.5 h-1.5 rounded-full bg-amber-400" title="有修改覆盖项"></span>
        </button>

        <button
          v-if="inheritedHeaders.length > 0"
          @click="headersViewMode = 'effective'"
          class="px-2.5 py-1 rounded-md transition font-medium flex items-center space-x-1.5"
          :class="headersViewMode === 'effective' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          title="查看发送时最终合并生效的全部 Headers 列表"
        >
          <span>最终生效</span>
          <span
            class="text-[10px] px-1.5 py-0.2 rounded-full font-mono"
            :class="headersViewMode === 'effective' ? 'bg-primary/15 text-primary font-semibold' : 'bg-muted text-muted-foreground'"
          >
            {{ resolution.activeHeadersCount }}
          </span>
        </button>
      </div>

      <div v-if="['split', 'custom'].includes(headersViewMode)" class="flex items-center space-x-1.5 text-xs">
        <button
          @click="headersTextMode = !headersTextMode"
          class="flex items-center space-x-1 px-2 py-1 rounded border border-border bg-card/60 hover:bg-muted/50 text-muted-foreground hover:text-foreground transition text-xs"
          :title="headersTextMode ? '切换为表格模式' : '切换为文本模式'"
        >
          <Code2 v-if="!headersTextMode" class="w-3.5 h-3.5 text-primary" />
          <Table2 v-else class="w-3.5 h-3.5 text-primary" />
          <span>{{ headersTextMode ? '表格模式' : '文本模式' }}</span>
        </button>
      </div>
    </div>

    <!-- 1. 分栏同屏 -->
    <div v-if="headersViewMode === 'split'" class="flex-1 min-h-0 flex flex-col space-y-2 overflow-hidden">
      <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
        <BulkTextEditor
          v-if="headersTextMode"
          :items="sessionStore.activeRequest.headers"
          format="colon"
          @update:items="val => (sessionStore.activeRequest.headers = val)"
        />
        <KeyValueGrid
          v-else
          :items="sessionStore.activeRequest.headers"
          :exclude-keys="resolution.inheritedKeys"
          :fill-height="true"
          :suggest-headers="true"
        />
      </div>

      <div
        v-if="inheritedHeaders.length > 0"
        class="shrink-0 rounded-lg border border-border/70 bg-muted/20 overflow-hidden text-xs shadow-sm"
      >
        <div
          @click="showInheritedHeaders = !showInheritedHeaders"
          class="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-muted/40 transition select-none text-muted-foreground hover:text-foreground bg-card/50"
        >
          <div class="flex items-center space-x-2">
            <ChevronRight
              class="w-3.5 h-3.5 text-muted-foreground/60 transition-transform duration-150"
              :class="showInheritedHeaders ? 'rotate-90' : ''"
            />
            <span class="font-medium text-[11px] text-foreground/90">公共级联继承 Headers</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded-full bg-primary/10 text-primary font-mono font-medium border border-primary/20">
              {{ inheritedHeaders.length }} 个公共项
            </span>
            <span v-if="projectInheritedCount > 0" class="text-[10px] px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground font-mono">
              {{ projectInheritedCount }} 全局
            </span>
            <span v-if="subProjectInheritedCount > 0" class="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-500/10 text-blue-400 font-mono border border-blue-500/20">
              {{ subProjectInheritedCount }} 子项目
            </span>
            <span
              v-if="resolution.overriddenHeadersCount > 0"
              class="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/10 text-amber-400 font-mono font-medium border border-amber-500/20"
            >
              ● {{ resolution.overriddenHeadersCount }} 项已覆盖
            </span>
            <span
              v-if="resolution.disabledInheritedCount > 0"
              class="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500/10 text-rose-400 font-mono font-medium border border-rose-500/20"
            >
              {{ resolution.disabledInheritedCount }} 项已禁用
            </span>
          </div>
          <div class="flex items-center space-x-2 text-[10px]">
            <span class="text-muted-foreground/70">
              {{ showInheritedHeaders ? '收起' : '展开' }}
            </span>
            <button
              @click.stop="headersViewMode = 'inherited'"
              class="text-primary hover:underline font-medium"
              title="全屏进入公共继承管理视图"
            >
              切换查看公共继承 →
            </button>
          </div>
        </div>

        <InheritedHeadersSection v-if="showInheritedHeaders" :compact="true" />
      </div>
    </div>

    <!-- 2. 接口专属 -->
    <div v-else-if="headersViewMode === 'custom'" class="flex-1 min-h-0 flex flex-col space-y-2 overflow-hidden">
      <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
        <BulkTextEditor
          v-if="headersTextMode"
          :items="sessionStore.activeRequest.headers"
          format="colon"
          @update:items="val => (sessionStore.activeRequest.headers = val)"
        />
        <KeyValueGrid
          v-else
          :items="sessionStore.activeRequest.headers"
          :exclude-keys="resolution.inheritedKeys"
          :fill-height="true"
          :suggest-headers="true"
        />
      </div>

      <div
        v-if="inheritedHeaders.length > 0"
        @click="headersViewMode = 'inherited'"
        class="shrink-0 flex items-center justify-between px-3 py-1.5 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/40 transition cursor-pointer text-xs text-muted-foreground select-none"
      >
        <div class="flex items-center space-x-2">
          <span class="text-[11px] font-medium text-foreground/80">公共级联继承:</span>
          <span class="text-[10px] px-1.5 py-0.2 rounded-full bg-primary/10 text-primary font-mono font-medium">
            {{ inheritedHeaders.length }} 个公共项
          </span>
          <span
            v-if="resolution.overriddenHeadersCount > 0"
            class="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/10 text-amber-400 font-mono font-medium border border-amber-500/20"
          >
            {{ resolution.overriddenHeadersCount }} 项已覆盖
          </span>
        </div>
        <span class="text-[10px] text-primary hover:underline">切换查看公共继承 →</span>
      </div>
    </div>

    <!-- 3. 公共级联继承 (全高模式) -->
    <InheritedHeadersSection v-else-if="headersViewMode === 'inherited'" :compact="false" />

    <!-- 4. 最终生效预览 (全高模式) -->
    <EffectiveHeadersPreview v-else />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronRight, Code2, Table2 } from 'lucide-vue-next'
import BulkTextEditor from '@/components/request/BulkTextEditor.vue'
import KeyValueGrid from '@/components/request/KeyValueGrid.vue'
import { useSessionStore } from '@/stores/sessionStore'
import EffectiveHeadersPreview from './EffectiveHeadersPreview.vue'
import InheritedHeadersSection from './InheritedHeadersSection.vue'

const sessionStore = useSessionStore()

const headersViewMode = ref<'split' | 'custom' | 'inherited' | 'effective'>('split')
const headersTextMode = ref(false)
const showInheritedHeaders = ref(false)

const inheritedHeaders = computed(() => sessionStore.inheritedHeaders)
const resolution = computed(() => sessionStore.headerResolution)

const projectInheritedCount = computed(
  () => inheritedHeaders.value.filter(h => h.inheritedFrom === 'project').length
)
const subProjectInheritedCount = computed(
  () => inheritedHeaders.value.filter(h => h.inheritedFrom === 'subproject').length
)
</script>

