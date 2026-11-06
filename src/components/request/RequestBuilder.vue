<template>
  <div class="flex flex-col h-full space-y-3">
    <!-- Tab 头部导航 -->
    <div class="flex items-center justify-between border-b border-border pb-1 shrink-0 select-none">
      <div class="flex items-center space-x-1 text-xs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="activeTab === tab.id ? 'text-primary font-medium border-b-2 border-primary bg-muted/30' : 'text-muted-foreground hover:text-foreground'"
          class="px-3 py-1.5 rounded-t-md transition relative flex items-center space-x-1.5"
        >
          <span>{{ tab.label }}</span>
          <span
            v-if="tab.badgeCount && tab.badgeCount > 0"
            class="text-[10px] px-1 py-0.2 rounded-full bg-primary/20 text-primary font-mono"
          >
            {{ tab.badgeCount }}
          </span>
        </button>
      </div>

      <!-- 右侧辅助工具：Params 模式切换 (表格 vs 纯文本) -->
      <div v-if="activeTab === 'params'" class="flex items-center space-x-1.5 text-[11px]">
        <button
          @click="toggleMode"
          class="flex items-center space-x-1 px-2 py-1 rounded border border-border bg-card/60 hover:bg-muted/50 text-muted-foreground hover:text-foreground transition text-xs"
          :title="isTextMode ? '切换为表格模式' : '切换为文本模式'"
        >
          <Code2 v-if="!isTextMode" class="w-3.5 h-3.5 text-primary" />
          <Table2 v-else class="w-3.5 h-3.5 text-primary" />
          <span>{{ isTextMode ? '表格模式' : '文本模式' }}</span>
        </button>
      </div>
    </div>

    <!-- Tab 页面内容区 (固定容器高度，防止内部无限撑大) -->
    <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
      <!-- 1. Headers Tab -->
      <div v-if="activeTab === 'headers'" class="flex-1 min-h-0 flex flex-col overflow-hidden space-y-2">
        <!-- 顶部二级导航与视图切换 -->
        <div class="flex items-center justify-between shrink-0 select-none pb-0.5">
          <!-- 视图模式切换 -->
          <div class="flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/50 text-xs">
            <button
              @click="headersViewMode = 'split'"
              class="px-2.5 py-1 rounded-md transition font-medium flex items-center space-x-1.5"
              :class="headersViewMode === 'split' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
              title="上下分栏同屏：专属置顶滚动 + 公共固定吸底"
            >
              <span>分栏同屏</span>
              <span v-if="effectiveInheritedHeaders.length > 0" class="text-[10px] px-1.5 py-0.2 rounded-full font-mono" :class="headersViewMode === 'split' ? 'bg-primary/15 text-primary font-semibold' : 'bg-muted text-muted-foreground'">
                {{ customHeadersCount + effectiveInheritedHeaders.length }}
              </span>
            </button>

            <button
              @click="headersViewMode = 'custom'"
              class="px-2.5 py-1 rounded-md transition font-medium flex items-center space-x-1.5"
              :class="headersViewMode === 'custom' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
              title="仅展示并编辑当前接口专属 Headers"
            >
              <span>接口专属</span>
              <span class="text-[10px] px-1.5 py-0.2 rounded-full font-mono" :class="headersViewMode === 'custom' ? 'bg-primary/15 text-primary font-semibold' : 'bg-muted text-muted-foreground'">
                {{ customHeadersCount }}
              </span>
            </button>

            <button
              v-if="effectiveInheritedHeaders.length > 0"
              @click="headersViewMode = 'inherited'"
              class="px-2.5 py-1 rounded-md transition font-medium flex items-center space-x-1.5"
              :class="headersViewMode === 'inherited' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
              title="全屏管理主项目与子项目级联继承 Headers"
            >
              <span>公共级联继承</span>
              <span class="text-[10px] px-1.5 py-0.2 rounded-full font-mono" :class="headersViewMode === 'inherited' ? 'bg-primary/15 text-primary font-semibold' : 'bg-muted text-muted-foreground'">
                {{ effectiveInheritedHeaders.length }}
              </span>
              <span v-if="overriddenHeadersCount > 0" class="w-1.5 h-1.5 rounded-full bg-amber-400" title="有修改覆盖项"></span>
            </button>

            <button
              v-if="effectiveInheritedHeaders.length > 0"
              @click="headersViewMode = 'effective'"
              class="px-2.5 py-1 rounded-md transition font-medium flex items-center space-x-1.5"
              :class="headersViewMode === 'effective' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
              title="查看发送时最终合并生效的全部 Headers 列表"
            >
              <span>最终生效</span>
              <span class="text-[10px] px-1.5 py-0.2 rounded-full font-mono" :class="headersViewMode === 'effective' ? 'bg-primary/15 text-primary font-semibold' : 'bg-muted text-muted-foreground'">
                {{ activeHeadersCount }}
              </span>
            </button>
          </div>

          <!-- 右侧模式切换工具 (文本模式 vs 表格模式) -->
          <div v-if="['split', 'custom'].includes(headersViewMode)" class="flex items-center space-x-1.5 text-xs">
            <button
              @click="toggleMode"
              class="flex items-center space-x-1 px-2 py-1 rounded border border-border bg-card/60 hover:bg-muted/50 text-muted-foreground hover:text-foreground transition text-xs"
              :title="isTextMode ? '切换为表格模式' : '切换为文本模式'"
            >
              <Code2 v-if="!isTextMode" class="w-3.5 h-3.5 text-primary" />
              <Table2 v-else class="w-3.5 h-3.5 text-primary" />
              <span>{{ isTextMode ? '表格模式' : '文本模式' }}</span>
            </button>
          </div>
        </div>

        <!-- 模式 1: 分栏同屏 (Split View: 专属在上内部滚动 + 公共固定吸底) -->
        <div v-if="headersViewMode === 'split'" class="flex-1 min-h-0 flex flex-col space-y-2 overflow-hidden">
          <!-- 1.1 接口专属 Headers 表格 (自适应高度，内部独立滚动，绝不顶出屏幕) -->
          <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
            <BulkTextEditor
              v-if="headersTextMode"
              :items="store.headers"
              format="colon"
              @update:items="val => store.headers = val"
            />
            <KeyValueGrid
              v-else
              :items="store.headers"
              :exclude-keys="inheritedKeys"
              :fill-height="true"
              :suggest-headers="true"
            />
          </div>

          <!-- 1.2 公共级联继承 Headers (固定吸底 shrink-0，无论多少专属项，永远锁定在视野底部) -->
          <div v-if="effectiveInheritedHeaders.length > 0" class="shrink-0 rounded-lg border border-border/70 bg-muted/20 overflow-hidden text-xs shadow-sm">
            <!-- 吸底卡片头部 -->
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
                  {{ effectiveInheritedHeaders.length }} 个公共项
                </span>
                <span v-if="projectInheritedCount > 0" class="text-[10px] px-1.5 py-0.2 rounded-full bg-muted text-muted-foreground font-mono">
                  {{ projectInheritedCount }} 全局
                </span>
                <span v-if="subProjectInheritedCount > 0" class="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-500/10 text-blue-400 font-mono border border-blue-500/20">
                  {{ subProjectInheritedCount }} 子项目
                </span>
                <span
                  v-if="overriddenHeadersCount > 0"
                  class="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/10 text-amber-400 font-mono font-medium border border-amber-500/20"
                >
                  ● {{ overriddenHeadersCount }} 项已覆盖
                </span>
                <span
                  v-if="disabledInheritedCount > 0"
                  class="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500/10 text-rose-400 font-mono font-medium border border-rose-500/20"
                >
                  {{ disabledInheritedCount }} 项已禁用
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

            <!-- 展开时的内部滚动表格 (max-h-44 内部滚动，两表格和谐共存) -->
            <div v-if="showInheritedHeaders" class="border-t border-border/50 divide-y divide-border/30 bg-card/30">
              <div class="flex items-center justify-between px-3 py-1.5 bg-muted/40 text-[10px]">
                <div class="relative w-48">
                  <Search class="w-3 h-3 text-muted-foreground/50 absolute left-2 top-1/2 -translate-y-1/2" />
                  <input
                    v-model="inheritedSearchQuery"
                    type="text"
                    placeholder="过滤公共 Header..."
                    class="w-full pl-6 pr-2 py-0.5 text-[10px] rounded bg-background/80 border border-border/60 text-foreground focus:outline-none focus:border-primary/50 font-mono"
                  />
                </div>

                <div class="flex items-center space-x-2">
                  <span class="text-muted-foreground/60 hidden sm:inline">修改值或禁用仅对当前接口有效</span>
                  <button
                    v-if="overriddenHeadersCount > 0 || disabledInheritedCount > 0"
                    @click.stop="resetAllInheritedHeaders"
                    class="px-2 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-medium transition flex items-center space-x-1 border border-amber-500/20"
                    title="恢复所有公共请求头为项目默认值"
                  >
                    <RotateCcw class="w-3 h-3" />
                    <span>全部恢复默认 ({{ overriddenHeadersCount + disabledInheritedCount }})</span>
                  </button>
                </div>
              </div>

              <!-- 表头 -->
              <div class="grid grid-cols-[36px_160px_1fr_130px_60px] bg-muted/50 px-3 py-1 font-medium text-[10px] text-muted-foreground select-none">
                <div class="text-center">启用</div>
                <div>Key (来源)</div>
                <div>Value (支持在此直接修改覆盖)</div>
                <div>说明 / 继承状态</div>
                <div class="text-right">操作</div>
              </div>

              <!-- 列表容器：max-h-44 overflow-y-auto 独立滚动 -->
              <div class="max-h-44 overflow-y-auto divide-y divide-border/30">
                <div
                  v-for="h in filteredInheritedHeaderRows"
                  :key="h.key"
                  class="grid grid-cols-[36px_160px_1fr_130px_60px] items-center px-3 py-1 hover:bg-muted/20 transition group"
                >
                  <div class="flex items-center justify-center">
                    <input
                      type="checkbox"
                      :checked="h.enabled"
                      @change="toggleInheritedHeaderEnabled(h)"
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
                    <span class="font-mono text-foreground font-semibold truncate text-[11px]" :title="h.key">{{ h.key }}</span>
                  </div>

                  <div class="pr-2">
                    <input
                      :value="h.value"
                      @input="e => updateInheritedHeaderValue(h, (e.target as HTMLInputElement).value)"
                      type="text"
                      :placeholder="h.originalValue ? `继承默认: ${h.originalValue}` : '在此输入接口专用的 Header 值...'"
                      class="w-full bg-background/60 hover:bg-background focus:bg-background px-2 py-0.5 rounded border font-mono text-xs text-foreground focus:outline-none transition placeholder:text-muted-foreground/40"
                      :class="h.isOverridden ? 'border-primary/60 ring-1 ring-primary/20 bg-background' : 'border-border/60'"
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
                      @click="resetInheritedHeader(h)"
                      class="text-[10px] text-muted-foreground hover:text-primary transition px-1.5 py-0.5 rounded hover:bg-muted font-medium"
                      title="恢复为公共默认继承状态"
                    >
                      ↺ 恢复
                    </button>
                  </div>
                </div>

                <div v-if="filteredInheritedHeaderRows.length === 0" class="py-4 text-center text-xs text-muted-foreground/60">
                  未找到匹配的公共 Header
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 模式 2: 接口专属 Headers (单屏全高模式) -->
        <div v-else-if="headersViewMode === 'custom'" class="flex-1 min-h-0 flex flex-col space-y-2 overflow-hidden">
          <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
            <BulkTextEditor
              v-if="headersTextMode"
              :items="store.headers"
              format="colon"
              @update:items="val => store.headers = val"
            />
            <KeyValueGrid
              v-else
              :items="store.headers"
              :exclude-keys="inheritedKeys"
              :fill-height="true"
              :suggest-headers="true"
            />
          </div>

          <!-- 底部吸底信息条，可一键切换公共继承 -->
          <div
            v-if="effectiveInheritedHeaders.length > 0"
            @click="headersViewMode = 'inherited'"
            class="shrink-0 flex items-center justify-between px-3 py-1.5 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/40 transition cursor-pointer text-xs text-muted-foreground select-none"
          >
            <div class="flex items-center space-x-2">
              <span class="text-[11px] font-medium text-foreground/80">公共级联继承:</span>
              <span class="text-[10px] px-1.5 py-0.2 rounded-full bg-primary/10 text-primary font-mono font-medium">
                {{ effectiveInheritedHeaders.length }} 个公共项
              </span>
              <span v-if="overriddenHeadersCount > 0" class="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/10 text-amber-400 font-mono font-medium border border-amber-500/20">
                {{ overriddenHeadersCount }} 项已覆盖
              </span>
            </div>
            <span class="text-[10px] text-primary hover:underline">切换查看公共继承 →</span>
          </div>
        </div>

        <!-- 模式 3: 公共级联继承 (单屏全高模式) -->
        <div v-else-if="headersViewMode === 'inherited'" class="flex-1 min-h-0 flex flex-col space-y-2 overflow-hidden">
          <!-- 工具条 -->
          <div class="flex items-center justify-between px-1 shrink-0 text-xs">
            <div class="relative w-64">
              <Search class="w-3.5 h-3.5 text-muted-foreground/50 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                v-model="inheritedSearchQuery"
                type="text"
                placeholder="搜索公共请求头 (Key / 说明)..."
                class="w-full pl-8 pr-3 py-1 text-xs rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary/50 font-mono"
              />
            </div>

            <div class="flex items-center space-x-2">
              <span class="text-[11px] text-muted-foreground/60">修改值或禁用仅对当前接口有效</span>
              <button
                v-if="overriddenHeadersCount > 0 || disabledInheritedCount > 0"
                @click="resetAllInheritedHeaders"
                class="px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-medium transition flex items-center space-x-1 border border-amber-500/20 text-xs"
                title="恢复所有公共请求头为项目默认值"
              >
                <RotateCcw class="w-3.5 h-3.5" />
                <span>全部恢复默认 ({{ overriddenHeadersCount + disabledInheritedCount }})</span>
              </button>
            </div>
          </div>

          <!-- 全高表格 -->
          <div class="flex-1 min-h-0 flex flex-col border border-border rounded-lg overflow-hidden bg-card/30 text-xs">
            <!-- 表头 -->
            <div class="grid grid-cols-[36px_180px_1fr_140px_70px] bg-muted/50 px-3 py-1.5 font-medium text-[11px] text-muted-foreground select-none shrink-0 border-b border-border/40">
              <div class="text-center">启用</div>
              <div>Key (来源)</div>
              <div>Value (支持在此直接修改覆盖)</div>
              <div>说明 / 继承状态</div>
              <div class="text-right">操作</div>
            </div>

            <!-- 数据行列表 -->
            <div class="flex-1 min-h-0 overflow-y-auto divide-y divide-border/30">
              <div
                v-for="h in filteredInheritedHeaderRows"
                :key="h.key"
                class="grid grid-cols-[36px_180px_1fr_140px_70px] items-center px-3 py-1.5 hover:bg-muted/20 transition group"
              >
                <div class="flex items-center justify-center">
                  <input
                    type="checkbox"
                    :checked="h.enabled"
                    @change="toggleInheritedHeaderEnabled(h)"
                    class="rounded border-border text-primary focus:ring-0 cursor-pointer"
                  />
                </div>

                <div class="flex items-center space-x-1.5 pr-2 truncate">
                  <span
                    class="text-[9px] px-1 py-0.2 rounded font-sans border font-medium shrink-0"
                    :class="h.inheritedFrom === 'project' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'"
                  >
                    {{ h.inheritedFrom === 'project' ? '全局' : '子项目' }}
                  </span>
                  <span class="font-mono text-foreground font-semibold truncate text-xs" :title="h.key">{{ h.key }}</span>
                </div>

                <div class="pr-2">
                  <input
                    :value="h.value"
                    @input="e => updateInheritedHeaderValue(h, (e.target as HTMLInputElement).value)"
                    type="text"
                    :placeholder="h.originalValue ? `继承默认: ${h.originalValue}` : '在此输入接口专用的 Header 值...'"
                    class="w-full bg-background/60 hover:bg-background focus:bg-background px-2 py-1 rounded border font-mono text-xs text-foreground focus:outline-none transition placeholder:text-muted-foreground/40"
                    :class="h.isOverridden ? 'border-primary/60 ring-1 ring-primary/20 bg-background' : 'border-border/60'"
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
                    @click="resetInheritedHeader(h)"
                    class="text-[11px] text-muted-foreground hover:text-primary transition px-2 py-0.5 rounded hover:bg-muted font-medium"
                    title="恢复为公共默认继承状态"
                  >
                    ↺ 恢复
                  </button>
                </div>
              </div>

              <div v-if="filteredInheritedHeaderRows.length === 0" class="py-8 text-center text-xs text-muted-foreground/60">
                未找到匹配的公共 Header
              </div>
            </div>
          </div>
        </div>

        <!-- 模式 4: 最终生效 (单屏全高模式) -->
        <div v-else-if="headersViewMode === 'effective'" class="flex-1 min-h-0 flex flex-col space-y-2 overflow-hidden">
          <div class="flex items-center justify-between px-1 shrink-0 text-xs">
            <div class="flex items-center space-x-2">
              <span class="text-xs font-semibold text-foreground">全部生效 Headers (共 {{ activeHeadersCount }} 项生效)</span>
              <span class="text-[10px] text-muted-foreground/60 hidden sm:inline">
                已综合项目全局、子项目级联与接口专属覆盖配置
              </span>
            </div>

            <div class="relative w-56">
              <Search class="w-3.5 h-3.5 text-muted-foreground/50 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                v-model="previewSearchQuery"
                type="text"
                placeholder="搜索生效 Header..."
                class="w-full pl-8 pr-3 py-1 text-xs rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary/50 font-mono"
              />
            </div>
          </div>

          <div class="flex-1 min-h-0 flex flex-col border border-border rounded-lg bg-card/40 overflow-hidden text-xs">
            <!-- 表头 -->
            <div class="grid grid-cols-[36px_180px_1fr_100px_180px] bg-muted/60 px-3 py-1.5 font-medium text-[10px] text-muted-foreground select-none shrink-0 border-b border-border/40">
              <div class="text-center">状态</div>
              <div>Key</div>
              <div>最终发送 Value</div>
              <div>来源</div>
              <div>继承与覆盖说明</div>
            </div>

            <!-- 数据行 -->
            <div class="flex-1 min-h-0 overflow-y-auto divide-y divide-border/30">
              <div
                v-for="item in filteredPreviewHeaders"
                :key="item.key"
                class="grid grid-cols-[36px_180px_1fr_100px_180px] items-center px-3 py-1.5 hover:bg-muted/20 transition text-[11px]"
                :class="!item.enabled ? 'opacity-50' : ''"
              >
                <div class="flex items-center justify-center">
                  <span
                    class="w-2 h-2 rounded-full"
                    :class="item.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/40'"
                    :title="item.enabled ? '此 Header 将随请求发送' : '未启用，不会发送'"
                  ></span>
                </div>
                <div class="font-mono font-semibold text-foreground truncate pr-2" :title="item.key">
                  {{ item.key }}
                </div>
                <div class="font-mono text-foreground/90 truncate pr-2" :title="item.value">
                  {{ item.value || '(空)' }}
                </div>
                <div>
                  <span
                    class="text-[9px] px-1.5 py-0.2 rounded font-sans border font-medium inline-block"
                    :class="{
                      'bg-primary/10 text-primary border-primary/20': item.source === 'project',
                      'bg-blue-500/10 text-blue-400 border-blue-500/20': item.source === 'subproject',
                      'bg-purple-500/10 text-purple-400 border-purple-500/20': item.source === 'custom'
                    }"
                  >
                    {{ item.sourceLabel }}
                  </span>
                </div>
                <div class="text-[10px] truncate text-muted-foreground" :title="item.overrideNote || item.description">
                  <span v-if="item.status === 'overridden'" class="text-amber-400 font-medium mr-1">
                    已覆盖
                  </span>
                  <span v-else-if="item.status === 'disabled'" class="text-rose-400 font-medium mr-1">
                    已在此接口禁用
                  </span>
                  <span v-if="item.overrideNote" class="text-muted-foreground/60">
                    ({{ item.overrideNote }})
                  </span>
                  <span v-else-if="item.description" class="text-muted-foreground/60">
                    {{ item.description }}
                  </span>
                  <span v-else class="text-muted-foreground/40">
                    正常继承
                  </span>
                </div>
              </div>

              <div v-if="filteredPreviewHeaders.length === 0" class="py-8 text-center text-xs text-muted-foreground/60">
                未找到匹配的 Header
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. Params Tab (Path Variables + Query Params) -->
      <div v-if="activeTab === 'params'" class="flex-1 min-h-0 flex flex-col space-y-3 overflow-hidden">
        <!-- 路径参数 (Path Variables) -->
        <div v-if="store.pathParams.length > 0" class="shrink-0 space-y-1.5 max-h-36 flex flex-col">
          <div class="flex items-center justify-between shrink-0">
            <span class="text-xs font-semibold text-foreground/90 flex items-center space-x-1.5">
              <span>Path Variables (路径参数)</span>
              <span class="text-[10px] text-muted-foreground font-normal">自动从 URL 中提取</span>
            </span>
          </div>
          <div class="overflow-y-auto">
            <KeyValueGrid :items="store.pathParams" />
          </div>
        </div>

        <!-- 查询参数 (Query Params) -->
        <div class="flex-1 min-h-0 flex flex-col space-y-1.5">
          <div class="flex items-center justify-between shrink-0">
            <span class="text-xs font-semibold text-foreground/90">Query Params (URL 参数)</span>
          </div>

          <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
            <BulkTextEditor
              v-if="paramsTextMode"
              :items="store.queryParams"
              format="equal"
              @update:items="val => store.queryParams = val"
            />
            <KeyValueGrid v-else :items="store.queryParams" :fill-height="true" />
          </div>
        </div>
      </div>

      <!-- 3. Body Tab -->
      <div v-if="activeTab === 'body'" class="flex-1 min-h-0 flex flex-col h-full space-y-3 overflow-hidden">
        <!-- Body 类型选择器 -->
        <div class="flex items-center space-x-4 text-xs select-none shrink-0">
          <label
            v-for="type in bodyTypes"
            :key="type.value"
            class="flex items-center space-x-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <input
              type="radio"
              :value="type.value"
              v-model="store.bodyType"
              class="text-primary focus:ring-0 cursor-pointer"
            />
            <span :class="store.bodyType === type.value ? 'font-medium text-foreground' : ''">{{ type.label }}</span>
          </label>
        </div>

        <!-- Body 内容编辑器 -->
        <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
          <!-- none -->
          <div v-if="store.bodyType === 'none'" class="flex-1 flex items-center justify-center border border-dashed border-border rounded-lg text-xs text-muted-foreground/60">
            该请求无需发送 Body
          </div>

          <!-- JSON 模式 (CodeMirror 6 + 手动格式化/压缩) -->
          <div v-else-if="store.bodyType === 'json'" class="flex-1 min-h-0 flex flex-col space-y-2 overflow-hidden">
            <div class="flex items-center justify-between text-xs shrink-0">
              <span class="text-muted-foreground text-[11px]">默认保持原始排版，不自动格式化</span>
              <div class="flex items-center space-x-2">
                <button
                  @click="store.formatJson"
                  class="flex items-center space-x-1 px-2 py-1 rounded bg-muted hover:bg-muted/80 text-foreground text-[11px] font-medium transition"
                  title="基于 Rust 原生 serde_json 异步执行"
                >
                  <Sparkles class="w-3.5 h-3.5 text-primary" />
                  <span>格式化 (Prettify)</span>
                </button>
                <button
                  @click="store.minifyJson"
                  class="flex items-center space-x-1 px-2 py-1 rounded bg-muted hover:bg-muted/80 text-foreground text-[11px] font-medium transition"
                  title="压缩为单行紧凑 JSON"
                >
                  <Minimize2 class="w-3.5 h-3.5 text-amber-400" />
                  <span>单行压缩 (Minify)</span>
                </button>
              </div>
            </div>

            <div class="flex-1 min-h-0 overflow-hidden">
              <CodeEditor v-model="store.bodyContent" language="json" />
            </div>
          </div>

          <!-- Raw 纯文本模式 -->
          <div v-else-if="store.bodyType === 'raw'" class="flex-1 min-h-0 overflow-hidden">
            <CodeEditor v-model="store.bodyContent" language="raw" />
          </div>

          <!-- Form-Data / x-www-form-urlencoded -->
          <div v-else class="flex-1 min-h-0 flex flex-col space-y-2 overflow-hidden">
            <div class="text-[11px] text-muted-foreground shrink-0">键值对表单配置：</div>
            <div class="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
              <div
                v-for="(field, index) in store.formFields"
                :key="field.id || index"
                class="grid grid-cols-[36px_1fr_1.5fr_60px_36px] items-center gap-2 px-2 py-1 bg-card/40 border border-border rounded"
              >
                <input type="checkbox" v-model="field.enabled" class="rounded border-border text-primary" />
                <input v-model="field.key" placeholder="Key" class="bg-transparent font-mono text-xs focus:outline-none" />
                <div class="flex items-center space-x-1 min-w-0">
                  <input
                    v-model="field.value"
                    :placeholder="field.is_file ? '点击选择文件或手动输入路径' : 'Value (文本)'"
                    class="flex-1 min-w-0 bg-transparent font-mono text-xs focus:outline-none truncate"
                  />
                  <button
                    v-if="field.is_file"
                    type="button"
                    @click="chooseFileForField(field)"
                    class="px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-[10px] text-primary border border-border font-sans shrink-0 transition"
                    title="浏览并选择本地文件"
                  >
                    浏览...
                  </button>
                </div>
                <label v-if="store.bodyType === 'form-data'" class="flex items-center space-x-1 text-[10px] text-muted-foreground cursor-pointer">
                  <input type="checkbox" v-model="field.is_file" />
                  <span>文件</span>
                </label>
                <button @click="store.formFields.splice(index, 1)" class="text-muted-foreground hover:text-destructive text-xs">×</button>
              </div>
            </div>
            <div class="shrink-0 pt-1">
              <button
                @click="addFormField"
                class="text-xs text-primary font-medium hover:underline"
              >
                + 添加字段
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { Sparkles, Minimize2, Code2, Table2, ChevronRight, Search, RotateCcw } from 'lucide-vue-next'
import { useRequestStore } from '@/stores/requestStore'
import { useTabStore } from '@/stores/tabStore'
import { useProjectStore } from '@/stores/projectStore'
import type { KeyValuePair } from '@/types'
import KeyValueGrid from './KeyValueGrid.vue'
import BulkTextEditor from './BulkTextEditor.vue'
import CodeEditor from '@/components/common/CodeEditor.vue'

const store = useRequestStore()
const tabStore = useTabStore()
const projectStore = useProjectStore()
const activeTab = ref<'headers' | 'params' | 'body'>('headers')

const paramsTextMode = ref(false)
const headersTextMode = ref(false)
const showInheritedHeaders = ref(false) // 默认收起公共继承项，重点突出接口专属 Headers
const inheritedSearchQuery = ref('')
const headersViewMode = ref<'split' | 'custom' | 'inherited' | 'effective'>('split')
const previewSearchQuery = ref('')

const activeTabItem = computed(() => tabStore.tabs.find(t => t.id === tabStore.activeTabId))
const effectiveInheritedHeaders = computed(() => {
  return projectStore.resolveEffectiveHeaders(activeTabItem.value?.subProjectDir)
})

const inheritedKeys = computed(() => {
  return effectiveInheritedHeaders.value.map(h => h.key.trim().toLowerCase())
})

interface InheritedRow {
  key: string
  originalValue: string
  inheritedFrom: 'project' | 'subproject'
  description?: string
  value: string
  enabled: boolean
  isOverridden: boolean
  overriddenInCustomGrid: boolean
}

const inheritedHeaderRows = computed<InheritedRow[]>(() => {
  return effectiveInheritedHeaders.value.map(ih => {
    const override = store.headers.find(
      h => h.key.trim().toLowerCase() === ih.key.trim().toLowerCase()
    )
    if (override) {
      return {
        key: ih.key,
        originalValue: ih.value || '',
        inheritedFrom: ih.inheritedFrom || 'subproject',
        description: ih.description,
        value: override.value,
        enabled: override.enabled !== false,
        isOverridden: override.value !== (ih.value || '') || override.enabled !== (ih.enabled !== false),
        overriddenInCustomGrid: override.isInheritedOverride === false
      }
    }
    return {
      key: ih.key,
      originalValue: ih.value || '',
      inheritedFrom: ih.inheritedFrom || 'subproject',
      description: ih.description,
      value: ih.value || '',
      enabled: ih.enabled !== false,
      isOverridden: false,
      overriddenInCustomGrid: false
    }
  })
})

const overriddenHeadersCount = computed(() => {
  return inheritedHeaderRows.value.filter(r => r.isOverridden).length
})

const disabledInheritedCount = computed(() => {
  return inheritedHeaderRows.value.filter(r => !r.enabled).length
})

const projectInheritedCount = computed(() => {
  return effectiveInheritedHeaders.value.filter(h => h.inheritedFrom === 'project').length
})

const subProjectInheritedCount = computed(() => {
  return effectiveInheritedHeaders.value.filter(h => h.inheritedFrom === 'subproject').length
})

const customHeadersCount = computed(() => {
  return store.headers.filter(h => {
    if (h.isInheritedOverride === true) return false
    if (h.isInheritedOverride === false) return h.key.trim().length > 0
    return !inheritedKeys.value.includes(h.key.trim().toLowerCase()) && h.key.trim().length > 0
  }).length
})

const filteredInheritedHeaderRows = computed(() => {
  const q = inheritedSearchQuery.value.trim().toLowerCase()
  if (!q) return inheritedHeaderRows.value
  return inheritedHeaderRows.value.filter(
    h => h.key.toLowerCase().includes(q) ||
         h.value.toLowerCase().includes(q) ||
         (h.description && h.description.toLowerCase().includes(q))
  )
})

function updateInheritedHeaderValue(row: InheritedRow, newVal: string) {
  const lowerKey = row.key.trim().toLowerCase()
  const idx = store.headers.findIndex(h => h.key.trim().toLowerCase() === lowerKey)

  if (idx !== -1) {
    store.headers[idx].value = newVal
    store.headers[idx].isInheritedOverride = true
  } else {
    store.headers.push({
      id: crypto.randomUUID(),
      key: row.key,
      value: newVal,
      enabled: row.enabled,
      description: row.description,
      isInheritedOverride: true
    })
  }
  tabStore.markCurrentDirty(true)
}

function toggleInheritedHeaderEnabled(row: InheritedRow) {
  const lowerKey = row.key.trim().toLowerCase()
  const idx = store.headers.findIndex(h => h.key.trim().toLowerCase() === lowerKey)
  const newEnabled = !row.enabled

  if (idx !== -1) {
    store.headers[idx].enabled = newEnabled
    store.headers[idx].isInheritedOverride = true
  } else {
    store.headers.push({
      id: crypto.randomUUID(),
      key: row.key,
      value: row.value,
      enabled: newEnabled,
      description: row.description,
      isInheritedOverride: true
    })
  }
  tabStore.markCurrentDirty(true)
}

function resetInheritedHeader(row: InheritedRow) {
  const lowerKey = row.key.trim().toLowerCase()
  const idx = store.headers.findIndex(h => h.key.trim().toLowerCase() === lowerKey)
  if (idx !== -1) {
    store.headers.splice(idx, 1)
    tabStore.markCurrentDirty(true)
  }
}

function resetAllInheritedHeaders() {
  const inheritedKeySet = new Set(effectiveInheritedHeaders.value.map(h => h.key.trim().toLowerCase()))
  store.headers = store.headers.filter(h => {
    const isInherited = inheritedKeySet.has(h.key.trim().toLowerCase())
    return !isInherited || h.isInheritedOverride === false
  })
  tabStore.markCurrentDirty(true)
}

interface EffectiveHeaderItem {
  key: string
  value: string
  enabled: boolean
  source: 'project' | 'subproject' | 'custom'
  sourceLabel: string
  status: 'active' | 'disabled' | 'overridden'
  statusLabel: string
  overrideNote?: string
  description?: string
}

const allEffectiveHeaders = computed<EffectiveHeaderItem[]>(() => {
  const list: EffectiveHeaderItem[] = []
  const inheritedMap = new Map<string, KeyValuePair>()

  for (const ih of effectiveInheritedHeaders.value) {
    if (ih.key.trim()) {
      inheritedMap.set(ih.key.trim().toLowerCase(), ih)
    }
  }

  const customMap = new Map<string, KeyValuePair>()
  for (const ch of store.headers) {
    if (ch.key.trim()) {
      customMap.set(ch.key.trim().toLowerCase(), ch)
    }
  }

  const allKeys = new Set([...inheritedMap.keys(), ...customMap.keys()])

  for (const k of allKeys) {
    const inherited = inheritedMap.get(k)
    const custom = customMap.get(k)

    if (custom) {
      if (inherited) {
        const isModifiedValue = custom.value !== (inherited.value || '')
        const isModifiedEnabled = custom.enabled !== (inherited.enabled !== false)
        const isOverridden = isModifiedValue || isModifiedEnabled

        list.push({
          key: custom.key || inherited.key,
          value: custom.value,
          enabled: custom.enabled,
          source: custom.isInheritedOverride === false ? 'custom' : (inherited.inheritedFrom || 'subproject'),
          sourceLabel: custom.isInheritedOverride === false ? '接口专属' : (inherited.inheritedFrom === 'project' ? '全局项目' : '子项目'),
          status: !custom.enabled ? 'disabled' : (isOverridden ? 'overridden' : 'active'),
          statusLabel: !custom.enabled ? '接口已禁用' : (isOverridden ? '接口已覆盖' : '生效中'),
          overrideNote: isOverridden ? `原始默认值: ${inherited.value || '(空)'}` : undefined,
          description: custom.description || inherited.description
        })
      } else {
        list.push({
          key: custom.key,
          value: custom.value,
          enabled: custom.enabled,
          source: 'custom',
          sourceLabel: '接口专属',
          status: custom.enabled ? 'active' : 'disabled',
          statusLabel: custom.enabled ? '生效中' : '未启用',
          description: custom.description
        })
      }
    } else if (inherited) {
      list.push({
        key: inherited.key,
        value: inherited.value || '',
        enabled: inherited.enabled !== false,
        source: inherited.inheritedFrom || 'subproject',
        sourceLabel: inherited.inheritedFrom === 'project' ? '全局项目' : '子项目',
        status: inherited.enabled !== false ? 'active' : 'disabled',
        statusLabel: inherited.enabled !== false ? '生效中' : '未启用',
        description: inherited.description
      })
    }
  }

  return list
})

const filteredPreviewHeaders = computed(() => {
  const q = previewSearchQuery.value.trim().toLowerCase()
  if (!q) return allEffectiveHeaders.value
  return allEffectiveHeaders.value.filter(
    h => h.key.toLowerCase().includes(q) ||
         h.value.toLowerCase().includes(q) ||
         (h.description && h.description.toLowerCase().includes(q))
  )
})

const activeHeadersCount = computed(() => {
  const headerMap = new Map<string, boolean>()
  for (const h of effectiveInheritedHeaders.value) {
    if (h.key.trim()) headerMap.set(h.key.trim().toLowerCase(), h.enabled !== false)
  }
  for (const h of store.headers) {
    if (h.key.trim()) headerMap.set(h.key.trim().toLowerCase(), h.enabled !== false)
  }
  let count = 0
  for (const enabled of headerMap.values()) {
    if (enabled) count++
  }
  return count
})

const isTextMode = computed(() => {
  return activeTab.value === 'headers' ? headersTextMode.value : paramsTextMode.value
})

function toggleMode() {
  if (activeTab.value === 'headers') {
    headersTextMode.value = !headersTextMode.value
  } else if (activeTab.value === 'params') {
    paramsTextMode.value = !paramsTextMode.value
  }
}

function addFormField() {
  store.formFields.push({
    id: crypto.randomUUID(),
    key: '',
    value: '',
    is_file: false,
    enabled: true
  })
}

async function chooseFileForField(field: { value: string }) {
  try {
    const selected = await invoke<string | null>('pick_file')
    if (selected) {
      field.value = selected
      tabStore.markCurrentDirty(true)
    }
  } catch (err: any) {
    alert(`选择文件失败: ${err?.message || err}`)
  }
}

const tabs = computed(() => [
  {
    id: 'headers' as const,
    label: 'Headers',
    badgeCount: activeHeadersCount.value
  },
  {
    id: 'params' as const,
    label: 'Params',
    badgeCount: store.queryParams.filter(p => p.enabled && p.key.trim()).length + store.pathParams.length
  },
  {
    id: 'body' as const,
    label: 'Body',
    badgeCount: store.bodyType !== 'none' ? 1 : 0
  }
])

const bodyTypes = [
  { label: 'none', value: 'none' },
  { label: 'JSON', value: 'json' },
  { label: 'form-data', value: 'form-data' },
  { label: 'x-www-form-urlencoded', value: 'x-www-form-urlencoded' },
  { label: 'Raw Text', value: 'raw' }
]
</script>
