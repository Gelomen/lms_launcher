pub mod config;
pub mod process;

pub fn exe_dir() -> std::path::PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| std::path::PathBuf::from("src-tauri"))
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::DialogPlugin::init())
        .run()
}
