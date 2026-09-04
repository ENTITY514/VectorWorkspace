//! Проверка выгрузки расписания: строит все срезы в обоих форматах.
//!
//! Запуск: cargo run --bin verify_report -- <копия.db> <каталог-вывода>

use std::path::PathBuf;

use vector_workspace_lib::db;
use vector_workspace_lib::infra::{report_pdf, report_xlsx, schedule_report};
use vector_workspace_lib::infra::schedule_report::ReportScope;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    let (Some(dbp), Some(out)) = (args.get(1), args.get(2)) else {
        eprintln!("использование: verify_report <копия.db> <каталог-вывода>");
        std::process::exit(2);
    };
    let low = dbp.to_lowercase();
    if low.contains("appdata") || low.contains("com.teacher.vectorworkspace") {
        eprintln!("ОТКАЗ: путь ведёт к боевой базе. Работайте с копией.");
        std::process::exit(2);
    }

    let pool = db::connect(&PathBuf::from(dbp)).await?;
    let vid: String = sqlx::query_scalar(
        "SELECT variant_id FROM schedule_slots GROUP BY variant_id ORDER BY COUNT(*) DESC LIMIT 1",
    )
    .fetch_optional(&pool)
    .await?
    .unwrap_or_else(|| "default".to_string());

    let data = schedule_report::load(&pool, &vid).await?;
    println!("вариант   : {vid}");
    println!("уроков    : {}", data.lessons.len());
    println!("классов   : {}", data.non_empty_classes().len());
    println!("учителей  : {}", data.non_empty_teachers().len());
    println!("сетка     : {}x{}", data.grid.days, data.grid.periods_per_day);

    let first_class = data.non_empty_classes().first().map(|(id, _)| id.clone());
    let first_teacher = data.non_empty_teachers().first().map(|(id, _)| id.clone());

    let mut scopes = vec![
        ("all", ReportScope::All),
        ("classes", ReportScope::AllClasses),
        ("teachers", ReportScope::AllTeachers),
    ];
    if let Some(c) = first_class {
        scopes.push(("class-one", ReportScope::Class { id: c }));
    }
    if let Some(t) = first_teacher {
        scopes.push(("teacher-one", ReportScope::Teacher { id: t }));
    }

    std::fs::create_dir_all(out)?;
    println!("\nфайл                              размер");
    for (tag, scope) in &scopes {
        let xlsx = report_xlsx::build(&data, scope)?;
        let xp = format!("{out}/{tag}.xlsx");
        std::fs::write(&xp, &xlsx)?;
        println!("  {:<30} {:>8} Б", format!("{tag}.xlsx"), xlsx.len());

        match report_pdf::build(&data, scope) {
            Ok(pdf) => {
                let pp = format!("{out}/{tag}.pdf");
                std::fs::write(&pp, &pdf)?;
                println!("  {:<30} {:>8} Б", format!("{tag}.pdf"), pdf.len());
            }
            Err(e) => println!("  {tag}.pdf — ОШИБКА: {e}"),
        }
    }
    println!("\nготово: {out}");
    Ok(())
}
