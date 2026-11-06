// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "windows")]
    {
        let low_memory_args = [
            "--js-flags=--max-old-space-size=128",
            "--disable-features=IsolateOrigins,site-per-process,AudioServiceOutOfProcess",
            "--disable-gpu-shader-disk-cache",
            "--disk-cache-size=10485760",
            "--media-cache-size=10485760",
            "--disable-background-networking",
            "--disable-component-update",
            "--disable-default-apps",
            "--disable-extensions",
            "--disable-sync",
        ]
        .join(" ");

        // SAFETY: Called at process startup in main before other threads are spawned.
        unsafe {
            if let Ok(existing) = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS") {
                std::env::set_var(
                    "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                    format!("{} {}", existing, low_memory_args),
                );
            } else {
                std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", low_memory_args);
            }
        }
    }

    justapi_lib::run();
}
