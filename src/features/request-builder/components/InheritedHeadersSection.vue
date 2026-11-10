<template>
  <div
    class="flex flex-col overflow-hidden text-xs"
    :class="compact
      ? 'border-t border-border/50 divide-y divide-border/30 bg-card/30'
      : 'flex-1 min-h-0 space-y-2'"
  >
    <!-- 过滤工具条 -->
    <div
      class="flex items-center justify-between shrink-0"
      :class="compact ? 'px-3 py-1.5 bg-muted/40 text-[10px]' : 'px-1 text-xs'"
    >
      <div class="relative" :class="compact ? 'w-48' : 'w-64'">
        <Search
          class="text-muted-foreground/50 absolute top-1/2 -translate-y-1/2"
          :class="compact ? 'w-3 h-3 left-2' : 'w-3.5 h-3.5 left-2.5'"
        />
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="compact ? '过滤公共 Header...' : '搜索公共请求头 (Key / 说明)...'"
          class="w-full rounded text-foreground focus:outline-none focus:border-primary/50 font-mono"
          :class="compact
            ? 'pl-6 pr-2 py-0.5 text-[10px] bg-background/80 border border-border/60'
            : 'pl-8 pr-3 py-1 text-xs bg-background border border-border'"
        />
      </div>

      <div class="flex items-center space-x-2">
        <span class="text-muted-foreground/60 hidden sm:inline" :class="compact ? 'text-[10px]' : 'text-[11px]'">
          修改值或禁用仅对当前接口有效
        </span>
        <button
          v-if="overriddenCount > 0 || disabledCount > 0"
          @click.stop="resetAll"
          class="rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-medium transition flex items-center space-x-1 border border-amber-500/20"
          :class="compact ? 'px-2 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'"
          title="恢复所有公共请求头为项目默认值"
        >
          <RotateCcw :class="compact ? 'w-3 h-3' : 'w-3.5 h-3.5'" />
          <span>全部恢复默认 ({{ overriddenCount + disabledCount }})</span>
        </button>
      </div>
    </div>

    <!-- 表格外框 (非 compact 模式独立边框，compact 模式直接嵌在折叠卡片内) -->
    <div :class="compact ? 'flex flex-col' : 'flex-1 min-h-0 flex flex-col border border-border rounded-lg overflow-hidden bg-card/30 text-xs'">
      <!-- 表头 -->
      <div
        class="bg-muted/50 px-3 font-medium text-muted-foreground select-none shrink-0"
        :class="compact
          ? 'grid grid-cols-[36px_160px_1fr_130px_60px] py-1 text-[10px]'
          : 'grid grid-cols-[36px_180px_1fr_140px_70px] py-1.5 text-[11px] border-b border-border/40'"
      >
        <div class="text-center">启用</div>
        <div>Key (来源)</div>
        <div>Value (支持在此直接修改覆盖)</div>
        <div>说明 / 继承状态</div>
        <div class="text-right">操作</div>
      </div>

      <!-- 行列表 -->
      <div :class="compact ? 'max-h-44 overflow-y-auto divide-y divide-border/30' : 'flex-1 min-h-0 overflow-y-auto divide-y divide-border/30'">
        <div
          v-for="h in filteredRows"
          :key="h.key"
          class="items-center px-3 hover:bg-muted/20 transition group"
          :class="compact
            ? 'grid grid-cols-[36px_160px_1fr_130px_60px] py-1'
            : 'grid grid-cols-[36px_180px_1fr_140px_70px] py-1.5'"
        >
          <div class="flex items-center justify-center">
            <input
              type="checkbox"
              :checked="h.enabled"
              @change="toggleEnabled(h)"
              class="rounded border-border text-primary focus:ring-0 cursor-pointer"
              title="当前接口是否发送此 Header"
            />
          </div>

          <div class="flex items-center space-x-1.5 pr-2 truncate">
            <span
              class="text-[9px] px-1 py-0.2 rounded font-sans border font-medium shrink-0"
              :class="h.inheritedFrom === 'project' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'"
            >
              {{ h.inheritedFrom === 'project' ? '全局' : '子项目' }}
            </span>
            <span
              class="font-mono text-foreground font-semibold truncate"
              :class="compact ? 'text-[11px]' : 'text-xs'"
              :title="h.key"
            >
              {{ h.key }}
            </span>
          </div>

          <div class="pr-2">
            <AutocompleteInput
              :model-value="h.value"
              @update:model-value="val => updateValue(h, val)"
              :placeholder="h.originalValue ? `继承默认: ${h.originalValue}` : '在此输入接口专用的 Header 值...'"
              :input-class="`w-full bg-background/60 hover:bg-background focus:bg-background px-2 rounded border font-mono text-xs text-foreground focus:outline-none transition placeholder:text-muted-foreground/40 ${compact ? 'py-0.5' : 'py-1'} ${h.isOverridden ? 'border-primary/60 ring-1 ring-primary/20 bg-background' : 'border-border/60'}`"
            />
          </div>

          <div class="flex items-center space-x-1.5 pr-2 truncate text-[10px]">
            <span v-if="!h.enabled" class="px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-400 font-medium border border-rose-500/20 shrink-0">
              已在此接口禁用
            </span>
            <span v-else-if="h.overriddenInCustomGrid" class="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shrink-0">
              专属Header已覆盖
            </span>
            <span v-else-if="h.isOverridden" class="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 font-medium border border-amber-500/20 shrink-0">
              已修改覆盖
            </span>
            <span v-else class="text-muted-foreground/60 shrink-0">继承中</span>
            <span v-if="h.description" class="text-muted-foreground/60 truncate" :title="h.description">{{ h.description }}</span>
          </div>

          <div class="text-right">
            <button
              v-if="h.isOverridden"
              @click="resetRow(h)"
              class="text-muted-foreground hover:text-primary transition rounded hover:bg-muted font-medium"
              :class="compact ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5'"
              title="恢复为公共默认继承状态"
            >
              ↺ 恢复
            </button>
          </div>
        </div>

        <div
          v-if="filteredRows.length === 0"
          class="text-center text-xs text-muted-foreground/60"
          :class="compact ? 'py-4' : 'py-8'"
        >
          未找到匹配的公共 Header
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { RotateCcw, Search } from 'lucide-vue-next'
import AutocompleteInput from '@/components/common/AutocompleteInput.vue'
import type { InheritedHeaderRow } from '@/core/inheritance/resolver'
import { useSessionStore } from '@/stores/sessionStore'

withDefaults(
  defineProps<{
    compact?: boolean
  }>(),
  {
    compact: false
  }
)

const sessionStore = useSessionStore()
const searchQuery = ref('')

const rows = computed(() => sessionStore.headerResolution.inheritedRows)
const overriddenCount = computed(() => sessionStore.headerResolution.overriddenHeadersCount)
const disabledCount = computed(() => sessionStore.headerResolution.disabledInheritedCount)

const filteredRows = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter(
    h =>
      h.key.toLowerCase().includes(q) ||
      h.value.toLowerCase().includes(q) ||
      (h.description && h.description.toLowerCase().includes(q))
  )
})

function updateValue(row: InheritedHeaderRow, newVal: string) {
  const headers = sessionStore.activeRequest.headers
  const lowerKey = row.key.trim().toLowerCase()
  const idx = headers.findIndex(h => h.key.trim().toLowerCase() === lowerKey)

  if (idx !== -1) {
    headers[idx].value = newVal
    headers[idx].isInheritedOverride = true
  } else {
    headers.push({
      id: crypto.randomUUID(),
      key: row.key,
      value: newVal,
      enabled: row.enabled,
      description: row.description,
      isInheritedOverride: true
    })
  }
  sessionStore.markCurrentDirty(true)
}

function toggleEnabled(row: InheritedHeaderRow) {
  const headers = sessionStore.activeRequest.headers
  const lowerKey = row.key.trim().toLowerCase()
  const idx = headers.findIndex(h => h.key.trim().toLowerCase() === lowerKey)
  const newEnabled = !row.enabled

  if (idx !== -1) {
    headers[idx].enabled = newEnabled
    headers[idx].isInheritedOverride = true
  } else {
    headers.push({
      id: crypto.randomUUID(),
      key: row.key,
      value: row.value,
      enabled: newEnabled,
      description: row.description,
      isInheritedOverride: true
    })
  }
  sessionStore.markCurrentDirty(true)
}

function resetRow(row: InheritedHeaderRow) {
  const headers = sessionStore.activeRequest.headers
  const lowerKey = row.key.trim().toLowerCase()
  const idx = headers.findIndex(h => h.key.trim().toLowerCase() === lowerKey)
  if (idx !== -1) {
    headers.splice(idx, 1)
    sessionStore.markCurrentDirty(true)
  }
}

function resetAll() {
  const inheritedSet = new Set(sessionStore.headerResolution.inheritedKeys)
  sessionStore.activeRequest.headers = sessionStore.activeRequest.headers.filter(h => {
    const isInherited = inheritedSet.has(h.key.trim().toLowerCase())
    return !isInherited || h.isInheritedOverride === false
  })
  sessionStore.markCurrentDirty(true)
}
</script>

