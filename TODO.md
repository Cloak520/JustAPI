# JustAPI 开发任务清单 (TODO)

> 本清单基于 **Tauri 2.0 (Rust) + Vue 3 + TypeScript + Tailwind CSS + CodeMirror 6** 构建。  
> 核心定位：**专精 RESTful、轻量秒开、本地自选目录存储 (Folder-as-Project)、项目-子项目级联继承、Swagger URL 绑定与一键刷新、Params/Headers 文本与表格双模式编辑**。

---

## 📅 里程碑概览

- [x] **Phase 0**: 技术准备与跨平台脚手架（含 Windows 内存裁剪参数配置）
- [x] **Phase 1**: 核心 RESTful 请求构建与响应查看（MVP：双模式编辑、BaseURL 自动拼接、CodeMirror 6、请求取消、Headers 补全）
- [x] **Phase 2**: 本地自选目录与项目-子项目继承体系（Directory as Project、三维级联继承、多标签会话恢复、Git 隔离历史）
- [x] **Phase 3**: Swagger / OpenAPI 导入、源 URL 记录与一键无损刷新（Swagger Engine、Smart Merge 无损合并）
- [x] **Phase 4**: 环境变量多层级覆盖与动态插值系统（Environment Engine、内置动态变量、来源徽章追踪）
- [x] **Phase 5**: 常用快捷与轻量网络配置（全局快捷键防冲突、Cookie Jar、SSL 忽略、网络代理）
- [x] **Phase 6**: 双端构建、打包与性能基准验收（macOS & Windows 80MB 级内存达标）
- [x] **Phase 7**: 侧边栏宽度拖拽调整与多主题外观切换（深色 / 浅色 / 跟随系统）

---

## 📋 详细任务清单

### Phase 0: 技术准备与跨平台脚手架 ✅
- [x] **环境检查与项目初始化**
  - [x] 安装并验证 Rust 工具链 (`rustc`, `cargo`)
  - [x] 安装并验证 Node.js / pnpm 环境
  - [x] 使用 `create-tauri-app` 初始化项目工程 (Tauri 2.0 + Vue 3 + Vite + TypeScript)
- [x] **前端基础设施搭建**
  - [x] 配置 Tailwind CSS 样式系统与暗黑模式 (Dark Mode) 支持
  - [x] 引入轻量 UI 组件库 `shadcn-vue` (基于 Radix Vue，按需引入，零额外 Runtime 负担)
  - [x] 引入图标库 `lucide-vue-next`
  - [x] 引入轻量代码编辑器组件 (`@codemirror/view` + `@codemirror/lang-json`，整包仅 ~200KB，秒级加载)
  - [x] 配置全局状态管理 `Pinia` 并引入 `@vueuse/core` 实用函数库
- [x] **Rust 原生后端基础设施**
  - [x] 配置 `reqwest`（启用 gzip, brotli, json, multipart, cookies 特性）与 `tokio` 异步运行时
  - [x] 配置 `serde` / `serde_json` 实现前后端数据高效序列化与**高性能异步 JSON 格式化/压缩引擎** (`serde_json::to_string_pretty` / `serde_json::to_string`)
  - [x] 验证 Tauri 2.0 IPC 通信机制 (`tauri::command` 与前端 `invoke`)
  - [x] **Windows WebView2 内存裁剪配置**：设置 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`（禁用独立 GPU 进程、限制单渲染进程），严控 Windows 内存开销

---

### Phase 1: 核心 RESTful 请求构建与响应查看 (MVP) ✅
- [x] **RESTful 请求地址与 BaseURL 智能拼接**
  - [x] HTTP Method 下拉选择框 (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)，配以标准语义化色彩标签
  - [x] URL 输入栏：
    - [x] 支持输入相对路径（如 `/api/v1/users/{id}`）或独立完整 URL
    - [x] 实时显示继承解析后的完整 BaseURL 前缀与最终拼接 URL 预览
    - [x] 自动解析 URL 中的 query 参数并同步至 Params 表格与文本模式
    - [x] **Path Variables 路径参数智能解析**：自动检测 URL 中的 `{param}` 或 `:param`，在 Params 面板生成对应输入行，发送请求时自动完成路径值替换
  - [x] 「Send」发送按钮及全局唯一快捷键（`Cmd+Enter` / `Ctrl+Enter`）支持
  - [x] **请求中途主动取消 (Cancel Request)**：后端 reqwest 执行接入 Tokio `AbortHandle`，前端提供即时取消按钮与状态复位
- [x] **Query Params 编辑器（表格 vs 纯文本双模式）**
  - [x] **表格模式 (Key-Value Grid)**：支持勾选启用/禁用、Key、Value、Description、行删除与自动追加空行
  - [x] **纯文本模式 (Bulk Edit)**：
    - [x] 多行文本直接输入/整段粘贴（支持 `key=value` 或 `key: value` 格式）
    - [x] 切换回表格模式时自动解析语法并回填表格；表格修改时同步反向生成文本
- [x] **Headers 编辑器 & 极简鉴权（表格 vs 纯文本双模式 + 智能补全）**
  - [x] 极简鉴权：不设冗余独立 Auth 面板，统一在 Headers 表格/文本中通过继承或局部配置实现 (如 `Authorization: Bearer {{token}}`)
  - [x] 继承状态标记（直观标注该 Header 来自「主项目全局继承」、「子项目继承」还是「本请求自定义覆盖」）
  - [x] **智能自动补全组件 (`AutocompleteInput.vue`)**：
    - [x] 废除 WebKit 原生 `<datalist>` 导致的下拉框选择后无法关闭的缺陷
    - [x] 使用 `<Teleport to="body">` 顶层浮层渲染，不受表格 `overflow-y-auto` 容器裁剪
    - [x] 选定即关（Instant Dismiss）与键盘方向键/回车/Tab 选定支持
    - [x] 选定 Header 键名后，光标自动平滑流转聚焦到当前行 Value 输入框
    - [x] Key-Value 智能联动联想（如 Content-Type 自动推荐 `application/json` 等，带中文功能注释）
  - [x] **纯文本模式 (Bulk Edit)**：支持多行格式（`Header-Key: Header-Value`）批量编辑与实时双向解析
- [x] **Body 编辑器 (RESTful 核心高频类型)**
  - [x] `none`: 无 Body
  - [x] `json`: 基于 CodeMirror 6 的 JSON 高效编辑器
    - [x] **严禁自动格式化**：输入、失焦、粘贴或发送时，绝不自动篡改用户原始排版与内容
    - [x] **显式按需格式化**：工具栏提供「格式化 (Prettify)」与「单行压缩 (Minify)」按钮（支持 `Shift+Alt+F`）
    - [x] **Rust `serde_json` 异步非阻塞执行**：通过 Tauri IPC 调用 Rust 后台工作线程，毫秒级流式处理大 JSON，前端 UI 零卡顿，不丢失长整型 (Snowflake ID) 精度
    - [x] 实时语法错误提示（基于 CodeMirror 6 Linter）
  - [x] `form-data`: 键值对表格（勾选「文件」类型时提供原生文件选择对话框 `pick_file`，支持一键选取本地绝对路径）
  - [x] `x-www-form-urlencoded`: 键值对表格
  - [x] `raw`: 纯文本格式输入
- [x] **原生 HTTP 转发层 (Rust Reqwest 引擎)**
  - [x] 编写 Rust 端 `send_rest_request` 命令，自动合并最终 URL 并发送
  - [x] 彻底规避浏览器跨域 (CORS) 限制
  - [x] 精确统计请求毫秒耗时 (Duration)、传输体积大小 (Body Size) 与 HTTP 状态码 (Status Code)
  - [x] 异常与网络超时捕获处理（DNS 失败、拒绝连接、超时等友好提示）
- [x] **响应查看器 (Response Viewer)**
  - [x] 响应状态栏：HTTP Status Code（根据 2xx/3xx/4xx/5xx 着色）、耗时（绿色/黄色/红色性能区间）、数据大小
  - [x] **Response Body 查看与超大保护**：
    - [x] CodeMirror 6 JSON 语法高亮与代码折叠/展开
    - [x] 关键字查找/搜索定位 (Search)
    - [x] 纯文本 (Raw) / 格式化 (Pretty) / 预览 (Preview) 视图切换
    - [x] **超大响应保护机制 (Large Response Protection)**：当返回数据 > 5MB 时自动截断预览（仅渲染前 1MB 文本），避免 DOM/编辑器假死，并提示「另存为本地文件」
    - [x] 一键复制响应内容到剪贴板
    - [x] 响应数据另存为本地文件（Tauri `rfd` 保存对话框，支持二进制流无损落盘）
  - [x] **Response Headers 查看**：只读表格展示服务端实际返回的响应头，支持关键字实时过滤与单项/全部复制
  - [x] **Response Cookies 查看**：结构化展示服务端 `Set-Cookie` 字段，支持名称、域名、路径过滤

---

### Phase 2: 本地自选目录与项目-子项目继承体系 (Local-First) ✅
- [x] **自由选择本地存储目录 (Folder-as-Project)**
  - [x] 支持通过原生文件选择对话框（`rfd`）选择任意本地文件夹作为主项目
  - [x] 欢迎页/启动页记录「最近打开的项目 (Recent Projects)」列表，一键快速载入
  - [x] 本地目录结构自动初始化：自动创建 `.justapi/project.json`
- [x] **项目与子项目树形管理 (Sidebar Tree)**
  - [x] 侧边栏展示：主项目 -> 子项目列表 (Modules / Services) -> 接口分组 (Tags/Directories) -> 具体请求
  - [x] 支持新建子项目模块、重命名、删除（带二次确认模态框，规避系统原生 confirm 拦截）
  - [x] 支持新建请求、重命名、拖拽移动归属、复制 (Duplicate)、删除
  - [x] 接口树全文搜索过滤（匹配名称、路径、方法与分组）
  - [x] 全部展开 / 全部折叠接口分组控制
  - [x] 快速保存当前未保存的请求 (`Cmd+S` / `Ctrl+S`)
- [x] **三维层级级联继承引擎 (Cascading Inheritance Engine)**
  - [x] **BaseURL 级联**：
    - [x] 主项目定义根 BaseURL（如 `https://api.dev.example.com`）
    - [x] 子项目配置：可选择「继承主项目 BaseURL」或「自定义独立 BaseURL」或「配置子路径前缀 (如 `/auth`)」
    - [x] 发送请求时按优先级级联计算：`Request BaseURL (若指定)` > `Sub-project BaseURL` > `Project BaseURL`
  - [x] **请求头 (Headers) 级联**：
    - [x] 主项目配置全局通用 Headers（如全局 `Authorization`, `X-App-ID`）
    - [x] 子项目配置：继承主项目 Headers，并允许追加子项目专属 Headers
    - [x] 请求级别合并策略：同名 Header 优先级为 `Request` > `Sub-project` > `Project`，界面高亮提示「覆盖继承」
  - [x] **多标签页 (Tabs) 状态同步与会话恢复 (Session Restore)**
    - [x] 多标签新建、切换、双击重命名、关闭（`Cmd+T`, `Cmd+W`）
    - [x] 未保存状态小圆点 (Dirty Indicator)
    - [x] 内存多副本克隆 (Duplicate Memory Tab)
    - [x] **应用重启会话状态恢复**：持久化 open tabs 与激活状态，窗口关闭前自动捕获实时草稿，冷启动无缝恢复
- [x] **多文件本地存储协议实现**
  - [x] 主项目配置：`.justapi/project.json`
  - [x] 子项目配置：`[sub-project]/.subproject.json`
  - [x] 请求定义文件：`[sub-project]/[group]/[request-name].json`
  - [x] **请求历史记录与 Git 隔离**：
    - [x] 项目初始化时自动维护根目录 `.gitignore`，将 `history.json` 自动写入忽略清单，避免污染团队代码库
    - [x] 历史记录持久化与丰富度增强：记录完整的请求头、请求体、URL、耗时与时间戳
    - [x] 历史记录支持关键字搜索过滤、单条删除与一键清空
    - [x] 点击历史记录直接全量还原回填到请求工作台（包含 Headers 与 Body）

---

### Phase 3: Swagger / OpenAPI 导入、源 URL 记录与一键无损刷新 ✅
- [x] **Swagger / OpenAPI 解析引擎**
  - [x] 支持 Swagger 2.0、OpenAPI 3.0 与 3.1 格式（支持 JSON 与 YAML）
  - [x] 支持从远程 HTTP/HTTPS URL 直接拉取导入 (如 `http://localhost:8080/v3/api-docs`)
  - [x] 支持从本地 Swagger 文件导入
  - [x] 智能解析：提取 BaseURL、Path、Method、Summary/Description、Tags、Query/Path/Header/Body 参数模板
- [x] **导入来源持久化记录**
  - [x] 导入时提示选择或自动创建目标子项目
  - [x] 将源 URL 持久化记录在 `.justapi/project.json` 或子项目 `.subproject.json` 的 `swaggerSourceUrl` 字段中
- [x] **一键无损刷新 API (Refresh API Engine)**
  - [x] 全局快捷键 `Cmd/Ctrl + R` 或子项目菜单「一键刷新接口」
  - [x] 重新根据记录的 URL 请求最新 Swagger 规范文档
  - [x] **智能差异对比与合并 (Smart Merge)**：
    - [x] 新增接口：自动添加到子项目目录
    - [x] 废弃接口：打上 `[Deprecated / 已下线]` 标签，**坚决不物理删除本地文件**，保护用户测试参数
    - [x] 已变更接口：更新 Path 与参数定义，**无损保留**用户已在 JustAPI 中填写的具体测试参数 Value 与自定义 Header

---

### Phase 4: 环境变量多层级覆盖与动态插值系统 ✅
- [x] **环境变量多级管理**
  - [x] 主项目级环境变量管理：支持创建多套环境配置（如 `Local`, `Dev`, `Test`, `Prod`）
  - [x] 子项目级环境变量覆盖：
    - [x] 子项目默认直接继承主项目选定环境的所有变量
    - [x] 支持在子项目内重写特定变量（子项目同名变量优先）
  - [x] 顶部导航栏提供当前全局环境快速切换下拉框
- [x] **模板语法解析引擎**
  - [x] 在 BaseURL、URL Path、Params、Headers、JSON Body 中支持 `{{variable_name}}` 动态插值
  - [x] 实时解析 URL 上的环境变量 Token，展示彩色来源徽章（系统变量、项目环境、子项目覆盖、未定义）
  - [x] 内置系统动态变量支持：
    - [x] `{{$guid}}`: 自动生成 UUID v4
    - [x] `{{$timestamp}}`: 当前 10 位时间戳 (秒)
    - [x] `{{$timestampMs}}`: 当前 13 位毫秒级时间戳
    - [x] `{{$randomInt}}`: 0~1000 随机整数

---

### Phase 5: 常用快捷与轻量网络配置 (RESTful 专精) ✅
- [x] **常用桌面全局快捷键**
  - [x] `Cmd/Ctrl + Enter`: 发送当前请求
  - [x] `Cmd/Ctrl + S`: 保存当前请求至子项目
  - [x] `Cmd/Ctrl + T`: 新建标签页
  - [x] `Cmd/Ctrl + W`: 关闭当前标签页
  - [x] `Cmd/Ctrl + \`: 展开/收起左侧边栏
  - [x] `Cmd/Ctrl + R`: 刷新当前子项目的 Swagger API
  - [x] `Cmd/Ctrl + F`: 快速聚焦侧边栏搜索框
  - [x] `Shift + Alt + F`: 单次按需美化 JSON Body
  - [x] **清理快捷键冲突**：统一收敛在 `App.vue` 唯一入口分发，彻底消除双重触发风险
- [x] **轻量 RESTful 网络进阶**
  - [x] **Cookie 管理 (Cookie Jar)**：支持自动捕获服务端 `Set-Cookie` 并持久化保持，请求时自动按域名注入
  - [x] **SSL / TLS 控制**：支持一键开启「忽略 SSL 证书校验」，规避自签名与局域网开发证书报错
  - [x] **网络代理 (Proxy)**：支持配置本地 HTTP/SOCKS 代理服务

---

### Phase 6: 双端构建、打包与性能基准验收 ✅
- [x] **双端 UI 质感与原生融合**
  - [x] macOS: 适配系统原生交通灯 (Traffic Lights) 沉浸式标题栏与全视窗无缝拖拽
  - [x] Windows: 定制美观无边框窗口 (Frameless Window) 与窗口最小化/最大化/关闭按钮
  - [x] 分栏高度自由调节：支持通过拖拽条调整请求区与响应区高度，双击恢复默认高度 (350px) 并自动持久化
- [x] **轻量化验收与性能基准达成**
  - [x] 冷启动时间验证：双端实测 ≤ 0.8 秒秒开
  - [x] 真实空闲内存占用：macOS WebKit 实测 ~45MB，Windows 实测 ~80MB
  - [x] 安装包大小：Release 体积严格控制在 ~18MB 左右

---

## 🚀 进阶功能规划

### Phase 7: 侧边栏宽度拖拽调整与多主题外观切换 ✅
- [x] **侧边栏宽度鼠标拖拽调整 (Resizable Sidebar)**
  - [x] 侧边栏右边界设置可拖拽手柄条，支持自由调整宽度 (200px ~ 600px，默认 288px)
  - [x] 宽度变动自动持久化到本地存储 (`localStorage`)，窗口重启后自动恢复记忆宽度
  - [x] 支持双击拖拽手柄一键重置为默认宽度 (288px)
  - [x] 拖拽时提供平滑视觉反馈与防误触选中文本保护
- [x] **多主题外观切换 (Theme Switcher)**
  - [x] 顶部导航栏提供直观的主题切换交互（深色 🌙 / 浅色 ☀️ / 跟随系统 💻）
  - [x] 主题选择自动持久化存储，支持应用启动即时生效
  - [x] 响应系统级外观变化（当设置为「跟随系统」时自动监听 OS 深色/浅色模式切换）
  - [x] CodeMirror 6 代码高亮与背景自适应亮暗主题无缝切换
- [x] **标签栏右键快捷上下文菜单 (Tab Bar Context Menu)**
  - [x] **复制 Tab**：在内存中克隆当前 Tab 副本并紧随插入，自动生成副本标题
  - [x] **在侧边栏快速定位文件**：自动保证侧边栏可见、展开对应子项目与分组折叠目录、平滑居中滚动并高亮该文件；对未保存的临时草稿提示引导保存
  - [x] **关闭其他标签页**：仅保留目标标签页，自动关闭其余所有 Tab（仅剩 1 个时自动置灰禁用）
  - [x] **关闭右侧标签页**：批量关闭目标标签页右侧的所有 Tab（最右侧 Tab 时自动置灰禁用）
  - [x] **全部关闭**：一键安全清空所有打开的标签页并复位为全新的默认请求 Tab

