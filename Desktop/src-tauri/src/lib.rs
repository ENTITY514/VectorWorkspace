mod commands;
pub mod db;
pub mod domain;
pub mod infra;

pub use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    commands::register(tauri::Builder::default())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
