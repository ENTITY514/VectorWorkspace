//! Тонкий слой интерфейса: приём и выдача.
//! Команды возвращают полностью собранные агрегаты, готовые к использованию.

pub mod health;
pub mod identity;
pub mod ktp;
pub mod schedule;
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

            tup::read_file_text,
            ktp::get_rk_calendar_defaults,
            ktp::list_ktp_plans,
            ktp::generate_ktp_from_tup,
            ktp::update_ktp_schedule,
            ktp::validate_ktp_invariants,
            ktp::get_ktp_plan,
            ktp::save_ktp_plan,
            schedule::schedule_get_state,
            schedule::schedule_upsert_teacher,
            schedule::schedule_delete_teacher,
            schedule::schedule_upsert_room,
            schedule::schedule_delete_room,
            schedule::schedule_upsert_class,
            schedule::schedule_delete_class,
            schedule::schedule_upsert_subject,
            schedule::schedule_delete_subject,
            schedule::schedule_upsert_subgroup_rule,
            schedule::schedule_set_curriculum,
            schedule::schedule_set_weights,
            schedule::schedule_clear_slots,
            schedule::schedule_get_slots,
            schedule::schedule_generate,
            schedule::schedule_export,
            schedule::schedule_import_legacy,
            schedule::schedule_get_legacy,
            schedule::schedule_list_variants,
            schedule::schedule_create_variant,
            schedule::schedule_set_active_variant,
            schedule::schedule_delete_variant,
            schedule::schedule_get_slots_for_variant,
            schedule::schedule_port_quarter,
            schedule::schedule_pin_slot,
            schedule::schedule_unpin_slot,
            schedule::schedule_get_fixed_slots,
            schedule::schedule_toggle_joint_lessons
        ])
}
