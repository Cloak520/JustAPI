// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "windows")]
    unsafe {
        // SAFETY: 在程序入口单线程阶段（main 开始执行时）设置环境变量，
        // 此时尚未创建任何多线程或拉起 WebView，符合安全要求。
        // 关键：向 WebView2 传递 Chromium 瘦身参数，将 Windows 内存从 180MB 压制到 80MB
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            concat!(
                "--disable-gpu ",                   // 砍掉独立的 GPU 进程（直接节省 40-60MB）
                "--in-process-gpu ",                // 将图形绘制合并入主进程
                "--renderer-process-limit=1 ",      // 严格限制渲染进程数量
                "--disable-background-networking ", // 禁用无用后台网络探测
                "--disable-extensions ",            // 禁用扩展支持
                "--disable-features=AudioServiceOutOfProcess ", // 禁用独立音频进程
                "--js-flags=--max-old-space-size=64" // 限制 V8 JS 堆内存上限
            ),
        );
    }

    justapi_lib::run();
}
