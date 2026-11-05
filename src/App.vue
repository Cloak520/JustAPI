<template>
  <div class="flex flex-col h-screen w-screen bg-background text-foreground select-none overflow-hidden">
    <!-- 顶部导航栏 / 窗口控制区 (支持 macOS 原生拖拽移动) -->
    <header class="flex items-center justify-between px-4 h-11 border-b border-border bg-card/60 backdrop-blur shrink-0" data-tauri-drag-region>
      <div class="flex items-center space-x-3">
        <!-- macOS 预留交通灯间距或应用 Logo -->
        <div class="flex items-center space-x-2 pl-14 sm:pl-0">
          <div class="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center text-primary font-bold text-xs tracking-tighter shadow-sm">
            J
          </div>
          <span class="font-semibold text-sm tracking-wide">JustAPI</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">MVP</span>
        </div>
      </div>

      <!-- 中间：当前 BaseURL 与环境快速配置 -->
      <div class="flex items-center space-x-2 text-xs">
        <span class="text-muted-foreground text-[11px]">BaseURL:</span>
        <input
          v-model="store.baseUrl"
          type="text"
          placeholder="https://api.example.com"
          class="font-mono text-xs px-2 py-1 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary w-56 text-foreground truncate"
        />
      </div>

      <!-- 右侧：快捷操作与核心指标 -->
      <div class="flex items-center space-x-3 text-xs">
        <button
          @click="resetExample"
          class="text-[11px] text-muted-foreground hover:text-foreground transition underline font-mono"
        >
          载入示例
        </button>
      </div>
    </header>

    <!-- 主工作区：上下分屏设计 (上部 Request Builder，下部 Response Viewer) -->
    <main class="flex-1 flex flex-col p-4 space-y-4 overflow-hidden">
      <!-- 1. 请求构建区域 (URL 栏 + 参数/头/Body 标签页) -->
      <section class="flex flex-col space-y-3 shrink-0 max-h-[50%] min-h-[260px] p-3 rounded-xl border border-border bg-card/40 backdrop-blur shadow-sm">
        <UrlBar />
        <div class="flex-1 overflow-hidden min-h-0">
          <RequestBuilder />
        </div>
      </section>

      <!-- 2. 响应展示区域 -->
      <section class="flex-1 flex flex-col p-3 rounded-xl border border-border bg-card/40 backdrop-blur shadow-sm overflow-hidden min-h-0">
        <ResponseViewer />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { useRequestStore } from '@/stores/requestStore'
import UrlBar from '@/components/request/UrlBar.vue'
import RequestBuilder from '@/components/request/RequestBuilder.vue'
import ResponseViewer from '@/components/response/ResponseViewer.vue'

const store = useRequestStore()

function resetExample() {
  store.method = 'GET'
  store.baseUrl = 'https://httpbin.org'
  store.path = '/get'
  store.queryParams = [
    { id: '1', key: 'product', value: 'JustAPI', enabled: true, description: 'Client name' },
    { id: '2', key: 'mode', value: 'lightweight', enabled: true, description: 'Engine mode' }
  ]
  store.headers = [
    { id: 'h1', key: 'User-Agent', value: 'JustAPI/0.1.0', enabled: true },
    { id: 'h2', key: 'Accept', value: 'application/json', enabled: true }
  ]
  store.bodyType = 'none'
  store.send()
}
</script>
