//! Тонкий слой интерфейса: приём и выдача.
//! Команды возвращают полностью собранные агрегаты, готовые к использованию.

pub mod health;
pub mod identity;
pub mod ktp;
pub mod tup;

use tauri::Manager;

/// Состояние приложения: пул соединений асинхронной БД.
pub struct AppState {
    pub pool: sqlx::SqlitePool,
}

/// Регистрирует все команды приложения.
pub fn register<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
) -> tauri::Builder<R> {
    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let db_path = dir.join("vector.db");

            let pool = tauri::async_runtime::block_on(crate::db::connect(&db_path))?;

            app.manage(AppState { pool });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            health::health,
            identity::get_school_state,
            identity::onboard_school,
            identity::save_school,
            identity::save_staff,
            identity::deactivate_staff,
            identity::save_profile,
            identity::save_class,
            identity::delete_class,
            tup::list_tup_documents,
            tup::list_objectives,
            tup::get_tup_document,
            tup::import_tup,
            tup::import_tup_json,
            tup::reimport_tup,
            tup::search_tup,
            tup::save_file,
            tup::read_file_text,
            ktp::get_rk_calendar_defaults,
            ktp::list_ktp_plans,
            ktp::generate_ktp_from_tup,
            ktp::update_ktp_schedule,
            ktp::validate_ktp_invariants,
            ktp::get_ktp_plan,
            ktp::save_ktp_plan
        ])
}
