//! Проверка разбора Excel-шаблона без записи в базу.
//!
//! Запуск:
//!   cargo run --bin verify_excel -- <книга.xlsx>              # только разбор
//!   cargo run --bin verify_excel -- <книга.xlsx> <копия.db>   # разбор и запись

use std::path::PathBuf;

use vector_workspace_lib::infra::excel_import;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let Some(path) = std::env::args().nth(1) else {
        eprintln!("использование: verify_excel <путь-к-книге.xlsx>");
        std::process::exit(2);
    };
    let preview = excel_import::parse_workbook(&PathBuf::from(&path))?;

    println!("Файл: {path}");
    println!("  кабинетов : {}", preview.rooms.len());
    println!("  учителей  : {}", preview.teachers.len());
    println!("  классов   : {}", preview.classes.len());
    println!("  нагрузка  : {} записей", preview.curriculum.len());

    let with_room = preview.teachers.iter().filter(|t| t.base_room_name.is_some()).count();
    println!("  из учителей с закреплённым кабинетом: {with_room}");
    let joint: std::collections::HashSet<_> =
        preview.curriculum.iter().filter_map(|c| c.joint_lesson_id.as_ref()).collect();
    println!("  joint-групп в нагрузке: {}", joint.len());

    if !preview.problems.is_empty() {
        println!("\nПРОБЛЕМЫ ({}):", preview.problems.len());
        for p in preview.problems.iter().take(15) {
            println!("   • {p}");
        }
        if preview.problems.len() > 15 {
            println!("   ... ещё {}", preview.problems.len() - 15);
        }
    }
    if !preview.warnings.is_empty() {
        println!("\nЗАМЕЧАНИЯ ({}):", preview.warnings.len());
        for w in preview.warnings.iter().take(10) {
            println!("   • {w}");
        }
        if preview.warnings.len() > 10 {
            println!("   ... ещё {}", preview.warnings.len() - 10);
        }
    }
    // Запись только в явно указанную копию базы.
    if let Some(db) = std::env::args().nth(2) {
        let low = db.to_lowercase();
        if low.contains("appdata") || low.contains("com.teacher.vectorworkspace") {
            eprintln!("ОТКАЗ: путь ведёт к боевой базе. Работайте с копией.");
            std::process::exit(2);
        }
        let pool = vector_workspace_lib::db::connect(&PathBuf::from(&db)).await?;
        let mode = if std::env::args().any(|a| a == "--replace") {
            excel_import::ImportMode::Replace
        } else {
            excel_import::ImportMode::Merge
        };
        let summary = excel_import::apply(&pool, &preview, mode).await?;
        println!("
Записано в {db}:");
        println!("  кабинетов : {}", summary.rooms);
        println!("  учителей  : {}", summary.teachers);
        println!("  классов   : {}", summary.classes);
        println!("  предметов : {}", summary.subjects);
        println!("  нагрузка  : {}", summary.curriculum);
        println!("  пропущено : {}", summary.skipped);
        if mode == excel_import::ImportMode::Replace {
            println!("  удалено   : классов {}, учителей {}, кабинетов {}, предметов {}",
                summary.removed_classes, summary.removed_teachers,
                summary.removed_rooms, summary.removed_subjects);
        }
    }
    Ok(())
}
