# JustAPI 开发任务清单 (TODO)

> 本清单基于 **Tauri 2.0 (Rust) + Vue 3 + TypeScript + Tailwind CSS + CodeMirror 6** 构建。
> 核心定位：**专精 RESTful、轻量秒开、本地自选目录存储 (Folder-as-Project)、项目-子项目级联继承、Swagger URL 绑定与一键刷新、Params/Headers 文本与表格双模式编辑**。

---

## 📅 里程碑概览

- [x] **Phase 0**: 技术准备与跨平台脚手架（含 Windows 内存裁剪参数配置）
- [x] **Phase 1**: 核心 RESTful 请求与响应查看器（MVP：双模式编辑、BaseURL 自动拼接、CodeMirror 6）
- [ ] **Phase 2**: 本地自选目录与项目-子项目继承体系（Directory as Project, Cascading BaseURL/Headers/Envs）
- [ ] **Phase 3**: Swagger / OpenAPI 导入、源 URL 记录与一键无损刷新（Swagger Engine）
- [ ] **Phase 4**: 环境变量多层级覆盖与动态插值系统（Environment Engine）
- [ ] **Phase 5**: 常用快捷与轻量网络配置（全局快捷键、Cookie Jar、SSL 忽略、网络代理）
- [ ] **Phase 6**: 双端构建、打包与性能基准验收（macOS & Windows 80MB 级内存达标）

---

## 📋 详细任务清单

### Phase 0: 技术准备与跨平台脚手架
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

### Phase 1: 核心 RESTful 请求构建与响应查看 (MVP)
- [x] **RESTful 请求地址与 BaseURL 智能拼接**
  - [x] HTTP Method 下拉选择框 (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)，配以标准语义化色彩标签
  - [x] URL 输入栏：
    - [x] 支持输入相对路径（如 `/api/v1/users/{id}`）或独立完整 URL
    - [x] 实时显示继承解析后的完整 BaseURL 前缀与最终拼接 URL 预览
    - [x] 自动解析 URL 中的 query 参数并同步至 Params 表格与文本模式
    - [x] **Path Variables 路径参数智能解析**：自动检测 URL 中的 `{param}` 或 `:param`，在 Params 面板生成对应输入行，发送请求时自动完成路径值替换
  - [x] 「Send」发送按钮及快捷键（`Cmd+Enter` / `Ctrl+Enter`）支持
  - [x] 请求进行中加载状态 (Loading Spinner) 与实时取消请求 (Cancel) 能力
- [x] **Query Params 编辑器（表格 vs 纯文本双模式）**
  - [x] **表格模式 (Key-Value Grid)**：支持勾选启用/禁用、Key、Value、Description、行删除与自动追加空行
  - [x] **纯文本模式 (Bulk Edit)**：
    - [x] 多行文本直接输入/整段粘贴（支持 `key=value` 或 `key: value` 格式）
    - [x] 切换回表格模式时自动解析语法并回填表格；表格修改时同步反向生成文本
- [x] **Headers 编辑器 & 极简鉴权（表格 vs 纯文本双模式 + 继承标记）**
  - [x] 极简鉴权：不设冗余独立 Auth 面板，统一在 Headers 表格/文本中通过继承或局部配置实现 (如 `Authorization: Bearer {{token}}`)
  - [x] 继承状态标记（直观标注该 Header 来自「主项目全局继承」、「子项目继承」还是「本请求自定义」）
  - [x] **表格模式**：支持常用 HTTP Header 键名智能自动补全 (Content-Type, Authorization, Accept 等)
  - [x] **纯文本模式 (Bulk Edit)**：支持多行格式（`Header-Key: Header-Value`）批量编辑与实时双向解析
- [x] **Body 编辑器 (RESTful 核心高频类型)**
  - [x] `none`: 无 Body
  - [x] `json`: 基于 CodeMirror 6 的 JSON 高效编辑器
    - [x] **严禁自动格式化**：输入、失焦、粘贴或发送时，绝不自动篡改用户原始排版与内容
    - [x] **显式按需格式化**：工具栏提供「格式化 (Prettify)」与「单行压缩 (Minify)」按钮（支持 `Shift+Alt+F`）
    - [x] **Rust `serde_json` 异步非阻塞执行**：通过 Tauri IPC 调用 Rust 后台工作线程，毫秒级流式处理大 JSON，前端 UI 零卡顿，不丢失长整型 (Snowflake ID) 精度
    - [x] 实时语法错误提示（基于 CodeMirror 6 Linter）
  - [x] `form-data`: 键值对表格（支持文本与本地文件上传路径）
  - [x] `x-www-form-urlencoded`: 键值对表格
  - [x] `raw`: 纯文本格式输入
- [x] **原生 HTTP 转发层 (Rust Reqwest 引擎)**
  - [x] 编写 Rust 端 `send_rest_request` 命令，自动合并最终 URL 并发送
  - [x] 彻底规避浏览器跨域 (CORS) 限制
  - [x] 精确统计请求毫秒耗时 (Duration)、传输体积大小 (Body Size) 与 HTTP 状态码 (Status Code)
  - [x] 异常与网络超时捕获处理（DNS 失败、拒绝连接、超时等友好提示）
- [x] **响应查看器 (Response Viewer)**
  - [x] 响应状态栏：HTTP Status Code（根据 2xx/3xx/4xx/5xx 着色）、耗时、数据大小
  - [x] **Response Body 查看与超大保护**：
    - [x] CodeMirror 6 JSON 语法高亮与代码折叠/展开
    - [x] 关键字查找/搜索定位 (Search)
    - [x] 纯文本 (Raw) / 格式化 (Pretty) 视图切换（大数据异步走 `serde_json`，防止前端卡死）
    - [x] **超大响应保护机制 (Large Response Protection)**：当返回数据 > 5MB 时自动截断预览（仅渲染前 1MB 文本），避免 DOM/编辑器假死，并提示「另存为本地文件」或「在外部编辑器打开」
    - [x] 一键复制响应内容到剪贴板
    - [x] 响应数据另存为本地文件
  - [x] **Response Headers 查看**：只读表格展示服务端实际返回的响应头

---

### Phase 2: 本地自选目录与项目-子项目继承体系 (Local-First)
- [ ] **自由选择本地存储目录 (Folder-as-Project)**
  - [ ] 支持通过原生文件选择对话框（`tauri-plugin-dialog`）选择任意本地文件夹作为主项目
  - [ ] 欢迎页/启动页记录「最近打开的项目 (Recent Projects)」列表，一键快速载入
  - [ ] 本地目录结构自动初始化：自动创建 `.justapi/project.json`
- [ ] **项目与子项目树形管理 (Sidebar Tree)**
  - [ ] 侧边栏展示：主项目 -> 子项目列表 (Modules / Services) -> 具体请求列表
  - [ ] 支持新建子项目文件夹、重命名、删除
  - [ ] 支持新建请求、重命名、拖拽移动归属、复制 (Duplicate)、删除
  - [ ] 快速保存当前未保存的请求 (`Cmd+S` / `Ctrl+S`)
- [ ] **三维层级级联继承引擎 (Cascading Inheritance Engine)**
  - [ ] **BaseURL 级联**：
    - [ ] 主项目定义根 BaseURL（如 `https://api.dev.example.com`）
    - [ ] 子项目配置：可选择「继承主项目 BaseURL」或「自定义独立 BaseURL」或「配置子路径前缀 (如 `/auth`)」
    - [ ] 发送请求时按优先级级联计算：`Request BaseURL (若指定)` > `Sub-project BaseURL` > `Project BaseURL`
  - [ ] **请求头 (Headers) 级联**：
    - [ ] 主项目配置全局通用 Headers（如全局 `Authorization`, `X-App-ID`）
    - [ ] 子项目配置：继承主项目 Headers，并允许追加子项目专属 Headers
    - [ ] 请求级别合并策略：同名 Header 优先级为 `Request` > `Sub-project` > `Project`
  - [ ] **多标签页 (Tabs) 状态同步**
    - [ ] 多标签新建、切换、关闭（`Cmd+T`, `Cmd+W`）
    - [ ] 未保存状态小圆点 (Dirty Indicator)
- [ ] **多文件本地存储协议实现**
  - [ ] 主项目配置：`.justapi/project.json`
  - [ ] 子项目配置：`[sub-project]/.subproject.json`
  - [ ] 请求定义文件：`[sub-project]/[request-name].json`
  - [ ] **请求历史记录与 Git 隔离**：
    - [ ] 项目初始化时自动维护根目录 `.gitignore`，将 `history.json` 自动写入忽略清单，避免污染团队仓库
    - [ ] `history.json` 限制上限为最近 200 条轻量元数据（Method, URL, 状态码, 耗时, 时间戳），不持久化存储大 Response 实体，保障磁盘与内存常驻极小

---

### Phase 3: Swagger / OpenAPI 导入、源 URL 记录与一键无损刷新
- [ ] **Swagger / OpenAPI 解析引擎**
  - [ ] 支持 Swagger 2.0、OpenAPI 3.0 与 3.1 格式（支持 JSON 与 YAML）
  - [ ] 支持从远程 HTTP/HTTPS URL 直接拉取导入 (如 `http://localhost:8080/v3/api-docs`)
  - [ ] 支持从本地 Swagger 文件导入
  - [ ] 智能解析：提取 BaseURL、Path、Method、Summary/Description、Query/Path/Header/Body 参数模板
- [ ] **导入来源持久化记录**
  - [ ] 导入时提示选择或自动创建目标子项目
  - [ ] 将源 URL 持久化记录在 `.justapi/project.json` 或子项目 `.subproject.json` 的 `swaggerSourceUrl` 字段中
- [ ] **一键无损刷新 API (Refresh API Engine)**
  - [ ] 在项目或子项目菜单提供「一键刷新接口」按钮
  - [ ] 重新根据记录的 URL 请求最新 Swagger 规范文档
  - [ ] **智能差异对比与合并 (Smart Merge)**：
    - [ ] 新增接口：自动添加到子项目目录
    - [ ] 废弃接口：打上 `[Deprecated / 已下线]` 标签，**坚决不物理删除本地文件**，保护用户测试参数
    - [ ] 已变更接口：更新 Path 与参数定义，**无损保留**用户已在 JustAPI 中填写的具体测试参数 Value 与自定义 Header

---

### Phase 4: 环境变量多层级覆盖与动态插值系统
- [ ] **环境变量多级管理**
  - [ ] 主项目级环境变量管理：支持创建多套环境配置（如 `Local`, `Dev`, `Test`, `Prod`）
  - [ ] 子项目级环境变量覆盖：
    - [ ] 子项目默认直接继承主项目选定环境的所有变量
    - [ ] 支持在子项目内重写特定变量（子项目同名变量优先）
  - [ ] 顶部导航栏提供当前全局环境快速切换下拉框
- [ ] **模板语法解析引擎**
  - [ ] 在 BaseURL、URL Path、Params、Headers、JSON Body 中支持 `{{variable_name}}` 动态插值
  - [ ] 鼠标悬停显示实时解析值的 Tooltip 提示，并高亮指示该变量来自主项目还是子项目覆盖
  - [ ] 内置系统动态变量支持：
    - [ ] `{{$uuid}}`: 自动生成 UUID v4
    - [ ] `{{$timestamp}}`: 当前时间戳 (秒/毫秒)
    - [ ] `{{$randomInt}}`: 指定范围随机整数

---

### Phase 5: 常用快捷与轻量网络配置 (RESTful 专精)
- [ ] **常用桌面全局快捷键**
  - [ ] `Cmd/Ctrl + Enter`: 发送当前请求
  - [ ] `Cmd/Ctrl + S`: 保存当前请求
  - [ ] `Cmd/Ctrl + T`: 新建标签页
  - [ ] `Cmd/Ctrl + W`: 关闭当前标签页
  - [ ] `Cmd/Ctrl + \`: 展开/收起左侧边栏
  - [ ] `Cmd/Ctrl + R`: 刷新当前子项目的 Swagger API
- [ ] **轻量 RESTful 网络进阶**
  - [ ] **Cookie 管理 (Cookie Jar)**：支持自动捕获与携带会话 Cookie，提供可视化查看与清除按钮
  - [ ] **SSL / TLS 控制**：支持单请求或全局开启「忽略 SSL 证书校验」，完美解决本地自签名证书调试痛点
  - [ ] **网络代理 (Proxy)**：支持配置本地 HTTP/SOCKS5 代理或跟随系统设置

---

### Phase 6: 双端构建、打包与性能基准验收
- [ ] **双端 UI 质感与原生融合**
  - [ ] macOS: 适配系统原生交通灯 (Traffic Lights) 沉浸式标题栏
  - [ ] Windows: 定制美观无边框窗口 (Frameless Window) 与窗口最小化/最大化/关闭按钮
  - [ ] 响应式紧凑布局：适配小屏笔记本与大屏显示器，表单间距支持紧凑模式
- [ ] **自动化打包构建**
  - [ ] macOS 构建：生成 `.dmg` 与 `.app` 文件，配置本地与 GitHub Actions 流水线
  - [ ] Windows 构建：生成 `.msi` 或 `.exe` (NSIS) 安装包
- [ ] **轻量化验收与性能基准达成**
  - [ ] 冷启动时间验证：双端目标 ≤ 1.0 秒
  - [ ] 空闲状态内存占用验证：
    - [ ] macOS (WebKit): 目标 ≤ 50 MB
    - [ ] Windows (经过参数裁剪后的 WebView2 累计所有进程): 目标 ≤ 80-100 MB
  - [ ] 安装包打包体积验证：目标 ≤ 25 MB
