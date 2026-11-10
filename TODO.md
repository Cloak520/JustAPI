# JustAPI 开发任务清单 (TODO)

> 基于 **Tauri 2.0 (Rust) + Vue 3 + TypeScript + Tailwind CSS + CodeMirror 6** 构建。  
> 核心定位：**专精 RESTful、轻量秒开、本地目录即项目 (Folder-as-Project)、层级级联继承、Swagger 一键无损刷新、双模式快速编辑**。

---

## 📅 里程碑进度

- [x] **Phase 0: 技术准备与脚手架**（Tauri 2.0 + Vue 3，Windows WebView2 内存裁剪）
- [x] **Phase 1: 核心 RESTful 请求引擎**（双模式编辑、BaseURL 拼接、请求取消、响应查看与超大截断保护）
- [x] **Phase 2: 本地自选目录与级联继承**（Folder-as-Project、三维级联继承、Tab 会话恢复、Git 隔离历史）
- [x] **Phase 3: Swagger / OpenAPI 导入与一键刷新**（远程 URL / 本地文件导入、源绑定、Smart Merge 无损合并）
- [x] **Phase 4: 环境变量与动态插值系统**（多级环境覆盖、内置动态变量、来源徽章追踪）
- [x] **Phase 5: 快捷键收敛与轻量网络配置**（全局快捷键唯一分发、Cookie Jar、SSL 忽略、本地代理）
- [x] **Phase 6: 双端构建与性能基准验收**（macOS 原生标题栏 / Windows 无边框、≤0.8s 冷启、45~80MB 内存）
- [x] **Phase 7: 交互体验深度优化**（侧边栏拖拽记忆、深浅主题切换、Tab 右键菜单与定位）

---

## 🛠️ 已交付核心特性速查

| 核心模块 | 主要实现要点 |
| :--- | :--- |
| **轻量架构** | 基于 Tauri 2.0 + Rust 原生网络层，彻底规避浏览器 CORS；Windows 专用裁剪参数，内存控制在 80MB 左右 |
| **请求编辑** | 支持标准 RESTful 方法与路径参数解析；Query Params & Headers 支持「键值对表格」与「纯文本 Bulk Edit」双向实时转换 |
| **智能补全** | Headers 键值智能联想补全（浮层渲染防容器裁剪，选定即关，光标自动流转至 Value 输入框） |
| **高性能 JSON** | CodeMirror 6 深度集成；Rust `serde_json` 异步非阻塞格式化/压缩；坚决不篡改用户原始排版；超大响应（>5MB）自动保护 |
| **目录级项目管理** | 本地文件协议存储（`.justapi`）；支持主项目/子项目级联继承 BaseURL、Headers 与环境变量；历史记录自动加入 `.gitignore` |
| **Swagger 同步** | 支持 Swagger 2.0 / OpenAPI 3.x；持久化源 URL，`Cmd/Ctrl + R` 一键无损合并（新增接口自动追加，保留用户填写参数） |
| **动态插值变量** | 支持 `{{varName}}` 及内置系统变量（`{{$guid}}`, `{{$timestamp}}`, `{{$randomInt}}` 等），URL 实时彩色来源徽章识别 |
| **桌面交互质感** | 全局快捷键统一收敛；侧边栏拖拽调宽（200px~600px）并记忆；多主题（深色/浅色/系统）；Tab 快捷右键操作与文件快速定位 |

---

## 🔮 未来待办规划 (Backlog)

- [ ] **接口文档轻量导出**：支持将子项目接口导出为 Markdown 或 HTML 格式文档
- [ ] **第三方集合迁移**：支持导入 Postman Collection / Insomnia 导出文件
