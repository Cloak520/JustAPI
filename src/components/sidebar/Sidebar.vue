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
    <div v-if="sidebarView === 'collections'" class="flex-1 flex flex-col overflow-hidden">
      <!-- 项目根信息与操作栏 -->
      <div class="p-3 border-b border-border bg-card/40 flex items-center justify-between shrink-0">
        <div class="flex-1 truncate mr-2">
          <div class="font-semibold text-foreground truncate" :title="projectStore.projectConfig?.name || '未打开项目'">
            {{ projectStore.projectConfig?.name || '无本地项目' }}
          </div>
          <div class="text-[10px] text-muted-foreground truncate font-mono" :title="projectStore.projectPath || ''">
            {{ projectStore.projectPath || '请选择一个本地目录' }}
          </div>
        </div>

        <div class="flex items-center space-x-1 shrink-0">
          <button
            @click="projectStore.pickAndOpenProject"
            class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
            title="打开本地项目目录"
          >
            <FolderOpen class="w-4 h-4 text-primary" />
          </button>
          <button
            v-if="projectStore.hasProject"
            @click="openImportSwaggerModal"
            class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
            title="导入 Swagger / OpenAPI 接口文档"
          >
            <FileDown class="w-4 h-4 text-amber-400" />
          </button>
          <button
            v-if="projectStore.hasProject"
            @click="showNewSubprojectModal = true"
            class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
            title="新建子项目模块"
          >
            <FolderPlus class="w-4 h-4 text-emerald-400" />
          </button>
          <button
            v-if="projectStore.hasProject"
            @click="showProjectSettingsModal = true"
            class="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
            title="主项目全局配置 (BaseURL、名称等)"
          >
            <FolderCog class="w-4 h-4 text-primary/80" />
          </button>
        </div>
      </div>

      <!-- 未打开项目时的欢迎引导与最近项目 -->
      <div v-if="!projectStore.hasProject" class="flex-1 flex flex-col p-4 space-y-4 overflow-y-auto">
        <div class="p-4 rounded-xl border border-dashed border-border text-center space-y-3 bg-card/20">
          <FolderCode class="w-8 h-8 text-primary/60 mx-auto" />
          <div class="space-y-1">
            <h4 class="font-medium text-foreground text-xs">目录即项目 (Folder-as-Project)</h4>
            <p class="text-[11px] text-muted-foreground leading-relaxed">
              选择本地代码仓库的任意目录，所有接口单文件保存，天然支持 Git 协同。
            </p>
          </div>
          <button
            @click="projectStore.pickAndOpenProject"
            class="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium text-xs hover:bg-primary/90 transition shadow-sm w-full"
          >
            打开或新建目录
          </button>
        </div>

        <!-- 最近打开的项目列表 -->
        <div v-if="projectStore.recentProjects.length > 0" class="space-y-2">
          <div class="text-[11px] font-medium text-muted-foreground px-1">最近打开的项目</div>
          <div class="space-y-1">
            <div
              v-for="rec in projectStore.recentProjects"
              :key="rec.path"
              @click="projectStore.loadProject(rec.path)"
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

      <!-- 已打开项目：子项目与请求树 (支持全部展开/折叠与接口管理) -->
      <div v-else class="flex-1 flex flex-col min-h-0 overflow-hidden">
        <!-- 树形结构快捷操作栏 (展开全部 / 折叠全部 / 接口总数) -->
        <div v-if="projectStore.subProjects.length > 0" class="px-3 py-1.5 bg-muted/20 border-b border-border/50 flex items-center justify-between text-[11px] text-muted-foreground shrink-0 select-none">
          <div class="flex items-center space-x-1.5">
            <span class="font-medium text-foreground/80">接口模块</span>
            <span class="px-1.5 py-0.2 rounded-full bg-primary/10 text-primary text-[10px] font-mono font-medium">
              {{ totalRequestsCount }} 个
            </span>
          </div>

          <div class="flex items-center space-x-1">
            <button
              @click="expandAllTree"
              class="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition text-[10px]"
              title="全部展开所有模块与接口分组"
            >
              <UnfoldVertical class="w-3 h-3 text-primary/80" />
              <span>展开全部</span>
            </button>
            <button
              @click="collapseAllTree"
              class="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition text-[10px]"
              title="全部折叠接口分组 (子项目保持展开)"
            >
              <FoldVertical class="w-3 h-3 text-muted-foreground" />
              <span>折叠全部</span>
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-2 space-y-2">
        <div v-if="projectStore.subProjects.length === 0" class="p-4 text-center text-muted-foreground text-xs space-y-2">
          <div>暂无子项目模块</div>
          <button
            @click="openImportSwaggerModal"
            class="text-xs text-primary underline font-medium"
          >
            从 Swagger 导入接口
          </button>
        </div>

        <div
          v-for="sub in projectStore.subProjects"
          :key="sub.dir_name"
          class="rounded-lg border border-border/80 bg-card/20 overflow-hidden"
        >
          <!-- 子项目头 -->
          <div
            class="flex items-center justify-between p-2 bg-muted/30 cursor-pointer hover:bg-muted/50 transition group"
            @click="toggleSubProject(sub.dir_name)"
          >
            <div class="flex items-center space-x-1.5 truncate">
              <ChevronRight
                class="w-3.5 h-3.5 text-muted-foreground transition-transform"
                :class="isSubOpen(sub.dir_name) ? 'rotate-90' : ''"
              />
              <span class="font-medium text-foreground truncate">{{ sub.config.name }}</span>
              <span class="text-[10px] text-muted-foreground font-mono">({{ sub.requests.length }})</span>
            </div>

            <!-- 子项目操作 (Swagger 刷新、新增请求、删除) -->
            <div class="flex items-center space-x-1" @click.stop>
              <!-- Swagger 标志与一键无损刷新按钮 -->
              <div v-if="sub.config.swaggerSourceUrl" class="flex items-center space-x-1">
                <span class="text-[9px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                  Swagger
                </span>
                <button
                  @click="triggerRefreshSwagger(sub.dir_name)"
                  :disabled="refreshingDir === sub.dir_name"
                  class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition"
                  :title="`一键无损刷新 (${sub.config.swaggerSourceUrl})`"
                >
                  <RefreshCw
                    class="w-3 h-3 text-amber-400"
                    :class="refreshingDir === sub.dir_name ? 'animate-spin' : ''"
                  />
                </button>
              </div>

              <button
                @click="openSubProjectSettings(sub.dir_name)"
                class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition"
                title="配置子项目 (BaseURL、环境变量覆盖、Headers)"
              >
                <Settings2 class="w-3.5 h-3.5" />
              </button>
              <button
                @click="openNewRequestModal(sub.dir_name)"
                class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition"
                title="在子项目下新建请求"
              >
                <Plus class="w-3.5 h-3.5" />
              </button>
              <button
                @click="promptDeleteSubProject(sub.dir_name, sub.config.name)"
                class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition"
                title="删除子项目"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <!-- 子项目下的请求列表 (支持 Swagger Tag / 目录分组与折叠) -->
          <div v-if="isSubOpen(sub.dir_name)" class="pl-2 bg-background/30 text-xs">
            <!-- 1. 若存在分组，按目录折叠展示 -->
            <template v-if="getSubProjectGroups(sub.requests).hasGroups">
              <div
                v-for="grp in getSubProjectGroups(sub.requests).groups"
                :key="grp.name"
                class="py-0.5"
              >
                <!-- 分组标题栏 -->
                <div
                  @click="toggleGroup(sub.dir_name, grp.name)"
                  class="flex items-center justify-between py-1 px-1.5 rounded cursor-pointer hover:bg-muted/50 transition group/grp text-muted-foreground hover:text-foreground select-none"
                >
                  <div class="flex items-center space-x-1.5 truncate">
                    <ChevronRight
                      class="w-3 h-3 text-muted-foreground/60 transition-transform duration-150"
                      :class="isGroupOpen(sub.dir_name, grp.name) ? 'rotate-90' : ''"
                    />
                    <Folder class="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
                    <span class="font-medium text-[11px] truncate">{{ grp.name }}</span>
                  </div>
                  <span class="text-[9px] text-muted-foreground font-mono bg-muted/80 px-1.5 py-0.2 rounded-full">
                    {{ grp.requests.length }}
                  </span>
                </div>

                <!-- 分组内的接口项 -->
                <div
                  v-if="isGroupOpen(sub.dir_name, grp.name)"
                  class="pl-3.5 divide-y divide-border/20 border-l border-border/40 ml-2.5 my-0.5"
                >
                  <div
                    v-for="req in grp.requests"
                    :key="req.id || req.fileName"
                    @click="tabStore.openTab(req, sub.dir_name)"
                    class="flex items-center justify-between py-1.5 pr-2 pl-1 cursor-pointer hover:bg-muted/40 transition group"
                  >
                    <div class="flex items-center space-x-2 truncate">
                      <span class="font-mono font-bold text-[10px]" :class="getMethodColor(req.method)">
                        {{ req.method }}
                      </span>
                      <span
                        class="truncate text-[11px] font-medium"
                        :class="req.name.includes('[已下线]') ? 'text-muted-foreground line-through opacity-70' : 'text-foreground/90'"
                        :title="req.name || req.path"
                      >
                        {{ req.name || req.path }}
                      </span>
                    </div>

                    <div class="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition shrink-0" @click.stop>
                      <button
                        @click.stop="promptRenameRequest(sub.dir_name, req)"
                        class="p-0.5 rounded text-muted-foreground/60 hover:text-primary transition"
                        title="重命名接口"
                      >
                        <Edit3 class="w-3 h-3" />
                      </button>
                      <button
                        @click.stop="promptDeleteRequest(sub.dir_name, req)"
                        class="p-0.5 rounded text-muted-foreground/60 hover:text-destructive transition"
                        title="删除接口"
                      >
                        <Trash2 class="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 未分组的请求 (若有，作为"其他接口"分组折叠管理) -->
              <div v-if="getSubProjectGroups(sub.requests).ungrouped.length > 0" class="py-0.5">
                <div
                  @click="toggleGroup(sub.dir_name, '__other__')"
                  class="flex items-center justify-between py-1 px-1.5 rounded cursor-pointer hover:bg-muted/50 transition group/grp text-muted-foreground hover:text-foreground select-none"
                >
                  <div class="flex items-center space-x-1.5 truncate">
                    <ChevronRight
                      class="w-3 h-3 text-muted-foreground/60 transition-transform duration-150"
                      :class="isGroupOpen(sub.dir_name, '__other__') ? 'rotate-90' : ''"
                    />
                    <Folder class="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                    <span class="font-medium text-[11px] truncate">其他接口</span>
                  </div>
                  <span class="text-[9px] text-muted-foreground font-mono bg-muted/80 px-1.5 py-0.2 rounded-full">
                    {{ getSubProjectGroups(sub.requests).ungrouped.length }}
                  </span>
                </div>

                <div
                  v-if="isGroupOpen(sub.dir_name, '__other__')"
                  class="pl-3.5 divide-y divide-border/20 border-l border-border/40 ml-2.5 my-0.5"
                >
                  <div
                    v-for="req in getSubProjectGroups(sub.requests).ungrouped"
                    :key="req.id || req.fileName"
                    @click="tabStore.openTab(req, sub.dir_name)"
                    class="flex items-center justify-between py-1.5 pr-2 pl-1 cursor-pointer hover:bg-muted/40 transition group"
                  >
                    <div class="flex items-center space-x-2 truncate">
                      <span class="font-mono font-bold text-[10px]" :class="getMethodColor(req.method)">
                        {{ req.method }}
                      </span>
                      <span
                        class="truncate text-[11px] font-medium"
                        :class="req.name.includes('[已下线]') ? 'text-muted-foreground line-through opacity-70' : 'text-foreground/90'"
                        :title="req.name || req.path"
                      >
                        {{ req.name || req.path }}
                      </span>
                    </div>

                    <div class="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition shrink-0" @click.stop>
                      <button
                        @click.stop="promptRenameRequest(sub.dir_name, req)"
                        class="p-0.5 rounded text-muted-foreground/60 hover:text-primary transition"
                        title="重命名接口"
                      >
                        <Edit3 class="w-3 h-3" />
                      </button>
                      <button
                        @click.stop="promptDeleteRequest(sub.dir_name, req)"
                        class="p-0.5 rounded text-muted-foreground/60 hover:text-destructive transition"
                        title="删除接口"
                      >
                        <Trash2 class="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- 2. 若全未分组，保持经典平铺展示 -->
            <template v-else>
              <div class="divide-y divide-border/40">
                <div
                  v-for="req in sub.requests"
                  :key="req.id || req.fileName"
                  @click="tabStore.openTab(req, sub.dir_name)"
                  class="flex items-center justify-between py-1.5 pr-2 pl-1 cursor-pointer hover:bg-muted/40 transition group"
                >
                  <div class="flex items-center space-x-2 truncate">
                    <span class="font-mono font-bold text-[10px]" :class="getMethodColor(req.method)">
                      {{ req.method }}
                    </span>
                    <span
                      class="truncate text-[11px] font-medium"
                      :class="req.name.includes('[已下线]') ? 'text-muted-foreground line-through opacity-70' : 'text-foreground/90'"
                      :title="req.name || req.path"
                    >
                      {{ req.name || req.path }}
                    </span>
                  </div>

                  <div class="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition shrink-0" @click.stop>
                    <button
                      @click.stop="promptRenameRequest(sub.dir_name, req)"
                      class="p-0.5 rounded text-muted-foreground/60 hover:text-primary transition"
                      title="重命名接口"
                    >
                      <Edit3 class="w-3 h-3" />
                    </button>
                    <button
                      @click.stop="promptDeleteRequest(sub.dir_name, req)"
                      class="p-0.5 rounded text-muted-foreground/60 hover:text-destructive transition"
                      title="删除接口"
                    >
                      <Trash2 class="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </template>

            <div v-if="sub.requests.length === 0" class="py-2 text-center text-[10px] text-muted-foreground/60">
              空模块，点击上方 + 添加请求
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>

    <!-- 2. 历史记录视图 -->
    <div v-else class="flex-1 flex flex-col overflow-hidden">
      <div class="p-2 border-b border-border flex items-center justify-between shrink-0 bg-muted/20">
        <span class="text-[11px] font-medium text-muted-foreground">最近执行历史 (上限 200)</span>
        <button
          @click="projectStore.clearHistory"
          class="text-[10px] text-muted-foreground hover:text-destructive transition"
        >
          清空
        </button>
      </div>

      <div class="flex-1 overflow-y-auto divide-y divide-border/60">
        <div
          v-for="h in projectStore.history"
          :key="h.id"
          class="p-2.5 hover:bg-muted/30 cursor-pointer transition space-y-1"
          @click="loadHistoryToEditor(h)"
        >
          <div class="flex items-center justify-between">
            <span class="font-mono font-bold text-[10px]" :class="getMethodColor(h.method as any)">
              {{ h.method }}
            </span>
            <span class="font-mono text-[10px]" :class="h.status >= 200 && h.status < 300 ? 'text-emerald-400' : 'text-rose-400'">
              {{ h.status }} ({{ h.durationMs }}ms)
            </span>
          </div>
          <div class="text-[11px] text-foreground font-mono truncate" :title="h.url">
            {{ h.url }}
          </div>
          <div class="text-[10px] text-muted-foreground/60">
            {{ new Date(h.timestamp).toLocaleTimeString() }}
          </div>
        </div>

        <div v-if="projectStore.history.length === 0" class="py-6 text-center text-xs text-muted-foreground/60">
          暂无请求历史
        </div>
      </div>
    </div>

    <!-- 操作结果通知 Toast -->
    <div
      v-if="toastMessage"
      class="absolute bottom-3 left-3 right-3 p-2.5 rounded-lg bg-card border border-border shadow-lg flex items-center space-x-2 text-xs z-50 animate-in fade-in slide-in-from-bottom-2"
    >
      <CheckCircle2 v-if="!toastIsError" class="w-4 h-4 text-emerald-400 shrink-0" />
      <AlertCircle v-else class="w-4 h-4 text-destructive shrink-0" />
      <span class="text-foreground leading-tight">{{ toastMessage }}</span>
    </div>

    <!-- 弹窗：导入 Swagger / OpenAPI -->
    <div
      v-if="showSwaggerModal"
      class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div class="bg-card border border-border rounded-xl p-5 w-full max-w-md space-y-4 shadow-xl">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-sm">导入 Swagger / OpenAPI 文档</h3>
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">v2.0 / v3.0 / v3.1</span>
        </div>

        <div class="space-y-3 text-xs">
          <div>
            <label class="text-muted-foreground block mb-1">文档来源 URL 或本地文件路径</label>
            <input
              v-model="swaggerSourceUrl"
              type="text"
              placeholder="http://localhost:8080/v3/api-docs 或 https://petstore.swagger.io/v2/swagger.json"
              class="w-full p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary font-mono text-[11px]"
            />
          </div>

          <div>
            <label class="text-muted-foreground block mb-1">导入至子项目模块</label>
            <div class="flex items-center space-x-2">
              <select
                v-model="swaggerTargetSubDir"
                class="flex-1 p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="__NEW__">+ 创建新子项目模块</option>
                <option
                  v-for="sub in projectStore.subProjects"
                  :key="sub.dir_name"
                  :value="sub.dir_name"
                >
                  {{ sub.config.name }} ({{ sub.dir_name }})
                </option>
              </select>
            </div>
          </div>

          <div v-if="swaggerTargetSubDir === '__NEW__'" class="space-y-2 p-2.5 rounded-lg bg-muted/20 border border-border">
            <div>
              <label class="text-muted-foreground block mb-1 text-[11px]">新建模块名称</label>
              <input
                v-model="swaggerNewSubName"
                type="text"
                placeholder="用户中心 API"
                class="w-full p-1.5 rounded bg-background border border-border text-xs"
              />
            </div>
            <div>
              <label class="text-muted-foreground block mb-1 text-[11px]">文件夹名 (英文)</label>
              <input
                v-model="swaggerNewSubDir"
                type="text"
                placeholder="user_api"
                class="w-full p-1.5 rounded bg-background border border-border text-xs font-mono"
              />
            </div>
          </div>

          <div class="text-[11px] text-muted-foreground/80 leading-relaxed bg-primary/5 border border-primary/10 p-2.5 rounded-lg space-y-1">
            <div class="font-medium text-primary">💡 智能导入与无损合并规则：</div>
            <div>• <b>自动分类分组</b>：按 Swagger Tags 归类到目录分组中，支持在左侧折叠查看</div>
            <div>• <b>自动同步 BaseURL</b>：若文档包含服务地址，自动更新至主目录 project.json</div>
            <div>• <b>已有接口</b>：无损保留此前填写的具体测试参数值与自定义 Header</div>
            <div>• <b>新增接口</b>：自动按分组添加到该子项目</div>
            <div>• <b>已删除接口</b>：标记为 <code class="text-amber-400 font-mono">[已下线]</code>，坚决不删本地文件</div>
          </div>
        </div>

        <div class="flex justify-end space-x-2 pt-2">
          <button
            @click="showSwaggerModal = false"
            class="px-3 py-1.5 rounded text-xs text-muted-foreground hover:bg-muted"
          >
            取消
          </button>
          <button
            @click="confirmImportSwagger"
            :disabled="importingSwagger || !swaggerSourceUrl.trim()"
            class="px-4 py-1.5 rounded text-xs bg-primary text-primary-foreground font-medium hover:bg-primary/90 flex items-center space-x-1.5 disabled:opacity-50"
          >
            <Loader2 v-if="importingSwagger" class="w-3.5 h-3.5 animate-spin" />
            <span>{{ importingSwagger ? '拉取解析中...' : '开始导入' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 弹窗：新建子项目 -->
    <div
      v-if="showNewSubprojectModal"
      class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div class="bg-card border border-border rounded-xl p-5 w-full max-w-sm space-y-4 shadow-xl">
        <h3 class="font-semibold text-sm">新建子项目模块</h3>
        <div class="space-y-3 text-xs">
          <div>
            <label class="text-muted-foreground block mb-1">模块名称 (如 用户中心 / Auth)</label>
            <input
              v-model="newSubName"
              type="text"
              placeholder="Auth Service"
              class="w-full p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label class="text-muted-foreground block mb-1">文件夹名 (英文小写)</label>
            <input
              v-model="newSubDir"
              type="text"
              placeholder="auth_service"
              class="w-full p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary font-mono"
            />
          </div>
          <div>
            <label class="text-muted-foreground block mb-1">模块 BaseURL / 路径前缀 (可选)</label>
            <input
              v-model="newSubBase"
              type="text"
              placeholder="/auth 或 https://auth.api.com"
              class="w-full p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary font-mono"
            />
          </div>
        </div>

        <div class="flex justify-end space-x-2 pt-2">
          <button
            @click="showNewSubprojectModal = false"
            class="px-3 py-1.5 rounded text-xs text-muted-foreground hover:bg-muted"
          >
            取消
          </button>
          <button
            @click="confirmCreateSubproject"
            class="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground font-medium hover:bg-primary/90"
          >
            创建
          </button>
        </div>
      </div>
    </div>

    <!-- 弹窗：新建请求 -->
    <div
      v-if="showNewRequestModal"
      class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div class="bg-card border border-border rounded-xl p-5 w-full max-w-sm space-y-4 shadow-xl">
        <h3 class="font-semibold text-sm">新建请求到子项目</h3>
        <div class="space-y-3 text-xs">
          <div>
            <label class="text-muted-foreground block mb-1">请求名称</label>
            <input
              v-model="newReqName"
              type="text"
              placeholder="获取用户资料"
              class="w-full p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label class="text-muted-foreground block mb-1">相对路径</label>
            <input
              v-model="newReqPath"
              type="text"
              placeholder="/users/{id}"
              class="w-full p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary font-mono"
            />
          </div>
          <div>
            <label class="text-muted-foreground block mb-1">请求方法</label>
            <select
              v-model="newReqMethod"
              class="w-full p-2 rounded bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary font-mono"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
              <option value="PATCH">PATCH</option>
            </select>
          </div>
        </div>

        <div class="flex justify-end space-x-2 pt-2">
          <button
            @click="showNewRequestModal = false"
            class="px-3 py-1.5 rounded text-xs text-muted-foreground hover:bg-muted"
          >
            取消
          </button>
          <button
            @click="confirmCreateRequest"
            class="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground font-medium hover:bg-primary/90"
          >
            确定
          </button>
        </div>
      </div>
    </div>

    <!-- 子项目配置模态框 (BaseURL、环境变量覆盖、Headers) -->
    <SubProjectSettingsModal
      v-model="showSubSettingsModal"
      :dir-name="targetSubDirForSettings"
    />

    <!-- 主项目全局配置模态框 (BaseURL、项目名称) -->
    <ProjectSettingsModal
      v-model="showProjectSettingsModal"
      @saved="showToast('主项目配置已保存至 project.json')"
    />

    <!-- 模态框：重命名接口 -->
    <div
      v-if="reqToRename"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div class="bg-card border border-border rounded-xl p-5 w-full max-w-sm space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <Edit3 class="w-4 h-4 text-primary" />
            <h3 class="font-semibold text-sm">重命名接口</h3>
          </div>
          <span class="text-[10px] text-muted-foreground font-mono truncate max-w-[150px]">{{ reqToRename.fileName }}</span>
        </div>

        <div class="space-y-1.5 text-xs">
          <label class="text-muted-foreground font-medium">接口新名称</label>
          <input
            v-model="renameNewTitle"
            type="text"
            ref="renameInputRef"
            @keydown.enter="confirmRenameRequest"
            placeholder="输入接口名称"
            class="w-full text-xs px-3 py-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
          />
        </div>

        <div class="flex justify-end space-x-2 pt-1 text-xs">
          <button
            @click="reqToRename = null"
            class="px-3 py-1.5 rounded hover:bg-muted text-muted-foreground transition"
          >
            取消
          </button>
          <button
            @click="confirmRenameRequest"
            :disabled="!renameNewTitle.trim()"
            class="px-4 py-1.5 rounded bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition shadow-sm disabled:opacity-50"
          >
            确定
          </button>
        </div>
      </div>
    </div>

    <!-- 模态框：删除确认 (替代受 WKWebView 限制的原生 confirm) -->
    <div
      v-if="itemToDelete"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div class="bg-card border border-border rounded-xl p-5 w-full max-w-sm space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
        <div class="flex items-center space-x-3">
          <div class="w-8 h-8 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
            <AlertTriangle class="w-4 h-4" />
          </div>
          <div>
            <h3 class="font-semibold text-sm text-foreground">
              {{ itemToDelete.type === 'subproject' ? '删除子项目模块' : '删除接口文件' }}
            </h3>
            <p class="text-[11px] text-muted-foreground mt-0.5">
              此操作不可撤销，将从本地磁盘永久删除对应文件
            </p>
          </div>
        </div>

        <div class="p-2.5 rounded-lg bg-muted/40 border border-border/60 text-xs font-mono break-all text-muted-foreground">
          {{ itemToDelete.name }}
        </div>

        <div class="flex justify-end space-x-2 pt-1 text-xs">
          <button
            @click="itemToDelete = null"
            class="px-3 py-1.5 rounded hover:bg-muted text-muted-foreground transition"
          >
            取消
          </button>
          <button
            @click="confirmDeleteItem"
            class="px-4 py-1.5 rounded bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90 transition shadow-sm"
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import {
  FolderTree, History, FolderOpen, FolderPlus, Plus, Trash2, ChevronRight, FolderCode,
  FileDown, RefreshCw, CheckCircle2, AlertCircle, Loader2, Settings2, Folder, FolderCog,
  UnfoldVertical, FoldVertical, Edit3, AlertTriangle
} from 'lucide-vue-next'
import { onKeyStroke } from '@vueuse/core'
import { useProjectStore } from '@/stores/projectStore'
import { useTabStore } from '@/stores/tabStore'
import { useRequestStore } from '@/stores/requestStore'
import SubProjectSettingsModal from '@/components/modals/SubProjectSettingsModal.vue'
import ProjectSettingsModal from '@/components/modals/ProjectSettingsModal.vue'
import type { HttpMethod, HistoryItem, ApiRequest } from '@/types'

const projectStore = useProjectStore()
const tabStore = useTabStore()
const requestStore = useRequestStore()

const sidebarView = ref<'collections' | 'history'>('collections')
const openSubprojects = ref<Set<string>>(new Set())
const showProjectSettingsModal = ref(false)

// 仅在首次载入项目时默认展开子项目，后续完整保留用户的折叠/展开操作
const hasInitializedSubs = ref(false)
watch(
  () => projectStore.projectPath,
  () => {
    hasInitializedSubs.value = false
  }
)
watch(
  () => projectStore.subProjects,
  (subs) => {
    if (!hasInitializedSubs.value && subs && subs.length > 0) {
      for (const sub of subs) {
        openSubprojects.value.add(sub.dir_name)
      }
      hasInitializedSubs.value = true
    }
  },
  { immediate: true }
)

// 新建子项目弹窗状态
const showNewSubprojectModal = ref(false)
const newSubName = ref('')
const newSubDir = ref('')
const newSubBase = ref('')

// 新建请求弹窗状态
const showNewRequestModal = ref(false)
const targetSubDir = ref('')
const newReqName = ref('')
const newReqPath = ref('/api/v1/resource')
const newReqMethod = ref<HttpMethod>('GET')

// Swagger 导入弹窗状态
const showSwaggerModal = ref(false)
const swaggerSourceUrl = ref('')
const swaggerTargetSubDir = ref('__NEW__')
const swaggerNewSubName = ref('Swagger API')
const swaggerNewSubDir = ref('swagger_api')
const importingSwagger = ref(false)
const refreshingDir = ref<string | null>(null)

// Toast 状态
const toastMessage = ref('')
const toastIsError = ref(false)

// 子项目配置模态框状态
const showSubSettingsModal = ref(false)
const targetSubDirForSettings = ref('')

function openSubProjectSettings(dirName: string) {
  targetSubDirForSettings.value = dirName
  showSubSettingsModal.value = true
}

function showToast(msg: string, isError = false) {
  toastMessage.value = msg
  toastIsError.value = isError
  setTimeout(() => {
    toastMessage.value = ''
  }, 4000)
}

function isSubOpen(dir: string) {
  return openSubprojects.value.has(dir)
}

function toggleSubProject(dir: string) {
  if (openSubprojects.value.has(dir)) {
    openSubprojects.value.delete(dir)
  } else {
    openSubprojects.value.add(dir)
  }
}

// 接口目录与分组 (Swagger Tags / Folders) 折叠状态
interface RequestGroup {
  name: string
  requests: ApiRequest[]
}

const collapsedGroups = ref<Set<string>>(new Set())

function isGroupOpen(subDir: string, groupName: string) {
  return !collapsedGroups.value.has(`${subDir}:${groupName}`)
}

function toggleGroup(subDir: string, groupName: string) {
  const key = `${subDir}:${groupName}`
  if (collapsedGroups.value.has(key)) {
    collapsedGroups.value.delete(key)
  } else {
    collapsedGroups.value.add(key)
  }
}

function getSubProjectGroups(requests: ApiRequest[]): { groups: RequestGroup[]; ungrouped: ApiRequest[]; hasGroups: boolean } {
  const groupMap = new Map<string, ApiRequest[]>()
  const ungrouped: ApiRequest[] = []

  for (const req of requests) {
    if (req.group && req.group.trim()) {
      const gName = req.group.trim()
      if (!groupMap.has(gName)) {
        groupMap.set(gName, [])
      }
      groupMap.get(gName)!.push(req)
    } else {
      ungrouped.push(req)
    }
  }

  const groups: RequestGroup[] = []
  for (const [name, reqs] of groupMap.entries()) {
    groups.push({ name, requests: reqs })
  }

  return {
    groups,
    ungrouped,
    hasGroups: groups.length > 0
  }
}

function openNewRequestModal(dir: string) {
  targetSubDir.value = dir
  newReqName.value = '新请求'
  newReqPath.value = '/get'
  newReqMethod.value = 'GET'
  showNewRequestModal.value = true
}

function openImportSwaggerModal() {
  if (projectStore.subProjects.length > 0) {
    swaggerTargetSubDir.value = projectStore.currentSubProjectDir || projectStore.subProjects[0].dir_name
  } else {
    swaggerTargetSubDir.value = '__NEW__'
  }
  showSwaggerModal.value = true
}

async function confirmImportSwagger() {
  if (!swaggerSourceUrl.value.trim()) return
  importingSwagger.value = true

  try {
    let targetDir = swaggerTargetSubDir.value
    if (targetDir === '__NEW__') {
      const cleanDir = swaggerNewSubDir.value.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'swagger_api'
      await projectStore.createSubProject(swaggerNewSubName.value.trim() || 'Swagger 接口', cleanDir)
      targetDir = cleanDir
    }

    const stats = await projectStore.importSwagger(targetDir, swaggerSourceUrl.value.trim(), true)
    if (stats) {
      openSubprojects.value.add(targetDir)
      showSwaggerModal.value = false
      showToast(`Swagger 导入成功：新增 ${stats.added} 个，更新 ${stats.updated} 个，共 ${stats.total} 个接口`)
    }
  } catch (err: any) {
    showToast(`导入失败: ${err?.message || err}`, true)
  } finally {
    importingSwagger.value = false
  }
}

async function triggerRefreshSwagger(subDir: string) {
  refreshingDir.value = subDir
  try {
    const stats = await projectStore.refreshSwagger(subDir)
    if (stats) {
      showToast(`接口刷新完成：更新 ${stats.updated} 个，新增 ${stats.added} 个，已下线 ${stats.deprecated} 个`)
    }
  } catch (err: any) {
    showToast(`刷新失败: ${err?.message || err}`, true)
  } finally {
    refreshingDir.value = null
  }
}

// 全局快捷键: Cmd/Ctrl + R 刷新当前子项目的 Swagger
onKeyStroke('r', (e) => {
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault()
    const target = projectStore.currentSubProjectDir || projectStore.subProjects[0]?.dir_name
    if (target) {
      triggerRefreshSwagger(target)
    }
  }
})

async function confirmCreateSubproject() {
  if (!newSubDir.value.trim()) return
  await projectStore.createSubProject(newSubName.value, newSubDir.value, newSubBase.value)
  openSubprojects.value.add(newSubDir.value.trim())
  showNewSubprojectModal.value = false
  newSubName.value = ''
  newSubDir.value = ''
  newSubBase.value = ''
}

async function confirmCreateRequest() {
  if (!targetSubDir.value) return
  const reqId = crypto.randomUUID()
  const fileName = `${newReqName.value.trim().replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_') || 'req'}_${Date.now().toString().slice(-4)}`

  const newReq: ApiRequest = {
    id: reqId,
    name: newReqName.value.trim() || '未命名请求',
    method: newReqMethod.value,
    path: newReqPath.value.trim() || '/get',
    pathParams: [],
    queryParams: [],
    headers: [],
    bodyType: 'none',
    bodyContent: '',
    subProjectId: targetSubDir.value,
    fileName: `${fileName}.json`
  }

  await projectStore.saveRequest(targetSubDir.value, fileName, newReq)
  showNewRequestModal.value = false
  tabStore.openTab(newReq, targetSubDir.value)
}

// 树形结构展开/折叠与接口总数
const totalRequestsCount = computed(() => {
  return projectStore.subProjects.reduce((sum, s) => sum + s.requests.length, 0)
})

function expandAllTree() {
  for (const sub of projectStore.subProjects) {
    openSubprojects.value.add(sub.dir_name)
  }
  collapsedGroups.value.clear()
}

function collapseAllTree() {
  // 折叠全部：仅折叠子项目内部的分组目录；不修改子项目本身的折叠状态（折叠的保持折叠，展开的保持展开）
  for (const sub of projectStore.subProjects) {
    const { groups, ungrouped } = getSubProjectGroups(sub.requests)
    for (const grp of groups) {
      collapsedGroups.value.add(`${sub.dir_name}:${grp.name}`)
    }
    if (ungrouped.length > 0) {
      collapsedGroups.value.add(`${sub.dir_name}:__other__`)
    }
  }
}

// 删除确认模态框状态 (彻底解决 WKWebView 原生 confirm 无弹窗问题)
interface PendingDelete {
  type: 'request' | 'subproject'
  subDir: string
  fileName?: string
  name: string
}
const itemToDelete = ref<PendingDelete | null>(null)

function promptDeleteRequest(subDir: string, req: ApiRequest) {
  itemToDelete.value = {
    type: 'request',
    subDir,
    fileName: req.fileName || `${req.id}.json`,
    name: req.name || req.path
  }
}

function promptDeleteSubProject(subDir: string, subName: string) {
  itemToDelete.value = {
    type: 'subproject',
    subDir,
    name: `子项目模块: ${subName} (${subDir})`
  }
}

async function confirmDeleteItem() {
  if (!itemToDelete.value) return
  const item = itemToDelete.value
  itemToDelete.value = null

  try {
    if (item.type === 'request' && item.fileName) {
      await projectStore.deleteRequest(item.subDir, item.fileName)
      // 若当前标签页打开了该接口，自动关闭
      const openTab = tabStore.tabs.find(t => t.fileName === item.fileName || t.requestId === item.fileName)
      if (openTab) {
        tabStore.closeTab(openTab.id)
      }
      showToast(`接口 [${item.name}] 已成功删除`)
    } else if (item.type === 'subproject') {
      await projectStore.deleteSubProject(item.subDir)
      showToast(`子项目 [${item.name}] 已成功删除`)
    }
  } catch (err: any) {
    showToast(`删除失败: ${err?.message || err}`, true)
  }
}

// 接口重命名模态框状态
interface RenameState {
  subDir: string
  fileName: string
  req: ApiRequest
}
const reqToRename = ref<RenameState | null>(null)
const renameNewTitle = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)

function promptRenameRequest(subDir: string, req: ApiRequest) {
  reqToRename.value = {
    subDir,
    fileName: req.fileName || `${req.id}.json`,
    req
  }
  renameNewTitle.value = req.name || ''
  nextTick(() => {
    renameInputRef.value?.focus()
    renameInputRef.value?.select()
  })
}

async function confirmRenameRequest() {
  if (!reqToRename.value || !renameNewTitle.value.trim()) return
  const { subDir, fileName, req } = reqToRename.value
  const newName = renameNewTitle.value.trim()
  reqToRename.value = null

  try {
    req.name = newName
    await projectStore.saveRequest(subDir, fileName, req)

    // 同步更新打开的 Tab 标题
    const openTab = tabStore.tabs.find(t => t.fileName === fileName || t.requestId === req.id)
    if (openTab) {
      openTab.title = newName
    }
    showToast(`接口已重命名为: ${newName}`)
  } catch (err: any) {
    showToast(`重命名失败: ${err?.message || err}`, true)
  }
}

function loadHistoryToEditor(item: HistoryItem) {
  requestStore.method = item.method as HttpMethod
  requestStore.path = item.url
  requestStore.send()
}

function getMethodColor(method: HttpMethod) {
  switch (method) {
    case 'GET': return 'text-emerald-400'
    case 'POST': return 'text-amber-400'
    case 'PUT': return 'text-blue-400'
    case 'DELETE': return 'text-rose-400'
    case 'PATCH': return 'text-purple-400'
    default: return 'text-muted-foreground'
  }
}
</script>
