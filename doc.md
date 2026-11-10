# JustAPI 开发者与插件开发指南

本文档面向 **JustAPI 源码贡献者** 与 **外置插件开发者**，涵盖本地环境搭建、工程架构与 `.justapi/plugins/` 外置插件（API v1）完整开发规范。

> 若想了解软件日常界面操作与功能使用，请参阅 **[软件使用教程 (usage.md)](usage.md)**。

---

## 目录

1. [本地开发与构建发布](#1-本地开发与构建发布)
   - [1.1 环境要求](#11-环境要求)
   - [1.2 常用开发与测试命令](#12-常用开发与测试命令)
   - [1.3 跨平台打包与 GitHub Actions 发布](#13-跨平台打包与-github-actions-发布)
2. [工程架构与核心模块](#2-工程架构与核心模块)
   - [2.1 前端分层与核心机制](#21-前端分层与核心机制)
   - [2.2 Rust 原生核心与 Tauri 命令](#22-rust-原生核心与-tauri-命令)
3. [外置插件系统设计（API v1）](#3-外置插件系统设计api-v1)
   - [3.1 作用域、优先级与状态持久化](#31-作用域优先级与状态持久化)
   - [3.2 manifest.json 规范与安全校验](#32-manifestjson-规范与安全校验)
   - [3.3 生命周期与保留标识约束](#33-生命周期与保留标识约束)
4. [JustAPIPluginContext API 参考与实战](#4-justapiplugincontext-api-参考与实战)
   - [4.1 上下文辅助属性与方法](#41-上下文辅助属性与方法)
   - [4.2 注册动态变量与全局命令](#42-注册动态变量与全局命令)
   - [4.3 洋葱模型请求中间件](#43-洋葱模型请求中间件)
   - [4.4 注册请求 / 响应 Tab 与样式（零构建 UI）](#44-注册请求--响应-tab-与样式零构建-ui)
   - [4.5 注册自定义 Body 编辑器与请求导入/导出器](#45-注册自定义-body-编辑器与请求导入导出器)
   - [4.6 注册接口集合导入器（Collection Importer）](#46-注册接口集合导入器collection-importer)
5. [官方内置插件参考与本地调试](#5-官方内置插件参考与本地调试)

---

## 1. 本地开发与构建发布

### 1.1 环境要求

- **Node.js**：`>= 18`（推荐 `20.x`，与 CI 保持一致）
- **Rust 工具链**：稳定版 `>= 1.90`（`src-tauri/Cargo.toml` 使用 `edition = "2024"`）
- **平台构建依赖**：
  - **macOS**：Xcode Command Line Tools
  - **Windows**：Visual Studio C++ 生成工具 & WebView2 Runtime
  - **Linux（Ubuntu/Debian）**：`libwebkit2gtk-4.1-dev`、`libappindicator3-dev`、`librsvg2-dev`、`patchelf`、`xdg-utils`

### 1.2 常用开发与测试命令

```bash
# 1. 安装前端依赖
npm install

# 2. 启动 Tauri 桌面端开发环境 (Vite 热重载 + Rust 原生窗口)
npm run tauri dev

# 3. 仅启动 Vite 前端开发服务 (浏览器调试界面，部分本地文件/HTTP IPC 受限)
npm run dev

# 4. 执行 TypeScript 类型校验与前端生产构建 (vue-tsc --noEmit && vite build)
npm run build

# 5. 运行前端与内置插件单元测试 (Vitest)
npm test

# 6. 运行 Rust 核心与仓储单元测试
cargo test --manifest-path src-tauri/Cargo.toml
```

### 1.3 跨平台打包与 GitHub Actions 发布

本地执行生产打包：

```bash
npm run tauri build
```

生成的安装包产物位于 `src-tauri/target/release/bundle/`（macOS `.dmg`/`.app`、Windows `.msi`/`.exe`、Linux `.AppImage`/`.deb`）。

项目内置工作流 [`.github/workflows/release.yml`](.github/workflows/release.yml)，支持：
- **手动触发 (`workflow_dispatch`)**：进入 GitHub **Actions -> Release -> Run workflow**，可自定义 Tag、标题与 `draft`/`prerelease` 标记。
- **Git Tag 自动发布**：推送 `v*` 标签（如 `git tag v0.1.0 && git push origin v0.1.0`）自动并行构建 macOS（Apple Silicon `aarch64` & Intel `x86_64`）、Windows（`x64`）与 Linux（`x64`）安装包并生成 Release。

---

## 2. 工程架构与核心模块

### 2.1 前端分层与核心机制

| 目录 / 模块 | 职责说明 |
| :--- | :--- |
| [`src/core/inheritance/`](src/core/inheritance/resolver.ts) | `主项目 -> 子项目 -> 单请求` 三维 BaseURL 拼接与 Headers 分层解析/覆写追踪 |
| [`src/core/interpolation/`](src/core/interpolation/engine.ts) | 可扩展动态变量引擎（`VariableEngine`），内置 `$guid`/`$uuid`/`$timestamp`/`$timestampMs`/`$randomInt` 并识别变量来源徽章 |
| [`src/core/pipeline/`](src/core/pipeline/requestPipeline.ts) | 洋葱模型请求执行管线（[`defaultMiddlewares.ts`](src/core/pipeline/defaultMiddlewares.ts) 定义解析/合并/插值/Cookie/日志/传输阶段） |
| [`src/core/registries/`](src/core/registries/extensionRegistry.ts) | 六类响应式扩展注册表：RequestTab、BodyEditor、ResponseTab、RequestImporter、RequestExporter、CollectionImporter |
| [`src/core/plugins/`](src/core/plugins/pluginHost.ts) | `ExternalPluginHost`：扫描多作用域插件、加载 ESM/CSS、维护生命周期清理、`project.json` 启停持久化 |
| [`src/core/commands/`](src/core/commands/commandRegistry.ts) | 统一全局命令与快捷键分发中心（`Cmd/Ctrl + Enter/S/T/W/\/R/F` 等） |
| [`src/core/shortcuts/`](src/core/shortcuts/escapeStack.ts) | 分层 `Esc` 取消栈（按 `OVERLAY > MODAL > DROPDOWN` 优先关闭最顶层活动浮层） |
| `src/composables/` | Vue 组合式封装（[`useEscapeCancel.ts`](src/composables/useEscapeCancel.ts)、[`useTheme.ts`](src/composables/useTheme.ts)） |
| `src/services/` & `src/stores/` | 类型化 Tauri IPC 封装与 Pinia 状态仓库（`appStore`、`sessionStore`、`workspaceStore`） |

### 2.2 Rust 原生核心与 Tauri 命令

- `commands/`（注册见 [`src-tauri/src/lib.rs`](src-tauri/src/lib.rs)）：暴露 HTTP 请求/取消、文件对话框与响应落盘、本地项目与子项目/请求/历史读写、通用集合导入解析与合并、JSON 格式化/压缩、外置插件管理命令。
- [`transport/`](src-tauri/src/transport/mod.rs)：基于 `reqwest` 封装 HTTP 客户端池（区分 SSL 禁用与代理配置），支持中断正在进行的请求，并缓存最近 20 条 / 总上限 64 MB 响应原始字节以便无损另存为文件。
- [`repository/`](src-tauri/src/repository/mod.rs)：实现 `Folder-as-Project` 文件协议读写、`safe_join_rel` 路径越界拦截、自动维护 `.gitignore` 中的 `history.json` 及历史上限（200 条）裁剪。
- [`importer/`](src-tauri/src/importer/merge.rs)：提供通用文档源读取（`http(s)://` URL 或本地路径）、JSON/YAML 结构解析、以及无损增量集合合并（保留已有测试参数与 `extensions`）。
- [`plugins/`](src-tauri/src/plugins/mod.rs)：实现多作用域插件扫描、内嵌官方插件读取、路径逃逸防护、示例脚手架生成与安全删除。

---

## 3. 外置插件系统设计（API v1）

### 3.1 作用域、优先级与状态持久化

JustAPI 在每次打开/切换项目或触发重载时按以下三个作用域扫描外置插件：

1. **项目级 (`project`)**：`<项目根目录>/.justapi/plugins/<plugin-dir>/`（最高优先级，可随 Git 分发）
2. **全局级 (`global`)**：`~/.justapi/plugins/<plugin-dir>/`（Windows 为 `%USERPROFILE%\.justapi\plugins\`）
3. **内置级 (`bundled`)**：随二进制编译内嵌的 3 个官方插件（开发模式 `npm run tauri dev` 下优先直接读取仓库根 `.justapi/plugins/` 源码）

**覆盖与启停规则**：
- **同名 ID 覆盖**：不同作用域存在相同 `manifest.id` 时，仅激活高优先级插件（`project > global > bundled`），低优先级插件会显示为 `overridden`；若高优先级版本被禁用，则自动恢复下一优先级可用版本。
- **同作用域去重**：同一插件根目录内若有两个子目录声明了相同 `id`，后者会被标记为 `error`。
- **启停状态持久化**：禁用的插件键名（格式 `<scope>:<id>`）写入当前项目的 `.justapi/project.json` 的 `disabledPlugins` 字段；未打开项目时暂存浏览器 `localStorage`。
- **移除保护**：内置插件不可移除（仅可禁用）；项目级/全局级外置插件可在「插件管理」UI 中移除，删除前执行路径边界与软链接校验并清理 `disabledPlugins` 记录。

### 3.2 manifest.json 规范与安全校验

每个外置插件目录必须包含 `manifest.json` 与入口脚本（`index.mjs` 等），目录名不能以 `.` 开头或命名为 `node_modules`。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `string` | 是 | - | 插件唯一标识，建议使用反向域名命名空间（如 `acme.hmac-auth`） |
| `name` | `string` | 是 | - | 插件展示名称 |
| `version` | `string` | 是 | - | 插件版本号（如 `1.0.0`） |
| `entry` | `string` | 否 | `"index.mjs"` | 相对插件目录的 ES Module 入口文件（仅允许 `.mjs` / `.js`） |
| `style` | `string` | 否 | `undefined` | 可选样式文件（仅允许 `.css`），启用时注入 `<style data-justapi-plugin="...">` |
| `description` | `string` | 否 | `undefined` | 插件简介，展示于插件管理列表 |
| `author` | `string` | 否 | `undefined` | 作者名称 |
| `minApiVersion` | `number` | 否 | `1` | 要求宿主插件 API 最低版本（当前 `EXTERNAL_PLUGIN_API_VERSION = 1`） |

**安全与资源限制**（[`src-tauri/src/plugins/mod.rs`](src-tauri/src/plugins/mod.rs#L155-L516)）：
- 入口脚本与样式路径必须为相对路径，禁止 `..` 目录穿越与绝对路径；Rust 端会先 `canonicalize()` 并校验目标文件仍在当前插件目录内，防止软链接逃逸。
- 单文件体积限制：入口脚本不超过 `5 MB`，样式文件不超过 `2 MB`。

### 3.3 生命周期与保留标识约束

- **导出规范**：入口脚本支持具名导出 `export function activate(ctx)`、`export function deactivate()`，或通过 `export default` 导出激活函数 / `{ activate, deactivate }` 对象（支持异步 `async`）。
- **自动卸载清理**：通过 `ctx.register*` / `ctx.useMiddleware` 返回的所有清理函数，以及注入的 CSS 样式标签，均由宿主统一跟踪；插件禁用、热重载或移除时先调用可选 `deactivate()`，再按注册逆序自动清理所有已注册扩展与样式标签。
- **激活失败回滚**：若 `activate(ctx)` 抛错，宿主会立即反向回滚该插件已注册的所有扩展与样式，防止脏状态残留。
- **核心保留标识禁用**：
  - 禁止注册前缀 `core.`、`builtin.` 的任何 ID。
  - Request/Response Tab 保留 ID：`headers`、`params`、`body`、`cookies`。
  - BodyEditor 保留 ID：`none`、`json`、`form-data`、`x-www-form-urlencoded`、`raw`。

---

## 4. JustAPIPluginContext API 参考与实战

完整 TypeScript 定义见 [`src/core/plugins/types.ts`](src/core/plugins/types.ts#L71-L96)。

### 4.1 上下文辅助属性与方法

| 成员 | 说明 |
| :--- | :--- |
| `pluginId` / `pluginDirName` / `scope` / `apiVersion` | 当前插件元信息（当前 `apiVersion` 为 `1`） |
| `vue` | 宿主共享的 Vue 3 运行时，供零构建插件直接调用 `defineComponent`、`h`、`computed`、`ref` 等 |
| `getActiveRequest()` | 获取当前活动标签页的 `ApiRequest` 对象 |
| `getRequestExtension<T>(key)` / `setRequestExtension<T>(key, value)` | 读写当前请求的 `request.extensions[key]`，随请求 JSON 一并保存持久化 |
| `getLastResponse()` | 获取当前标签页最近一次响应 `ApiResponse \| null` |
| `getLastExecutionContext()` | 获取最近一次执行完成后的完整管线上下文 `RequestExecutionContext \| null` |
| `showToast(message, isError?)` | 触发桌面底部全局提示通知 |
| `importParsedRequest(request)` | 将解析生成的 `ApiRequest` 作为新标签页打开 |
| `createEmptyRequest(overrides?)` | 基于核心模型工厂创建合法的默认请求对象 |

### 4.2 注册动态变量与全局命令

```js
export function activate(ctx) {
  // 注册自定义动态变量 {{$nonce}}
  ctx.registerVariableProvider({
    name: '$nonce',
    description: '8 位随机字母数字串',
    evaluate: () => Math.random().toString(36).slice(2, 10)
  })

  // 注册命令与快捷键 (Cmd/Ctrl + Shift + K)
  ctx.registerCommand({
    id: 'acme.quick-ping',
    title: '输出当前请求路径',
    shortcut: { key: 'k', mod: true, shift: true },
    run: () => {
      const req = ctx.getActiveRequest()
      ctx.showToast(`当前请求: ${req.method} ${req.path}`)
    }
  })
}
```

### 4.3 洋葱模型请求中间件

JustAPI 核心请求管线 [`defaultMiddlewares.ts`](src/core/pipeline/defaultMiddlewares.ts) 的默认执行阶段顺序如下：

| `order` | 核心阶段 | 说明 |
| :---: | :--- | :--- |
| `100` | `core.resolve-url` | 解析项目/子项目变量 `varMap` 并计算拼接与插值后的 `finalUrl` |
| `200` | `core.merge-headers` | 合并主/子项目与单请求 Headers 并完成插值，产出 `finalHeaders` |
| `300` | `core.interpolate-body` | 对 JSON / Raw 请求体或 Form 字段插值，产出 `finalBody` / `finalFormFields` |
| `400` | `core.cookie-jar` | 自动注入匹配的 Cookie |
| `900` | `core.console-logger` | 在 `await next()` 返回后向控制台输出请求/响应摘要 |
| `1000` | `core.transport` | 执行 HTTP 请求并写入 `execCtx.response` |

插件可通过 `ctx.useMiddleware({ id, order, execute })` 在任意阶段前后切入（如在 `order: 250` 签名并追加请求头，或在 `await next()` 之后读取 `execCtx.response` 并写入 `execCtx.metadata`）：

```js
ctx.useMiddleware({
  id: 'acme.hmac-signer',
  order: 350, // 在请求头合并与 Body 插值完成之后、发送之前执行
  description: '附加请求签名头与耗时标记',
  async execute(execCtx, next) {
    execCtx.finalHeaders.push(['X-Request-Nonce', crypto.randomUUID()])
    const start = performance.now()
    await next()
    execCtx.metadata['acme.hmac-signer'] = {
      totalPipelineMs: Math.round(performance.now() - start),
      status: execCtx.response?.status
    }
  }
})
```

### 4.4 注册请求 / 响应 Tab 与样式（零构建 UI）

外置插件无需引入 Vite/Webpack 打包工具，可直接使用宿主注入的 `ctx.vue`（`h`、`defineComponent`、`computed`）渲染轻量交互界面，并在 `manifest.json` 中通过 `"style": "style.css"` 附带样式：

```js
export function activate(ctx) {
  const { defineComponent, computed, h } = ctx.vue

  const NoteTab = defineComponent({
    name: 'AcmeRequestNoteTab',
    setup() {
      const note = computed(() => ctx.getRequestExtension('acmeNote') || '')
      return () =>
        h('div', { class: 'acme-note-wrap' }, [
          h('textarea', {
            value: note.value,
            placeholder: '填写接口备注（保存于 request.extensions.acmeNote）',
            onInput: e => ctx.setRequestExtension('acmeNote', e.target.value)
          })
        ])
    }
  })

  ctx.registerRequestTab({
    id: 'acme.note',
    order: 60,
    label: '备注',
    component: NoteTab,
    badgeCount: ({ request }) => (request.extensions?.acmeNote ? 1 : 0)
  })

  ctx.registerResponseTab({
    id: 'acme.meta',
    order: 60,
    label: '扩展指标',
    component: defineComponent({
      setup() {
        return () => {
          const execCtx = ctx.getLastExecutionContext()
          return h('pre', { style: 'padding:12px;font-size:11px;' }, JSON.stringify(execCtx?.metadata || {}, null, 2))
        }
      }
    }),
    badgeText: (_res, execCtx) => execCtx?.metadata?.['acme.hmac-signer'] ? 'SIGNED' : undefined
  })
}
```

### 4.5 注册自定义 Body 编辑器与请求导入/导出器

- **Body 编辑器**：`ctx.registerBodyEditor({ id, order, label, component })`，选中后会自动将当前请求的 `bodyType` 设为该 `id`，由中间件或请求发送逻辑读取 `bodyContent`。
- **请求导入器 (`registerRequestImporter`)**：在 UrlBar 点击「导入」时出现；当 `supports(rawInput)` 返回 `true` 时支持自动识别，由 `parse(rawInput)` 返回标准 `ApiRequest`（可使用 `ctx.createEmptyRequest(...)` 构造）。
- **请求导出器 (`registerRequestExporter`)**：只有一个导出器时直接展示按钮，多个时收拢为下拉菜单；`exportRequest({ request, resolvedUrl, headers, body })` 返回导出文本并自动复制到剪贴板。

### 4.6 注册接口集合导入器（Collection Importer）

集合导入弹窗（侧边栏文档导入）以及 `Cmd/Ctrl + R` 集合刷新由 `registerCollectionImporter` 驱动。Rust 内核统一负责 HTTP/本地文件拉取（`read_import_source`）、YAML/JSON 文本结构解析（`parse_structured_document`）及无损增量合并（`merge_and_save_collection`），插件仅需实现格式识别与规范映射：

```js
ctx.registerCollectionImporter({
  id: 'acme.custom-spec',
  order: 20,
  label: 'Custom API Spec (JSON / YAML)',
  shortLabel: 'Custom',
  description: '导入自定义团队接口描述文档',
  sourcePlaceholder: 'https://example.com/api-spec.yaml 或本地文件路径',
  supportsRefresh: true,
  supports: (rawText, source) =>
    rawText.includes('"customSpecVersion"') || (source || '').endsWith('.spec.yaml'),
  async parse(rawText, helpers) {
    // 复用 Rust serde_json / serde_yaml 高性能解析 JSON 与 YAML
    const doc = await helpers.parseStructuredDocument(rawText)
    return {
      title: doc.title || 'Custom API',
      baseUrl: doc.baseUrl,
      sourceFormat: 'custom-spec',
      requests: (doc.endpoints || []).map(ep =>
        ctx.createEmptyRequest({
          id: `${ep.method}_${ep.path}`,
          name: ep.name || ep.path,
          method: ep.method.toUpperCase(),
          path: ep.path,
          group: ep.tag
        })
      )
    }
  }
})
```

---

## 5. 官方内置插件参考与本地调试

仓库内嵌的 3 个标准插件即是最完整的参考样例：
- **[`.justapi/plugins/assertions/`](.justapi/plugins/assertions/index.mjs)**：演示请求扩展数据结构持久化（`extensions.assertions`）、洋葱中间件后置断言评估、请求 Tab 规则编辑器、响应 Tab 校验报告以及自定义 `style.css`。
- **[`.justapi/plugins/curl/`](.justapi/plugins/curl/index.mjs)**：演示纯 JS POSIX Shell 分词器、请求导入器（`registerRequestImporter`）与请求导出器（`registerRequestExporter`）。
- **[`.justapi/plugins/swagger/`](.justapi/plugins/swagger/index.mjs)**：演示集合导入器（`registerCollectionImporter`）借助 `helpers.parseStructuredDocument` 解析 JSON/YAML 版 Swagger/OpenAPI 文档与启用 `supportsRefresh` 无损刷新。

**本地快速调试流程**：
1. 打开应用右上角「**插件**」弹窗，在「项目级插件目录」或「全局插件目录」卡片中点击「**生成示例插件**」可立刻生成完整脚手架 `example-request-tagger`。
2. 编辑该目录中的 `manifest.json`、`index.mjs` 或 `style.css` 后，点击弹窗右上角「**刷新重载**」即可热卸载旧版并立即激活最新代码。
3. 若插件出现激活报错或清单校验异常，错误堆栈与提示会直接展示在对应插件卡片下方及开发者控制台（DevTools Console）。
