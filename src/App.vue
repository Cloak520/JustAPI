<template>
  <div class="flex flex-col h-screen w-screen bg-background text-foreground select-none">
    <!-- 顶部标题栏 / 窗口控制区 -->
    <header class="flex items-center justify-between px-4 h-11 border-b border-border bg-card/60 backdrop-blur shrink-0" data-tauri-drag-region>
      <div class="flex items-center space-x-3">
        <!-- macOS 预留交通灯间距或应用 Logo -->
        <div class="flex items-center space-x-2">
          <div class="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
            J
          </div>
          <span class="font-semibold text-sm tracking-wide">JustAPI</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">v0.1.0</span>
        </div>
      </div>

      <!-- 中间项目状态 -->
      <div class="flex items-center space-x-2 text-xs text-muted-foreground">
        <FolderOpen class="w-3.5 h-3.5" />
        <span>{{ currentProjectName || '未选择项目目录' }}</span>
      </div>

      <!-- 右侧快捷状态与操作 -->
      <div class="flex items-center space-x-3 text-xs">
        <div class="flex items-center space-x-1.5">
          <span class="inline-block w-2 h-2 rounded-full" :class="backendConnected ? 'bg-emerald-500' : 'bg-amber-500'"></span>
          <span class="text-muted-foreground text-[11px]">{{ backendStatus }}</span>
        </div>
      </div>
    </header>

    <!-- 主工作区容器 (Phase 0 验证占位面板) -->
    <main class="flex-1 flex overflow-hidden">
      <!-- 侧边栏占位 -->
      <aside class="w-64 border-r border-border bg-card/30 flex flex-col justify-between p-3">
        <div class="space-y-3">
          <div class="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
            项目与子项目 (Phase 2)
          </div>
          <div class="p-3 rounded-lg border border-dashed border-border text-center text-xs text-muted-foreground">
            选择本地目录以载入 RESTful 集合
          </div>
        </div>

        <div class="text-[11px] text-muted-foreground px-1 space-y-1">
          <div>Tauri 2.0 + Vue 3 + Vite</div>
          <div>CodeMirror 6 + serde_json</div>
        </div>
      </aside>

      <!-- 核心工作台 -->
      <section class="flex-1 flex flex-col p-6 overflow-y-auto space-y-6">
        <div>
          <h2 class="text-lg font-semibold tracking-tight">Phase 0 脚手架与原生连接验证</h2>
          <p class="text-xs text-muted-foreground mt-1">
            验证 Tauri 2.0 IPC 通信、Rust 原生 <code class="text-primary font-mono">serde_json</code> 异步格式化与 Windows 裁剪配置。
          </p>
        </div>

        <!-- Rust 后端 IPC 与 serde_json 快速验证卡片 -->
        <div class="p-5 rounded-xl border border-border bg-card/50 space-y-4 max-w-2xl">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium">Rust 原生 serde_json 异步格式化测试</span>
            <button
              @click="testRustFormat"
              :disabled="loading"
              class="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
            >
              {{ loading ? '处理中...' : '测试 Rust 格式化' }}
            </button>
          </div>

          <div class="space-y-2">
            <label class="text-xs text-muted-foreground">输入未格式化的紧凑 JSON：</label>
            <textarea
              v-model="rawJsonInput"
              rows="3"
              class="w-full font-mono text-xs p-2.5 rounded-md bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
            ></textarea>
          </div>

          <div v-if="formattedResult" class="space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="text-xs text-muted-foreground">Rust 处理耗时：<span class="text-emerald-400 font-mono">{{ costMs }} ms</span></span>
            </div>
            <pre class="font-mono text-xs p-3 rounded-md bg-background border border-border overflow-x-auto text-emerald-400 max-h-48">{{ formattedResult }}</pre>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { FolderOpen } from 'lucide-vue-next'
import { invoke } from '@tauri-apps/api/core'

const currentProjectName = ref('')
const backendConnected = ref(false)
const backendStatus = ref('连接中...')
const loading = ref(false)
const costMs = ref(0)

const rawJsonInput = ref('{"name":"JustAPI","type":"RESTful","features":["lightweight","no-login","local-first"],"stats":{"stars":9999,"active":true}}')
const formattedResult = ref('')

async function checkBackend() {
  try {
    const res = await invoke<string>('ping')
    backendConnected.value = true
    backendStatus.value = res || 'Tauri 2.0 就绪'
  } catch (err) {
    // 处于纯 Web 调试模式时的优雅降级
    backendConnected.value = false
    backendStatus.value = 'Web 预览模式 (未挂载 Tauri)'
  }
}

async function testRustFormat() {
  loading.value = true
  const start = performance.now()
  try {
    const res = await invoke<string>('format_json_fast', { raw: rawJsonInput.value })
    formattedResult.value = res
    costMs.value = Math.round((performance.now() - start) * 100) / 100
  } catch (err: any) {
    formattedResult.value = `错误: ${err?.message || err}`
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  checkBackend()
})
</script>

