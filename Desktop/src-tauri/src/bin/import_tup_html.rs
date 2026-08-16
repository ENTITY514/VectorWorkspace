//! Импорт ТУП из JSON (экспорт HTML-парсера, `tup_all_subjects_html.json`) в SQLite.
//!
//! Запуск:
//!   cargo run --bin import_tup_html -- <входной.json> <путь_к_базе.db>
//! База открывается/создаётся, миграции накатываются, документы записываются
//! транзакционно. Повторный запуск не затирает уже импортированные документы
//! (ключ дедупликации: subject_id × target_grades × direction × appendix_number).

use std::path::PathBuf;

use vector_workspace_lib::db;
use vector_workspace_lib::infra::tup_import::import_from_json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("Использование: cargo run --bin import_tup_html -- <входной.json> <путь_к_базе.db>");
        std::process::exit(2);
    }
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
    let pool = db::connect(&db_path).await?;
    println!("База готова: {}", db_path.display());

    let (imported, skipped) = import_from_json(&pool, &text).await?;
    println!("\nИмпортировано документов: {}, пропущено (уже в БД): {}", imported.len(), skipped);

    for report in &imported {
        println!(
            "  {} {} ({} целей)",
            report.subject_id, report.target_grades, report.objectives_imported
        );
    }
    Ok(())
}
