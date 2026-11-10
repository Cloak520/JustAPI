use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};

pub const EXTERNAL_PLUGIN_API_VERSION: u32 = 1;
const MAX_SCRIPT_BYTES: u64 = 5 * 1024 * 1024; // 5 MB
const MAX_STYLE_BYTES: u64 = 2 * 1024 * 1024; // 2 MB

fn default_entry() -> String {
    "index.mjs".to_string()
}

fn default_min_api_version() -> u32 {
    EXTERNAL_PLUGIN_API_VERSION
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExternalPluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default = "default_entry")]
    pub entry: String,
    #[serde(default)]
    pub style: Option<String>,
    #[serde(default = "default_min_api_version")]
    pub min_api_version: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredExternalPlugin {
    pub dir_name: String,
    pub scope: String, // "project" | "global" | "bundled"
    pub plugin_dir: String,
    pub manifest: Option<ExternalPluginManifest>,
    pub error: Option<String>,
}

struct BundledExternalPluginSpec {
    dir_name: &'static str,
    manifest_json: &'static str,
    script_code: &'static str,
    style_code: Option<&'static str>,
}

const BUNDLED_EXTERNAL_PLUGINS: &[BundledExternalPluginSpec] = &[
    BundledExternalPluginSpec {
        dir_name: "assertions",
        manifest_json: include_str!("../../../.justapi/plugins/assertions/manifest.json"),
        script_code: include_str!("../../../.justapi/plugins/assertions/index.mjs"),
        style_code: Some(include_str!("../../../.justapi/plugins/assertions/style.css")),
    },
    BundledExternalPluginSpec {
        dir_name: "curl",
        manifest_json: include_str!("../../../.justapi/plugins/curl/manifest.json"),
        script_code: include_str!("../../../.justapi/plugins/curl/index.mjs"),
        style_code: None,
    },
    BundledExternalPluginSpec {
        dir_name: "swagger",
        manifest_json: include_str!("../../../.justapi/plugins/swagger/manifest.json"),
        script_code: include_str!("../../../.justapi/plugins/swagger/index.mjs"),
        style_code: None,
    },
];

pub fn resolve_dev_bundled_plugins_dir() -> Option<PathBuf> {
    if cfg!(debug_assertions) {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .map(|p| p.join(".justapi").join("plugins"));
        if let Some(ref d) = dir {
            if d.exists() && d.is_dir() {
                return dir;
            }
        }
    }
    None
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExternalPluginsDiscoveryResult {
    pub plugins: Vec<DiscoveredExternalPlugin>,
    pub global_dir: Option<String>,
    pub project_dir: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExternalPluginAssets {
    pub id: String,
    pub dir_name: String,
    pub scope: String,
    pub manifest: ExternalPluginManifest,
    pub script_code: String,
    pub style_code: Option<String>,
}

pub fn resolve_home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

pub fn resolve_global_plugins_dir() -> Option<PathBuf> {
    resolve_home_dir().map(|h| h.join(".justapi").join("plugins"))
}

pub fn resolve_project_plugins_dir(project_path: &str) -> PathBuf {
    PathBuf::from(project_path).join(".justapi").join("plugins")
}

pub fn resolve_scope_plugins_dir(
    scope: &str,
    project_path: Option<&str>,
) -> Result<PathBuf, String> {
    match scope {
        "global" => resolve_global_plugins_dir()
            .ok_or_else(|| "无法定位用户主目录，无法确定 ~/.justapi/plugins 路径".to_string()),
        "project" => {
            let p = project_path
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| "当前未打开本地项目，无法使用项目级 .justapi/plugins 目录".to_string())?;
            Ok(resolve_project_plugins_dir(p))
        }
        other => Err(format!("无效的插件作用域: {}", other)),
    }
}

/// 校验单个插件目录名（禁止空名、隐藏目录、路径分隔符与目录穿越）
fn validate_single_dir_name(dir_name: &str) -> Result<(), String> {
    let trimmed = dir_name.trim();
    if trimmed.is_empty() || trimmed != dir_name {
        return Err("非法插件目录名".to_string());
    }
    if trimmed.starts_with('.') {
        return Err(format!("插件目录不能以 '.' 开头: {}", dir_name));
    }
    let mut comps = Path::new(trimmed).components();
    match (comps.next(), comps.next()) {
        (Some(Component::Normal(_)), None) => Ok(()),
        _ => Err(format!("非法插件目录名（存在越界片段）: {}", dir_name)),
    }
}

/// 在插件目录内安全解析相对资源路径，并验证 canonicalize 后未通过软链接逃逸
fn resolve_safe_asset_path(
    plugin_dir: &Path,
    rel_path: &str,
    allowed_extensions: &[&str],
) -> Result<PathBuf, String> {
    let trimmed = rel_path.trim();
    if trimmed.is_empty() {
        return Err("插件资源路径不能为空".to_string());
    }
    let rel = Path::new(trimmed);
    if rel.is_absolute() {
        return Err(format!("插件资源路径必须为相对路径: {}", trimmed));
    }
    for comp in rel.components() {
        match comp {
            Component::Normal(_) | Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(format!("插件资源路径存在非法越界片段: {}", trimmed));
            }
        }
    }

    let ext = rel
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    if !allowed_extensions.iter().any(|allowed| *allowed == ext) {
        return Err(format!(
            "不支持的插件资源扩展名 ({})，允许: {}",
            trimmed,
            allowed_extensions.join(", ")
        ));
    }

    let canon_dir = plugin_dir
        .canonicalize()
        .map_err(|e| format!("无法解析插件目录 ({}): {}", plugin_dir.display(), e))?;
    let target = plugin_dir.join(rel);
    if !target.exists() || !target.is_file() {
        return Err(format!("找不到插件资源文件: {}", trimmed));
    }
    let canon_target = target
        .canonicalize()
        .map_err(|e| format!("无法解析插件资源 ({}): {}", trimmed, e))?;

    if !canon_target.starts_with(&canon_dir) {
        return Err(format!("拒绝访问越界资源路径: {}", trimmed));
    }

    Ok(canon_target)
}

fn validate_manifest_fields(manifest: &ExternalPluginManifest) -> Result<(), String> {
    if manifest.id.trim().is_empty() {
        return Err("manifest.json 缺少有效的 id 字段".to_string());
    }
    if manifest.name.trim().is_empty() {
        return Err("manifest.json 缺少有效的 name 字段".to_string());
    }
    if manifest.version.trim().is_empty() {
        return Err("manifest.json 缺少有效的 version 字段".to_string());
    }
    Ok(())
}

fn inspect_plugin_dir(scope: &str, plugin_dir: &Path, dir_name: &str) -> DiscoveredExternalPlugin {
    let plugin_dir_str = plugin_dir.to_string_lossy().to_string();
    let manifest_path = plugin_dir.join("manifest.json");

    if !manifest_path.exists() {
        return DiscoveredExternalPlugin {
            dir_name: dir_name.to_string(),
            scope: scope.to_string(),
            plugin_dir: plugin_dir_str,
            manifest: None,
            error: Some("缺少 manifest.json 文件".to_string()),
        };
    }

    let raw_manifest = match fs::read_to_string(&manifest_path) {
        Ok(s) => s,
        Err(e) => {
            return DiscoveredExternalPlugin {
                dir_name: dir_name.to_string(),
                scope: scope.to_string(),
                plugin_dir: plugin_dir_str,
                manifest: None,
                error: Some(format!("读取 manifest.json 失败: {}", e)),
            };
        }
    };

    let manifest: ExternalPluginManifest = match serde_json::from_str(&raw_manifest) {
        Ok(m) => m,
        Err(e) => {
            return DiscoveredExternalPlugin {
                dir_name: dir_name.to_string(),
                scope: scope.to_string(),
                plugin_dir: plugin_dir_str,
                manifest: None,
                error: Some(format!("解析 manifest.json 失败: {}", e)),
            };
        }
    };

    if let Err(e) = validate_manifest_fields(&manifest) {
        return DiscoveredExternalPlugin {
            dir_name: dir_name.to_string(),
            scope: scope.to_string(),
            plugin_dir: plugin_dir_str,
            manifest: Some(manifest),
            error: Some(e),
        };
    }

    if let Err(e) = resolve_safe_asset_path(plugin_dir, &manifest.entry, &["mjs", "js"]) {
        return DiscoveredExternalPlugin {
            dir_name: dir_name.to_string(),
            scope: scope.to_string(),
            plugin_dir: plugin_dir_str,
            manifest: Some(manifest),
            error: Some(format!("入口脚本校验失败: {}", e)),
        };
    }

    if let Some(ref style_rel) = manifest.style {
        if !style_rel.trim().is_empty() {
            if let Err(e) = resolve_safe_asset_path(plugin_dir, style_rel, &["css"]) {
                return DiscoveredExternalPlugin {
                    dir_name: dir_name.to_string(),
                    scope: scope.to_string(),
                    plugin_dir: plugin_dir_str,
                    manifest: Some(manifest),
                    error: Some(format!("样式文件校验失败: {}", e)),
                };
            }
        }
    }

    DiscoveredExternalPlugin {
        dir_name: dir_name.to_string(),
        scope: scope.to_string(),
        plugin_dir: plugin_dir_str,
        manifest: Some(manifest),
        error: None,
    }
}

pub fn scan_plugins_in_dir(scope: &str, plugins_root: &Path) -> Vec<DiscoveredExternalPlugin> {
    if !plugins_root.exists() || !plugins_root.is_dir() {
        return Vec::new();
    }

    let Ok(entries) = fs::read_dir(plugins_root) else {
        return Vec::new();
    };

    let mut discovered = Vec::new();
    for entry in entries.flatten() {
        let p = entry.path();
        if !p.is_dir() {
            continue;
        }
        let dir_name = entry.file_name().to_string_lossy().to_string();
        if dir_name.starts_with('.') || dir_name == "node_modules" {
            continue;
        }
        discovered.push(inspect_plugin_dir(scope, &p, &dir_name));
    }

    discovered.sort_by(|a, b| a.dir_name.cmp(&b.dir_name));

    // 检测同一作用域内重复插件 ID
    let mut seen_ids = HashSet::new();
    for item in &mut discovered {
        if item.error.is_none() {
            if let Some(ref m) = item.manifest {
                let id_key = m.id.trim().to_string();
                if !seen_ids.insert(id_key.clone()) {
                    item.error = Some(format!("同一目录内存在重复的插件 ID: {}", id_key));
                }
            }
        }
    }

    discovered
}

fn same_existing_dir(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(ca), Ok(cb)) => ca == cb,
        _ => a == b,
    }
}

pub fn discover_bundled_plugins_fallback() -> Vec<DiscoveredExternalPlugin> {
    BUNDLED_EXTERNAL_PLUGINS
        .iter()
        .map(|spec| {
            let parsed = serde_json::from_str::<ExternalPluginManifest>(spec.manifest_json);
            match parsed {
                Ok(manifest) => {
                    let err = validate_manifest_fields(&manifest).err();
                    DiscoveredExternalPlugin {
                        dir_name: spec.dir_name.to_string(),
                        scope: "bundled".to_string(),
                        plugin_dir: format!(".justapi/plugins/{} (随应用内置)", spec.dir_name),
                        manifest: Some(manifest),
                        error: err,
                    }
                }
                Err(e) => DiscoveredExternalPlugin {
                    dir_name: spec.dir_name.to_string(),
                    scope: "bundled".to_string(),
                    plugin_dir: format!(".justapi/plugins/{} (随应用内置)", spec.dir_name),
                    manifest: None,
                    error: Some(format!("解析官方插件 manifest.json 失败: {}", e)),
                },
            }
        })
        .collect()
}

pub fn discover_all_plugins(
    global_dir: Option<&Path>,
    project_dir: Option<&Path>,
) -> ExternalPluginsDiscoveryResult {
    discover_all_plugins_with_bundled(global_dir, project_dir, None, false)
}

pub fn discover_all_plugins_with_bundled(
    global_dir: Option<&Path>,
    project_dir: Option<&Path>,
    dev_bundled_dir: Option<&Path>,
    include_embedded_fallback: bool,
) -> ExternalPluginsDiscoveryResult {
    let mut plugins = Vec::new();

    if let Some(p_dir) = project_dir {
        plugins.extend(scan_plugins_in_dir("project", p_dir));
    }
    if let Some(g_dir) = global_dir {
        let same_as_project = project_dir
            .map(|p| same_existing_dir(p, g_dir))
            .unwrap_or(false);
        if !same_as_project {
            plugins.extend(scan_plugins_in_dir("global", g_dir));
        }
    }

    if let Some(b_dir) = dev_bundled_dir {
        let already_scanned = project_dir
            .map(|p| same_existing_dir(p, b_dir))
            .unwrap_or(false)
            || global_dir
                .map(|g| same_existing_dir(g, b_dir))
                .unwrap_or(false);
        if !already_scanned {
            plugins.extend(scan_plugins_in_dir("bundled", b_dir));
        }
    } else if include_embedded_fallback {
        plugins.extend(discover_bundled_plugins_fallback());
    }

    ExternalPluginsDiscoveryResult {
        plugins,
        global_dir: global_dir.map(|p| p.to_string_lossy().to_string()),
        project_dir: project_dir.map(|p| p.to_string_lossy().to_string()),
    }
}

pub fn read_bundled_plugin_assets(dir_name: &str) -> Result<ExternalPluginAssets, String> {
    validate_single_dir_name(dir_name)?;
    let spec = BUNDLED_EXTERNAL_PLUGINS
        .iter()
        .find(|p| p.dir_name == dir_name)
        .ok_or_else(|| format!("未找到官方外置插件: {}", dir_name))?;

    let manifest: ExternalPluginManifest = serde_json::from_str(spec.manifest_json)
        .map_err(|e| format!("解析官方插件 manifest.json 失败: {}", e))?;
    validate_manifest_fields(&manifest)?;

    Ok(ExternalPluginAssets {
        id: manifest.id.trim().to_string(),
        dir_name: spec.dir_name.to_string(),
        scope: "bundled".to_string(),
        manifest,
        script_code: spec.script_code.to_string(),
        style_code: spec.style_code.map(|s| s.to_string()),
    })
}

fn read_text_with_limit(path: &Path, max_bytes: u64, label: &str) -> Result<String, String> {
    let meta = fs::metadata(path).map_err(|e| format!("读取 {} 元数据失败: {}", label, e))?;
    if meta.len() > max_bytes {
        return Err(format!(
            "{} 文件体积 ({} bytes) 超过上限 ({} bytes)",
            label,
            meta.len(),
            max_bytes
        ));
    }
    fs::read_to_string(path).map_err(|e| format!("读取 {} 失败: {}", label, e))
}

pub fn read_plugin_assets_from_root(
    scope: &str,
    plugins_root: &Path,
    dir_name: &str,
) -> Result<ExternalPluginAssets, String> {
    validate_single_dir_name(dir_name)?;
    let plugin_dir = plugins_root.join(dir_name);
    if !plugin_dir.exists() || !plugin_dir.is_dir() {
        return Err(format!("插件目录不存在: {}", dir_name));
    }

    let canon_root = plugins_root
        .canonicalize()
        .map_err(|e| format!("无法解析插件根目录: {}", e))?;
    let canon_plugin_dir = plugin_dir
        .canonicalize()
        .map_err(|e| format!("无法解析插件目录: {}", e))?;
    if !canon_plugin_dir.starts_with(&canon_root) {
        return Err("拒绝访问插件根目录之外的路径".to_string());
    }

    let manifest_path = canon_plugin_dir.join("manifest.json");
    let raw_manifest = fs::read_to_string(&manifest_path)
        .map_err(|e| format!("读取 manifest.json 失败: {}", e))?;
    let manifest: ExternalPluginManifest = serde_json::from_str(&raw_manifest)
        .map_err(|e| format!("解析 manifest.json 失败: {}", e))?;
    validate_manifest_fields(&manifest)?;

    if manifest.min_api_version > EXTERNAL_PLUGIN_API_VERSION {
        return Err(format!(
            "插件需要更高的宿主 API 版本 (v{} > 当前 v{})",
            manifest.min_api_version, EXTERNAL_PLUGIN_API_VERSION
        ));
    }

    let entry_path = resolve_safe_asset_path(&canon_plugin_dir, &manifest.entry, &["mjs", "js"])?;
    let script_code = read_text_with_limit(&entry_path, MAX_SCRIPT_BYTES, "入口脚本")?;

    let style_code = match manifest.style {
        Some(ref style_rel) if !style_rel.trim().is_empty() => {
            let style_path = resolve_safe_asset_path(&canon_plugin_dir, style_rel, &["css"])?;
            Some(read_text_with_limit(&style_path, MAX_STYLE_BYTES, "样式文件")?)
        }
        _ => None,
    };

    Ok(ExternalPluginAssets {
        id: manifest.id.trim().to_string(),
        dir_name: dir_name.to_string(),
        scope: scope.to_string(),
        manifest,
        script_code,
        style_code,
    })
}

pub fn ensure_plugins_dir(plugins_root: &Path) -> Result<PathBuf, String> {
    if !plugins_root.exists() {
        fs::create_dir_all(plugins_root)
            .map_err(|e| format!("创建插件目录失败 ({}): {}", plugins_root.display(), e))?;
    }
    Ok(plugins_root.to_path_buf())
}

pub fn open_folder_in_os(dir: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(dir)
            .spawn()
            .map_err(|e| format!("打开 Finder 失败: {}", e))?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(dir)
            .spawn()
            .map_err(|e| format!("打开资源管理器失败: {}", e))?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(dir)
            .spawn()
            .map_err(|e| format!("打开文件管理器失败: {}", e))?;
        return Ok(());
    }
}

pub fn scaffold_example_plugin(plugins_root: &Path) -> Result<PathBuf, String> {
    ensure_plugins_dir(plugins_root)?;

    let target_dir = plugins_root.join("example-request-tagger");
    if target_dir.exists() {
        return Err(format!(
            "示例插件目录已存在: {}",
            target_dir.to_string_lossy()
        ));
    }

    fs::create_dir_all(&target_dir)
        .map_err(|e| format!("创建示例插件目录失败: {}", e))?;

    let manifest = ExternalPluginManifest {
        id: "example.request-tagger".to_string(),
        name: "示例：请求标签注入器".to_string(),
        version: "1.0.0".to_string(),
        description: Some(
            "演示外置插件注册请求 Tab、中间件注入 Header、动态变量 {{$exampleTag}} 与持久化 extensions 数据"
                .to_string(),
        ),
        author: Some("JustAPI".to_string()),
        entry: "index.mjs".to_string(),
        style: Some("style.css".to_string()),
        min_api_version: EXTERNAL_PLUGIN_API_VERSION,
    };

    let manifest_json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("序列化示例 manifest 失败: {}", e))?;
    fs::write(target_dir.join("manifest.json"), manifest_json)
        .map_err(|e| format!("写入 manifest.json 失败: {}", e))?;

    let script = r#"const EXT_KEY = 'exampleRequestTagger'

export function activate(ctx) {
  const { computed, defineComponent, h } = ctx.vue

  // 1. 注册动态变量：在 URL / Header / Body 中均可使用 {{$exampleTag}}
  ctx.registerVariableProvider({
    name: '$exampleTag',
    description: '由 .justapi/plugins 外置插件提供的动态标签值',
    evaluate: () => `tag-${Math.floor(Date.now() / 1000)}`
  })

  // 2. 注册请求中间件：若该接口配置了 tag，自动注入 X-JustAPI-Tag 请求头
  ctx.useMiddleware({
    id: 'example.request-tagger.inject',
    order: 260,
    description: '注入示例外置插件配置的自定义请求头',
    async execute(execCtx, next) {
      const cfg = execCtx.request.extensions?.[EXT_KEY]
      if (cfg && cfg.enabled && cfg.tag) {
        const val = execCtx.variableEngine.interpolate(String(cfg.tag), execCtx.varMap)
        execCtx.finalHeaders.push(['X-JustAPI-Tag', val])
        execCtx.metadata[EXT_KEY] = { injectedHeader: val }
      }
      await next()
    }
  })

  // 3. 注册请求编辑器 Tab（零构建工具：直接使用宿主共享的 ctx.vue.h）
  const ExampleTagTab = defineComponent({
    name: 'ExampleRequestTagTab',
    setup() {
      const config = computed(() => {
        const raw = ctx.getRequestExtension(EXT_KEY)
        return raw && typeof raw === 'object'
          ? raw
          : { enabled: false, tag: '{{$exampleTag}}' }
      })

      function patchConfig(patch) {
        ctx.setRequestExtension(EXT_KEY, {
          ...config.value,
          ...patch
        })
      }

      return () =>
        h('div', { class: 'justapi-example-plugin-panel' }, [
          h('div', { class: 'justapi-example-plugin-title' }, '外置插件示例：自定义请求标签'),
          h(
            'p',
            { class: 'justapi-example-plugin-desc' },
            '配置保存在当前接口 JSON 的 extensions.exampleRequestTagger 中，发送时自动注入 X-JustAPI-Tag。'
          ),
          h('label', { class: 'justapi-example-plugin-row' }, [
            h('input', {
              type: 'checkbox',
              checked: Boolean(config.value.enabled),
              onChange: e => patchConfig({ enabled: e.target.checked })
            }),
            h('span', null, '启用 X-JustAPI-Tag 请求头注入')
          ]),
          h('input', {
            type: 'text',
            class: 'justapi-example-plugin-input',
            value: config.value.tag || '',
            placeholder: '输入标签值，支持 {{$exampleTag}} 或环境变量',
            onInput: e => patchConfig({ tag: e.target.value })
          })
        ])
    }
  })

  ctx.registerRequestTab({
    id: 'example-tagger',
    order: 60,
    label: 'Tag示例',
    component: ExampleTagTab,
    badgeCount: ({ request }) => (request.extensions?.[EXT_KEY]?.enabled ? 1 : 0)
  })
}
"#;
    fs::write(target_dir.join("index.mjs"), script)
        .map_err(|e| format!("写入 index.mjs 失败: {}", e))?;

    let css = r#".justapi-example-plugin-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  font-size: 12px;
}

.justapi-example-plugin-title {
  font-weight: 600;
}

.justapi-example-plugin-desc {
  opacity: 0.72;
  font-size: 11px;
  margin: 0;
}

.justapi-example-plugin-row {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.justapi-example-plugin-input {
  width: 100%;
  max-width: 380px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: transparent;
  color: inherit;
  font-family: monospace;
  font-size: 12px;
}
"#;
    fs::write(target_dir.join("style.css"), css)
        .map_err(|e| format!("写入 style.css 失败: {}", e))?;

    Ok(target_dir)
}

/// 从指定插件根目录移除插件目录（防止越界穿越与软链接目标误删）
pub fn remove_plugin_from_root(plugins_root: &Path, dir_name: &str) -> Result<(), String> {
    validate_single_dir_name(dir_name)?;

    if !plugins_root.exists() || !plugins_root.is_dir() {
        return Err(format!("插件根目录不存在: {}", plugins_root.display()));
    }

    let plugin_dir = plugins_root.join(dir_name);
    let meta = match fs::symlink_metadata(&plugin_dir) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(format!("找不到要移除的插件目录: {}", dir_name));
        }
        Err(e) => return Err(format!("读取插件目录信息失败: {}", e)),
    };

    if meta.file_type().is_symlink() {
        #[cfg(unix)]
        {
            fs::remove_file(&plugin_dir)
                .map_err(|e| format!("移除插件软链接失败 ({}): {}", dir_name, e))?;
            return Ok(());
        }
        #[cfg(windows)]
        {
            if plugin_dir.is_dir() {
                fs::remove_dir(&plugin_dir)
                    .map_err(|e| format!("移除插件目录链接失败 ({}): {}", dir_name, e))?;
            } else {
                fs::remove_file(&plugin_dir)
                    .map_err(|e| format!("移除插件软链接失败 ({}): {}", dir_name, e))?;
            }
            return Ok(());
        }
    }

    if !meta.is_dir() {
        return Err(format!("目标不是有效的插件目录: {}", dir_name));
    }

    let canon_root = plugins_root
        .canonicalize()
        .map_err(|e| format!("无法解析插件根目录: {}", e))?;
    let canon_plugin_dir = plugin_dir
        .canonicalize()
        .map_err(|e| format!("无法解析插件目录: {}", e))?;
    if canon_plugin_dir == canon_root || !canon_plugin_dir.starts_with(&canon_root) {
        return Err("拒绝删除插件根目录之外的路径".to_string());
    }

    fs::remove_dir_all(&canon_plugin_dir)
        .map_err(|e| format!("删除插件目录失败 ({}): {}", dir_name, e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_temp_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("justapi_plugin_test_{}_{}", label, nanos));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn scans_empty_or_nonexistent_dir_gracefully() {
        let missing = std::env::temp_dir().join("justapi_nonexistent_plugins_dir_xyz");
        assert!(scan_plugins_in_dir("project", &missing).is_empty());

        let empty = make_temp_dir("empty");
        assert!(scan_plugins_in_dir("project", &empty).is_empty());
        let _ = fs::remove_dir_all(empty);
    }

    #[test]
    fn scaffolds_discovers_and_reads_assets() {
        let root = make_temp_dir("scaffold");
        let plugins_root = root.join(".justapi").join("plugins");

        let created = scaffold_example_plugin(&plugins_root).unwrap();
        assert!(created.exists());

        let result = discover_all_plugins(None, Some(&plugins_root));
        assert_eq!(result.plugins.len(), 1);
        let first = &result.plugins[0];
        assert_eq!(first.scope, "project");
        assert_eq!(first.error, None);
        assert_eq!(
            first.manifest.as_ref().unwrap().id,
            "example.request-tagger"
        );

        let assets =
            read_plugin_assets_from_root("project", &plugins_root, &first.dir_name).unwrap();
        assert_eq!(assets.id, "example.request-tagger");
        assert!(assets.script_code.contains("activate"));
        assert!(assets
            .style_code
            .as_deref()
            .unwrap_or("")
            .contains("justapi-example-plugin-panel"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_path_traversal_and_invalid_extensions() {
        let root = make_temp_dir("security");
        let plugins_root = root.join(".justapi").join("plugins");
        let bad_dir = plugins_root.join("evil");
        fs::create_dir_all(&bad_dir).unwrap();
        fs::write(root.join("secret.mjs"), "console.log('leak')").unwrap();

        fs::write(
            bad_dir.join("manifest.json"),
            r#"{
              "id": "evil.plugin",
              "name": "Evil",
              "version": "1.0.0",
              "entry": "../../secret.mjs"
            }"#,
        )
        .unwrap();

        let scanned = scan_plugins_in_dir("project", &plugins_root);
        assert_eq!(scanned.len(), 1);
        assert!(scanned[0].error.is_some());

        let traversal_dir = read_plugin_assets_from_root("project", &plugins_root, "../evil");
        assert!(traversal_dir.is_err());

        let traversal_entry = read_plugin_assets_from_root("project", &plugins_root, "evil");
        assert!(traversal_entry.is_err());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn flags_duplicate_plugin_ids_in_same_scope() {
        let root = make_temp_dir("dup");
        let plugins_root = root.join("plugins");

        for folder in ["copy-a", "copy-b"] {
            let dir = plugins_root.join(folder);
            fs::create_dir_all(&dir).unwrap();
            fs::write(dir.join("index.mjs"), "export function activate() {}").unwrap();
            fs::write(
                dir.join("manifest.json"),
                r#"{
                  "id": "same.id",
                  "name": "Dup",
                  "version": "1.0.0",
                  "entry": "index.mjs"
                }"#,
            )
            .unwrap();
        }

        let scanned = scan_plugins_in_dir("global", &plugins_root);
        assert_eq!(scanned.len(), 2);
        assert!(scanned[0].error.is_none());
        assert!(scanned[1]
            .error
            .as_deref()
            .unwrap_or("")
            .contains("重复的插件 ID"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn bundled_plugins_discover_and_read_cleanly() {
        let result = discover_all_plugins_with_bundled(None, None, None, true);
        let ids: Vec<String> = result
            .plugins
            .iter()
            .filter_map(|p| p.manifest.as_ref().map(|m| m.id.clone()))
            .collect();
        assert!(ids.contains(&"justapi.curl".to_string()));
        assert!(ids.contains(&"justapi.assertions".to_string()));
        assert!(ids.contains(&"justapi.swagger".to_string()));

        for plugin in &result.plugins {
            assert_eq!(plugin.scope, "bundled");
            assert_eq!(plugin.error, None);
        }

        let curl_assets = read_bundled_plugin_assets("curl").unwrap();
        assert_eq!(curl_assets.id, "justapi.curl");
        assert!(curl_assets.script_code.contains("parseCurlCommand"));

        let assertions_assets = read_bundled_plugin_assets("assertions").unwrap();
        assert_eq!(assertions_assets.id, "justapi.assertions");
        assert!(assertions_assets.script_code.contains("evaluateAssertions"));
        assert!(assertions_assets
            .style_code
            .as_deref()
            .unwrap_or("")
            .contains("assertions-badge-pass"));

        let swagger_assets = read_bundled_plugin_assets("swagger").unwrap();
        assert_eq!(swagger_assets.id, "justapi.swagger");
        assert!(swagger_assets.script_code.contains("parseOpenApiDocument"));
    }

    #[test]
    fn removes_plugin_dir_cleanly_and_protects_invalid_paths() {
        let root = make_temp_dir("remove");
        let plugins_root = root.join(".justapi").join("plugins");

        // 1. 生成并移除插件目录
        let created = scaffold_example_plugin(&plugins_root).unwrap();
        assert!(created.exists());
        assert_eq!(scan_plugins_in_dir("project", &plugins_root).len(), 1);

        remove_plugin_from_root(&plugins_root, "example-request-tagger").unwrap();
        assert!(!created.exists());
        assert!(scan_plugins_in_dir("project", &plugins_root).is_empty());

        // 2. 再次移除不存在的插件与非法目录名应报错
        assert!(remove_plugin_from_root(&plugins_root, "example-request-tagger").is_err());
        assert!(remove_plugin_from_root(&plugins_root, "../escape").is_err());
        assert!(remove_plugin_from_root(&plugins_root, ".hidden").is_err());

        // 3. 若插件目录为指向外部目标的软链接，移除时仅取消链接而不删除原目标目录内容
        #[cfg(unix)]
        {
            let external_target = root.join("external_repo_keep");
            fs::create_dir_all(&external_target).unwrap();
            fs::write(external_target.join("keep.txt"), "important").unwrap();
            let link_path = plugins_root.join("linked-dev-plugin");
            std::os::unix::fs::symlink(&external_target, &link_path).unwrap();

            remove_plugin_from_root(&plugins_root, "linked-dev-plugin").unwrap();
            assert!(fs::symlink_metadata(&link_path).is_err());
            assert!(external_target.join("keep.txt").exists());
        }

        let _ = fs::remove_dir_all(root);
    }
}

