<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div class="flex flex-col w-full max-w-2xl h-[520px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      <!-- 模态框顶部 -->
      <div class="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/40 shrink-0">
        <div class="flex items-center space-x-2">
          <div class="w-6 h-6 rounded-md bg-primary/20 text-primary flex items-center justify-center">
            <SlidersHorizontal class="w-3.5 h-3.5" />
          </div>
          <h3 class="font-semibold text-sm">网络与 Cookie 配置</h3>
        </div>
        <button
          @click="close"
          class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- 选项卡导航 -->
      <div class="flex items-center space-x-1 px-4 pt-2 border-b border-border bg-muted/10 shrink-0 text-xs">
        <button
          @click="activeTab = 'network'"
          :class="activeTab === 'network' ? 'border-b-2 border-primary text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'"
          class="px-3 py-2 transition flex items-center space-x-1.5"
        >
          <span>网络 & 代理 & SSL</span>
          <span
            v-if="store.networkSettings.dangerouslyDisableSsl || store.networkSettings.enableProxy"
            class="w-2 h-2 rounded-full bg-amber-400"
            title="有已启用的自定义网络选项"
          />
        </button>
        <button
          @click="activeTab = 'cookies'"
          :class="activeTab === 'cookies' ? 'border-b-2 border-primary text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'"
          class="px-3 py-2 transition flex items-center space-x-1.5"
        >
          <span>Cookie Jar 管理</span>
          <span
            v-if="store.sessionCookies.length > 0"
            class="px-1.5 py-0.2 rounded-full bg-primary/20 text-primary text-[10px] font-mono"
          >
            {{ store.sessionCookies.length }}
          </span>
        </button>
      </div>

      <!-- 选项卡主体内容 -->
      <div class="flex-1 overflow-y-auto p-5">
        <!-- 1. 网络与 SSL / 代理配置 -->
        <div v-if="activeTab === 'network'" class="space-y-5">
          <!-- SSL 忽略开关 -->
          <div class="p-4 rounded-xl border border-border bg-card/60 space-y-2">
            <div class="flex items-center justify-between">
              <div class="space-y-0.5">
                <div class="flex items-center space-x-2">
                  <span class="text-xs font-semibold text-foreground">忽略 SSL 证书校验</span>
                  <span class="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    自签名 / 本地测试
                  </span>
                </div>
                <p class="text-[11px] text-muted-foreground">
                  允许请求未经权威机构签名的自签名证书或过期证书服务（规避 SSL Handshake 报错）。
                </p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input
                  v-model="store.networkSettings.dangerouslyDisableSsl"
                  type="checkbox"
                  class="sr-only peer"
                />
                <div class="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>
          </div>

          <!-- HTTP / HTTPS 代理配置 -->
          <div class="p-4 rounded-xl border border-border bg-card/60 space-y-3">
            <div class="flex items-center justify-between">
              <div class="space-y-0.5">
                <span class="text-xs font-semibold text-foreground">HTTP / SOCKS 代理</span>
                <p class="text-[11px] text-muted-foreground">
                  通过指定内网或本地代理服务器转发所有的 RESTful 请求。
                </p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input
                  v-model="store.networkSettings.enableProxy"
                  type="checkbox"
                  class="sr-only peer"
                />
                <div class="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <div v-if="store.networkSettings.enableProxy" class="pt-2 border-t border-border/60 space-y-1.5">
              <label class="text-[11px] text-muted-foreground">代理服务器地址 (URL)</label>
              <input
                v-model="store.networkSettings.proxyUrl"
                type="text"
                placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:1080"
                class="w-full text-xs font-mono px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        <!-- 2. Cookie Jar 会话管理 -->
        <div v-else-if="activeTab === 'cookies'" class="space-y-4">
          <!-- Cookie Jar 全局开关与清空 -->
          <div class="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
            <div>
              <div class="text-xs font-medium text-foreground">自动 Cookie 会话隔离 (Cookie Jar)</div>
              <div class="text-[11px] text-muted-foreground">
                接收服务端 <code class="font-mono text-[10px] bg-muted px-1 py-0.2 rounded">Set-Cookie</code> 并在发送匹配域名的请求时自动注入
              </div>
            </div>

            <div class="flex items-center space-x-3">
              <button
                v-if="store.sessionCookies.length > 0"
                @click="store.clearCookies()"
                class="px-2 py-1 rounded text-destructive hover:bg-destructive/10 text-xs transition"
                title="清空当前所有 Cookie"
              >
                清空 Cookies
              </button>

              <label class="relative inline-flex items-center cursor-pointer">
                <input
                  v-model="store.networkSettings.enableCookieJar"
                  type="checkbox"
                  class="sr-only peer"
                />
                <div class="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
          </div>

          <!-- Cookie 列表表格 -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-xs text-muted-foreground pb-1 border-b border-border/60">
              <div class="flex items-center space-x-2">
                <span class="w-28 pl-1">名称 (Name)</span>
                <span class="w-32">域名 (Domain)</span>
                <span class="flex-1">值 (Value)</span>
              </div>
              <button
                @click="showAddCookie = true"
                class="flex items-center space-x-1 px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground text-xs transition"
              >
                <Plus class="w-3 h-3 text-primary" />
                <span>手动添加</span>
              </button>
            </div>

            <!-- 手动添加表单 -->
            <div v-if="showAddCookie" class="p-2.5 rounded-lg border border-primary/40 bg-card space-y-2">
              <div class="grid grid-cols-3 gap-2">
                <input
                  v-model="newCookie.name"
                  type="text"
                  placeholder="Cookie 名称"
                  class="text-xs font-mono px-2 py-1 rounded bg-background border border-border"
                />
                <input
                  v-model="newCookie.domain"
                  type="text"
                  placeholder="域名 (如 api.dev.com)"
                  class="text-xs font-mono px-2 py-1 rounded bg-background border border-border"
                />
                <input
                  v-model="newCookie.value"
                  type="text"
                  placeholder="Cookie 值"
                  class="text-xs font-mono px-2 py-1 rounded bg-background border border-border"
                />
              </div>
              <div class="flex justify-end space-x-2">
                <button
                  @click="showAddCookie = false"
                  class="px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted"
                >
                  取消
                </button>
                <button
                  @click="confirmAddCookie"
                  class="px-2.5 py-1 rounded text-xs bg-primary text-primary-foreground font-medium"
                >
                  确认添加
                </button>
              </div>
            </div>

            <!-- 列表渲染 -->
            <div class="space-y-1 max-h-[220px] overflow-y-auto">
              <div
                v-for="(cookie, idx) in store.sessionCookies"
                :key="idx"
                class="flex items-center justify-between px-2 py-1.5 rounded bg-card/40 border border-border/60 hover:bg-muted/30 transition text-xs font-mono group"
              >
                <div class="flex items-center space-x-2 truncate flex-1 min-w-0">
                  <span class="w-28 font-semibold text-foreground truncate shrink-0">{{ cookie.name }}</span>
                  <span class="w-32 text-muted-foreground truncate shrink-0 text-[11px]">{{ cookie.domain || '*' }}</span>
                  <span class="text-muted-foreground/80 truncate flex-1" :title="cookie.value">{{ cookie.value }}</span>
                </div>
                <button
                  @click="store.removeCookie(idx)"
                  class="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition shrink-0 ml-2"
                  title="删除此 Cookie"
                >
                  <Trash2 class="w-3 h-3" />
                </button>
              </div>

              <div v-if="store.sessionCookies.length === 0" class="text-center py-8 text-xs text-muted-foreground">
                当前 Cookie Jar 为空。发起包含 Set-Cookie 的请求后将自动收集并保持。
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部关闭栏与同步指示器 -->
      <div class="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/40 shrink-0">
        <div class="flex items-center space-x-1.5 text-xs">
          <span v-if="projectStore.hasProject" class="flex items-center space-x-1 text-emerald-400 font-medium">
            <CheckCircle2 class="w-3.5 h-3.5" />
            <span>配置已自动保存至 project.json</span>
          </span>
          <span v-else class="text-muted-foreground text-[11px]">
            未关联项目（当前保存为全局默认设置）
          </span>
        </div>

        <button
          @click="close"
          class="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-xs transition shadow-sm"
        >
          完成
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { X, SlidersHorizontal, Plus, Trash2, CheckCircle2 } from 'lucide-vue-next'
import { useRequestStore } from '@/stores/requestStore'
import { useProjectStore } from '@/stores/projectStore'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const store = useRequestStore()
const projectStore = useProjectStore()
const activeTab = ref<'network' | 'cookies'>('network')

const showAddCookie = ref(false)
const newCookie = ref({
  name: '',
  value: '',
  domain: ''
})

function confirmAddCookie() {
  if (!newCookie.value.name.trim()) return
  store.addCookie({
    name: newCookie.value.name.trim(),
    value: newCookie.value.value.trim(),
    domain: newCookie.value.domain.trim() || undefined,
    raw: `${newCookie.value.name}=${newCookie.value.value}`
  })
  newCookie.value = { name: '', value: '', domain: '' }
  showAddCookie.value = false
}

function close() {
  isOpen.value = false
}
</script>

