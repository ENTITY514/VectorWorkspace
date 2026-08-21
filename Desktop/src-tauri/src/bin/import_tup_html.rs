//! Импорт ТУП из JSON (экспорт HTML-парсера, `tup_all_subjects_html.json`) в SQLite.
//!
//! Запуск:
//!   cargo run --bin import_tup_html -- <входной.json> <путь_к_базе.db>
//!   cargo run --bin import_tup_html -- --reimport <ru.json> <kz.json> <путь_к_базе.db>
//! База открывается/создаётся, миграции накатываются, документы записываются
//! транзакционно. Повторный запуск не затирает уже импортированные документы
//! (ключ дедупликации: subject_id × target_grades × direction × appendix_number
//! × language).
//! Режим `--reimport` очищает все ТУП-таблицы и заливает оба файла (русскую и
//! казахскую версии) заново; перед очисткой создаётся резервная копия БД.

use std::path::PathBuf;

use vector_workspace_lib::db;
use vector_workspace_lib::infra::tup_import::{import_from_json, reimport_from_json};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();

    let reimport_mode = args.len() >= 2 && args[1] == "--reimport";
    let required = if reimport_mode { 5 } else { 3 };
    if args.len() < required {
        eprintln!(
            "Использование:\n  cargo run --bin import_tup_html -- <входной.json> <путь_к_базе.db>\n  cargo run --bin import_tup_html -- --reimport <ru.json> <kz.json> <путь_к_базе.db>"
        );
        std::process::exit(2);
    }

    let pool;
    if reimport_mode {
        let ru_path = PathBuf::from(&args[2]);
        let kz_path = PathBuf::from(&args[3]);
        let db_path = PathBuf::from(&args[4]);

        let ru_text = std::fs::read_to_string(&ru_path)?;
        let kz_text = std::fs::read_to_string(&kz_path)?;
        let ru_total = serde_json::from_str::<serde_json::Value>(&ru_text)?["total_documents"]
            .as_u64()
            .unwrap_or(0);
        let kz_total = serde_json::from_str::<serde_json::Value>(&kz_text)?["total_documents"]
            .as_u64()
            .unwrap_or(0);

        // Точка возврата перед очисткой ТУП-таблиц.
        db::backup_database(&db_path).await?;
        println!("Резервная копия БД создана перед переимпортом.");

        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        pool = db::connect(&db_path).await?;
        println!("База готова: {}", db_path.display());
        println!(
            "Пакетный переимпорт: RU={} док, KZ={} док",
            ru_total, kz_total
        );

        let (imported, skipped) = reimport_from_json(&pool, &[&ru_text, &kz_text]).await?;
        println!(
            "\nИмпортировано документов: {}, пропущено: {}",
            imported.len(),
            skipped
        );
        for report in &imported {
            println!(
                "  {} {} ({} целей)",
                report.subject_id, report.target_grades, report.objectives_imported
            );
        }
    } else {
        let input = PathBuf::from(&args[1]);
        let db_path = PathBuf::from(&args[2]);

        let text = std::fs::read_to_string(&input)?;
        let export: serde_json::Value = serde_json::from_str(&text)?;
        let total = export["total_documents"].as_u64().unwrap_or(0);
        let total_objs = export["total_objectives"].as_u64().unwrap_or(0);
        println!(
            "Чтение JSON: {} (документов: {}, целей: {})",
            input.display(),
            total,
            total_objs
        );

        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        pool = db::connect(&db_path).await?;
        println!("База готова: {}", db_path.display());

        let (imported, skipped) = import_from_json(&pool, &text).await?;
        println!(
            "\nИмпортировано документов: {}, пропущено (уже в БД): {}",
            imported.len(),
            skipped
        );

        for report in &imported {
            println!(
                "  {} {} ({} целей)",
                report.subject_id, report.target_grades, report.objectives_imported
            );
        }
    }
    Ok(())
}
