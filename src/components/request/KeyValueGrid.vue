<template>
  <div class="flex flex-col border border-border rounded-lg overflow-hidden bg-card/40 text-xs" :class="fillHeight ? 'h-full flex-1 min-h-0' : ''">
    <!-- 表头 -->
    <div class="grid grid-cols-[36px_1fr_1fr_120px_36px] bg-muted/40 border-b border-border font-medium text-muted-foreground px-2 py-1.5 select-none shrink-0">
      <div class="flex items-center justify-center">
        <input
          type="checkbox"
          :checked="allEnabled"
          @change="toggleAll"
          class="rounded border-border text-primary focus:ring-0 cursor-pointer"
        />
      </div>
      <div class="px-2">Key</div>
      <div class="px-2">Value</div>
      <div class="px-2">Description</div>
      <div></div>
    </div>

    <!-- 表格行列表 -->
    <div class="divide-y divide-border/60 overflow-y-auto" :class="fillHeight ? 'flex-1 min-h-0' : 'max-h-64'">
      <div
        v-for="item in displayedItems"
        :key="item.id"
        class="grid grid-cols-[36px_1fr_1fr_120px_36px] items-center px-2 py-1 hover:bg-muted/20 group transition"
      >
        <!-- 启用/禁用复选框 -->
        <div class="flex items-center justify-center">
          <input
            type="checkbox"
            v-model="item.enabled"
            class="rounded border-border text-primary focus:ring-0 cursor-pointer"
          />
        </div>

        <!-- Key 输入 (使用智能补全组件，选定选项后自动立即关闭浮层，并跳转聚焦至 Value) -->
        <div class="px-1 flex items-center space-x-1">
          <AutocompleteInput
            :id="'key-input-' + item.id"
            v-model="item.key"
            placeholder="Key"
            :suggestions="suggestHeaders ? COMMON_HEADER_SUGGESTIONS : []"
            :auto-focus-next-id="'val-input-' + item.id"
            input-class="w-full bg-transparent px-1.5 py-1 font-mono text-foreground focus:outline-none placeholder:text-muted-foreground/40"
            @input="checkAutoAppend(item)"
            @select="onKeySelected(item)"
          />
          <span
            v-if="overridesInheritedKey(item.key)"
            class="shrink-0 text-[9px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-sans font-medium"
            title="此 Header 与公共继承 Header 同名，在发送时将覆盖公共默认值"
          >
            覆盖继承
          </span>
          <span
            v-else-if="item.inheritedFrom"
            class="shrink-0 text-[10px] px-1 py-0.2 rounded bg-primary/10 text-primary border border-primary/20"
          >
            {{ item.inheritedFrom === 'project' ? '全局' : '子项目' }}
          </span>
        </div>

        <!-- Value 输入 (支持根据 Key 智能推荐 Value，如 application/json 等) -->
        <div class="px-1">
          <AutocompleteInput
            :id="'val-input-' + item.id"
            v-model="item.value"
            placeholder="Value"
            :suggestions="suggestHeaders ? getHeaderValueSuggestions(item.key) : []"
            input-class="w-full bg-transparent px-1.5 py-1 font-mono text-foreground focus:outline-none placeholder:text-muted-foreground/40"
            @input="checkAutoAppend(item)"
            @select="checkAutoAppend(item)"
          />
        </div>

        <!-- Description 输入 -->
        <div class="px-1">
          <input
            v-model="item.description"
            type="text"
            placeholder="说明"
            class="w-full bg-transparent px-1.5 py-1 text-muted-foreground focus:outline-none placeholder:text-muted-foreground/40 text-[11px]"
          />
        </div>

        <!-- 删除按钮 -->
        <div class="flex items-center justify-center">
          <button
            @click="removeItem(item)"
            class="text-muted-foreground/50 hover:text-destructive opacity-0 group-hover:opacity-100 transition p-1"
            title="删除此行"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- 空白占位提议 -->
      <div v-if="displayedItems.length === 0" class="py-4 text-center text-xs text-muted-foreground/60">
        暂无参数，请在下方点击新增或直接输入
      </div>
    </div>

    <!-- 底部操作栏 -->
    <div class="flex items-center justify-between p-2 border-t border-border/80 bg-muted/20 shrink-0">
      <button
        @click="addItem"
        class="flex items-center space-x-1 text-[11px] text-primary hover:underline font-medium px-1"
      >
        <Plus class="w-3.5 h-3.5" />
        <span>添加一行</span>
      </button>

      <span class="text-[11px] text-muted-foreground/60 pr-2">
        共 {{ displayedItems.length }} 项（{{ activeCount }} 项启用）
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'
import AutocompleteInput from '@/components/common/AutocompleteInput.vue'
import {
  COMMON_HEADER_SUGGESTIONS,
  getHeaderValueSuggestions
} from '@/utils/headers'
import type { KeyValuePair } from '@/types'

const props = withDefaults(defineProps<{
  items: KeyValuePair[]
  excludeKeys?: string[]
  fillHeight?: boolean
  suggestHeaders?: boolean
}>(), {
  excludeKeys: () => [],
  fillHeight: false,
  suggestHeaders: false
})

const displayedItems = computed(() => {
  if (!props.excludeKeys || props.excludeKeys.length === 0) {
    return props.items
  }
  const set = new Set(props.excludeKeys.map(k => k.trim().toLowerCase()))
  return props.items.filter(i => {
    // 若显式标记为公共继承覆盖项，则在专属列表中排除（由公共继承面板统一管理）
    if (i.isInheritedOverride === true) return false
    // 若显式标记为非继承覆盖（即用户在当前专属表格中新增），则始终展示
    if (i.isInheritedOverride === false) return true
    // 兼容历史未标记数据：若属于继承 key，则按排除处理
    return !set.has(i.key.trim().toLowerCase())
  })
})

function overridesInheritedKey(key: string): boolean {
  if (!key || !props.excludeKeys || props.excludeKeys.length === 0) return false
  return props.excludeKeys.includes(key.trim().toLowerCase())
}

const activeCount = computed(() => displayedItems.value.filter(i => i.enabled && i.key.trim()).length)

const allEnabled = computed(() => {
  return displayedItems.value.length > 0 && displayedItems.value.every(i => i.enabled)
})

function toggleAll(e: Event) {
  const target = e.target as HTMLInputElement
  displayedItems.value.forEach(i => (i.enabled = target.checked))
}

function addItem() {
  props.items.push({
    id: crypto.randomUUID(),
    key: '',
    value: '',
    enabled: true,
    isInheritedOverride: false
  })
}

function removeItem(item: KeyValuePair) {
  const idx = props.items.findIndex(i => i.id === item.id)
  if (idx !== -1) {
    props.items.splice(idx, 1)
  }
  if (displayedItems.value.length === 0) {
    addItem()
  }
}

function checkAutoAppend(item: KeyValuePair) {
  const list = displayedItems.value
  if (list.length > 0 && list[list.length - 1].id === item.id) {
    if (item.key.trim() || item.value.trim()) {
      addItem()
    }
  }
}

function onKeySelected(item: KeyValuePair) {
  checkAutoAppend(item)
}
</script>
