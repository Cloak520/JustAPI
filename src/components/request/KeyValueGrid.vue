<template>
  <div class="flex flex-col border border-border rounded-lg overflow-hidden bg-card/40 text-xs">
    <!-- 表头 -->
    <div class="grid grid-cols-[36px_1fr_1fr_120px_36px] bg-muted/40 border-b border-border font-medium text-muted-foreground px-2 py-1.5 select-none">
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
    <div class="divide-y divide-border/60 max-h-64 overflow-y-auto">
      <div
        v-for="(item, index) in items"
        :key="item.id || index"
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

        <!-- Key 输入 -->
        <div class="px-1 flex items-center space-x-1">
          <input
            v-model="item.key"
            type="text"
            placeholder="Key"
            class="w-full bg-transparent px-1.5 py-1 font-mono text-foreground focus:outline-none placeholder:text-muted-foreground/40"
            @input="checkAutoAppend(index)"
          />
          <span
            v-if="item.inheritedFrom"
            class="shrink-0 text-[10px] px-1 py-0.2 rounded bg-primary/10 text-primary border border-primary/20"
          >
            {{ item.inheritedFrom === 'project' ? '全局' : '子项目' }}
          </span>
        </div>

        <!-- Value 输入 -->
        <div class="px-1">
          <input
            v-model="item.value"
            type="text"
            placeholder="Value"
            class="w-full bg-transparent px-1.5 py-1 font-mono text-foreground focus:outline-none placeholder:text-muted-foreground/40"
            @input="checkAutoAppend(index)"
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
            @click="removeItem(index)"
            class="text-muted-foreground/50 hover:text-destructive opacity-0 group-hover:opacity-100 transition p-1"
            title="删除此行"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- 空白占位提议 -->
      <div v-if="items.length === 0" class="py-4 text-center text-xs text-muted-foreground/60">
        暂无参数，请在下方点击新增或直接输入
      </div>
    </div>

    <!-- 底部操作栏 -->
    <div class="flex items-center justify-between p-2 border-t border-border/80 bg-muted/20">
      <button
        @click="addItem"
        class="flex items-center space-x-1 text-[11px] text-primary hover:underline font-medium px-1"
      >
        <Plus class="w-3.5 h-3.5" />
        <span>添加一行</span>
      </button>

      <span class="text-[11px] text-muted-foreground/60 pr-2">
        共 {{ items.length }} 项（{{ activeCount }} 项启用）
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'
import type { KeyValuePair } from '@/types'

const props = defineProps<{
  items: KeyValuePair[]
}>()

const activeCount = computed(() => props.items.filter(i => i.enabled && i.key.trim()).length)

const allEnabled = computed(() => {
  return props.items.length > 0 && props.items.every(i => i.enabled)
})

function toggleAll(e: Event) {
  const target = e.target as HTMLInputElement
  props.items.forEach(i => (i.enabled = target.checked))
}

function addItem() {
  props.items.push({
    id: crypto.randomUUID(),
    key: '',
    value: '',
    enabled: true
  })
}

function removeItem(index: number) {
  props.items.splice(index, 1)
  if (props.items.length === 0) {
    addItem()
  }
}

function checkAutoAppend(index: number) {
  if (index === props.items.length - 1) {
    const last = props.items[index]
    if (last.key.trim() || last.value.trim()) {
      addItem()
    }
  }
}
</script>

